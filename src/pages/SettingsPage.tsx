import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Flex, Modal, Slider, Space, Typography } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { clearAllJobs } from '../lib/idb/db'
import { formatBytes } from '../lib/formatBytes'
import {
  DEFAULT_IMAGE_MIN_QUALITY_PERCENT,
  IMAGE_MIN_QUALITY_MAX_PCT,
  IMAGE_MIN_QUALITY_MIN_PCT,
  readImageMinQualityPercent,
  writeImageMinQualityPercent,
} from '../lib/imageCompressSettings'
import styles from './SettingsPage.module.css'

const { Title, Paragraph, Text } = Typography

export function SettingsPage() {
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>({})
  const [cleared, setCleared] = useState(false)
  const [imageMinQualityPct, setImageMinQualityPct] = useState(() => readImageMinQualityPercent())

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
