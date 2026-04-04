import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Flex, InputNumber, Modal, Segmented, Slider, Space, Typography } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { clearAllJobs } from '../lib/idb/db'
import { formatBytes } from '../lib/formatBytes'
import {
  clampGifMaxUploadBytes,
  clampImageMaxUploadBytes,
  clampVideoMaxUploadBytes,
  DEFAULT_IMAGE_MAX_UPLOAD_BYTES,
  DEFAULT_GIF_MAX_UPLOAD_BYTES,
  DEFAULT_VIDEO_MAX_UPLOAD_BYTES,
  readGifMaxUploadBytes,
  readImageMaxUploadBytes,
  readVideoMaxUploadBytes,
  writeGifMaxUploadBytes,
  writeImageMaxUploadBytes,
  writeVideoMaxUploadBytes,
} from '../lib/fileUploadLimitSettings'
import {
  DEFAULT_IMAGE_MIN_QUALITY_PERCENT,
  IMAGE_MIN_QUALITY_MAX_PCT,
  IMAGE_MIN_QUALITY_MIN_PCT,
  readImageMinQualityPercent,
  writeImageMinQualityPercent,
} from '../lib/imageCompressSettings'
import styles from './SettingsPage.module.css'

const MB = 1024 * 1024
const GB = 1024 * 1024 * 1024

type SizeUnit = 'mb' | 'gb'

const IMAGE_BYTES_MIN = clampImageMaxUploadBytes(1)
const IMAGE_BYTES_MAX = clampImageMaxUploadBytes(Number.MAX_SAFE_INTEGER)
const GIF_BYTES_MIN = clampGifMaxUploadBytes(1)
const GIF_BYTES_MAX = clampGifMaxUploadBytes(Number.MAX_SAFE_INTEGER)
const VIDEO_BYTES_MIN = clampVideoMaxUploadBytes(1)
const VIDEO_BYTES_MAX = clampVideoMaxUploadBytes(Number.MAX_SAFE_INTEGER)

function defaultUnit(bytes: number): SizeUnit {
  return bytes >= GB ? 'gb' : 'mb'
}

function bytesToInput(bytes: number, unit: SizeUnit): number {
  return unit === 'mb' ? bytes / MB : bytes / GB
}

function inputToBytes(value: number, unit: SizeUnit): number {
  return unit === 'mb' ? value * MB : value * GB
}

const { Title, Paragraph, Text } = Typography

export function SettingsPage() {
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>({})
  const [cleared, setCleared] = useState(false)
  const [imageMinQualityPct, setImageMinQualityPct] = useState(() => readImageMinQualityPercent())
  const [imageUnit, setImageUnit] = useState<SizeUnit>(() => defaultUnit(readImageMaxUploadBytes()))
  const [imageInput, setImageInput] = useState<number | null>(() =>
    bytesToInput(readImageMaxUploadBytes(), defaultUnit(readImageMaxUploadBytes())),
  )
  const [gifUnit, setGifUnit] = useState<SizeUnit>(() => defaultUnit(readGifMaxUploadBytes()))
  const [gifInput, setGifInput] = useState<number | null>(() =>
    bytesToInput(readGifMaxUploadBytes(), defaultUnit(readGifMaxUploadBytes())),
  )
  const [videoUnit, setVideoUnit] = useState<SizeUnit>(() => defaultUnit(readVideoMaxUploadBytes()))
  const [videoInput, setVideoInput] = useState<number | null>(() =>
    bytesToInput(readVideoMaxUploadBytes(), defaultUnit(readVideoMaxUploadBytes())),
  )

  const refreshEstimate = useCallback(async () => {
    if (!navigator.storage?.estimate) {
      setUsage({})
      return
    }
    const est = await navigator.storage.estimate()
    setUsage({ usage: est.usage, quota: est.quota })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!navigator.storage?.estimate) {
        if (!cancelled) setUsage({})
        return
      }
      const est = await navigator.storage.estimate()
      if (!cancelled) {
        setUsage({ usage: est.usage, quota: est.quota })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onClearHistory = () => {
    Modal.confirm({
      title: '清空本地历史？',
      content: '将删除全部历史条目（含缩略图元数据），此操作不可撤销。',
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await clearAllJobs()
        setCleared(true)
        void refreshEstimate()
        setTimeout(() => setCleared(false), 4000)
      },
    })
  }

  return (
    <div className={styles.page}>
      <Title level={2} style={{ marginBottom: 24 }}>
        设置与隐私
      </Title>

      <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 640 }}>
        <Card title="图片压缩 · 最低质量" size="small">
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            智能压缩的二分下界、手动调节滑块的最小值，以及「未达目标体积」时输出的有损编码，均不会低于此处设定。默认{' '}
            {DEFAULT_IMAGE_MIN_QUALITY_PERCENT}%，保存在本机浏览器。
          </Paragraph>
          <Flex align="center" gap={16} wrap>
            <Slider
              style={{ flex: 1, minWidth: 200, maxWidth: 400 }}
              min={IMAGE_MIN_QUALITY_MIN_PCT}
              max={IMAGE_MIN_QUALITY_MAX_PCT}
              value={imageMinQualityPct}
              onChange={(v) => {
                setImageMinQualityPct(v)
                writeImageMinQualityPercent(v)
              }}
              marks={{
                [IMAGE_MIN_QUALITY_MIN_PCT]: `${IMAGE_MIN_QUALITY_MIN_PCT}%`,
                [DEFAULT_IMAGE_MIN_QUALITY_PERCENT]: `${DEFAULT_IMAGE_MIN_QUALITY_PERCENT}%`,
                [IMAGE_MIN_QUALITY_MAX_PCT]: `${IMAGE_MIN_QUALITY_MAX_PCT}%`,
              }}
            />
            <Text strong style={{ minWidth: 48 }}>{imageMinQualityPct}%</Text>
          </Flex>
        </Card>

        <Card title="上传 · 单文件体积上限" size="small">
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            首页拖入或选择文件时的体积校验与提示文案均与此处一致，保存在本机浏览器。默认：静态图{' '}
            {DEFAULT_IMAGE_MAX_UPLOAD_BYTES / MB} MB、GIF {DEFAULT_GIF_MAX_UPLOAD_BYTES / MB} MB、视频{' '}
            {DEFAULT_VIDEO_MAX_UPLOAD_BYTES / GB} GB。
          </Paragraph>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                静态图片（JPG / PNG / WebP / AVIF 等）
              </Text>
              <Flex align="center" gap={12} wrap>
                <Space.Compact style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={bytesToInput(IMAGE_BYTES_MIN, imageUnit)}
                    max={bytesToInput(IMAGE_BYTES_MAX, imageUnit)}
                    step={imageUnit === 'mb' ? 1 : 0.001}
                    precision={imageUnit === 'mb' ? 0 : 3}
                    value={imageInput ?? undefined}
                    onChange={(v) => {
                      if (v == null || !Number.isFinite(v)) {
                        setImageInput(null)
                        return
                      }
                      const clamped = clampImageMaxUploadBytes(inputToBytes(v, imageUnit))
                      writeImageMaxUploadBytes(clamped)
                      setImageInput(bytesToInput(clamped, imageUnit))
                    }}
                    onBlur={() => {
                      if (imageInput == null) {
                        const b = readImageMaxUploadBytes()
                        setImageInput(bytesToInput(b, imageUnit))
                      }
                    }}
                  />
                  <Segmented<SizeUnit>
                    value={imageUnit}
                    onChange={(u) => {
                      const b = readImageMaxUploadBytes()
                      setImageUnit(u)
                      setImageInput(bytesToInput(b, u))
                    }}
                    options={[
                      { label: 'MB', value: 'mb' },
                      { label: 'GB', value: 'gb' },
                    ]}
                  />
                </Space.Compact>
              </Flex>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                有效约 {formatBytes(IMAGE_BYTES_MIN)}～{formatBytes(IMAGE_BYTES_MAX)}（保存时自动对齐到允许范围）
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                GIF 动图
              </Text>
              <Flex align="center" gap={12} wrap>
                <Space.Compact style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={bytesToInput(GIF_BYTES_MIN, gifUnit)}
                    max={bytesToInput(GIF_BYTES_MAX, gifUnit)}
                    step={gifUnit === 'mb' ? 1 : 0.01}
                    precision={gifUnit === 'mb' ? 0 : 2}
                    value={gifInput ?? undefined}
                    onChange={(v) => {
                      if (v == null || !Number.isFinite(v)) {
                        setGifInput(null)
                        return
                      }
                      const clamped = clampGifMaxUploadBytes(inputToBytes(v, gifUnit))
                      writeGifMaxUploadBytes(clamped)
                      setGifInput(bytesToInput(clamped, gifUnit))
                    }}
                    onBlur={() => {
                      if (gifInput == null) {
                        const b = readGifMaxUploadBytes()
                        setGifInput(bytesToInput(b, gifUnit))
                      }
                    }}
                  />
                  <Segmented<SizeUnit>
                    value={gifUnit}
                    onChange={(u) => {
                      const b = readGifMaxUploadBytes()
                      setGifUnit(u)
                      setGifInput(bytesToInput(b, u))
                    }}
                    options={[
                      { label: 'MB', value: 'mb' },
                      { label: 'GB', value: 'gb' },
                    ]}
                  />
                </Space.Compact>
              </Flex>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                有效约 {formatBytes(GIF_BYTES_MIN)}～{formatBytes(GIF_BYTES_MAX)}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                视频
              </Text>
              <Flex align="center" gap={12} wrap>
                <Space.Compact style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={bytesToInput(VIDEO_BYTES_MIN, videoUnit)}
                    max={bytesToInput(VIDEO_BYTES_MAX, videoUnit)}
                    step={videoUnit === 'mb' ? 1 : 0.1}
                    precision={videoUnit === 'mb' ? 0 : 1}
                    value={videoInput ?? undefined}
                    onChange={(v) => {
                      if (v == null || !Number.isFinite(v)) {
                        setVideoInput(null)
                        return
                      }
                      const clamped = clampVideoMaxUploadBytes(inputToBytes(v, videoUnit))
                      writeVideoMaxUploadBytes(clamped)
                      setVideoInput(bytesToInput(clamped, videoUnit))
                    }}
                    onBlur={() => {
                      if (videoInput == null) {
                        const b = readVideoMaxUploadBytes()
                        setVideoInput(bytesToInput(b, videoUnit))
                      }
                    }}
                  />
                  <Segmented<SizeUnit>
                    value={videoUnit}
                    onChange={(u) => {
                      const b = readVideoMaxUploadBytes()
                      setVideoUnit(u)
                      setVideoInput(bytesToInput(b, u))
                    }}
                    options={[
                      { label: 'MB', value: 'mb' },
                      { label: 'GB', value: 'gb' },
                    ]}
                  />
                </Space.Compact>
              </Flex>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                有效约 {formatBytes(VIDEO_BYTES_MIN)}～{formatBytes(VIDEO_BYTES_MAX)}
              </Text>
            </div>
          </Space>
        </Card>

        <Card title="数据如何存放" size="small">
          <ul className={styles.list}>
            <li>
              压缩任务在<strong>专用 Web Worker</strong>中执行，避免拖慢界面。
            </li>
            <li>
              历史记录保存在浏览器 <strong>IndexedDB</strong>（域名隔离），不会发送到我们的服务器——本项目<strong>没有后端接口</strong>。
            </li>
            <li>
              GIF / 视频使用 FFmpeg.wasm，核心文件从 CDN 拉取后缓存在本地；编解码仍在您的浏览器内完成。
            </li>
            <li>
              「100% 隐私」指处理与元数据不上传；您设备上的恶意软件、同步盘或浏览器扩展仍可能访问本地文件，这是任何纯前端工具的共同边界。
            </li>
          </ul>
        </Card>

        <Card title="本站点存储占用（估算）" size="small">
          {usage.usage != null && usage.quota != null ? (
            <Paragraph>
              已用约 <Text strong>{formatBytes(usage.usage)}</Text> / 配额约{' '}
              <Text strong>{formatBytes(usage.quota)}</Text>
              <Text type="secondary">（含本站 IndexedDB 与其他同源存储）</Text>
            </Paragraph>
          ) : (
            <Paragraph type="secondary">当前浏览器未提供 storage.estimate，或仅在安全上下文中可用。</Paragraph>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => void refreshEstimate()}>
            刷新估算
          </Button>
        </Card>

        <Card title="数据控制" size="small">
          <Paragraph type="secondary">一键删除 IndexedDB 中的全部历史条目（含缩略图元数据）。</Paragraph>
          <Button danger icon={<DeleteOutlined />} onClick={onClearHistory}>
            清空本地历史
          </Button>
          {cleared && (
            <Paragraph type="success" style={{ marginTop: 12, marginBottom: 0 }}>
              已清空。
            </Paragraph>
          )}
        </Card>
      </Space>
    </div>
  )
}
