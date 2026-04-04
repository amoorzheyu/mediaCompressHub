import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Flex,
  InputNumber,
  Progress,
  Select,
  Slider,
  Space,
  Tabs,
  Typography,
  Upload,
} from 'antd'
import { DeleteOutlined, DownloadOutlined, InboxOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { runImageCompress } from '../lib/compress/imageWorkerClient'
import { preloadFfmpeg, runFfmpegCompress } from '../lib/compress/ffmpegWorkerClient'
import { addJob } from '../lib/idb/db'
import { makeThumbnailBlob } from '../lib/thumbnail'
import { formatBytes } from '../lib/formatBytes'
import { resolveEncodeFormat } from '../lib/resolveImageFormat'
import type { ImageEncodeFormat, ImageFormatPreference } from '../types/compress'
import styles from './HomePage.module.css'

function classifyFile(file: File): 'image' | 'gif' | 'video' {
  if (file.type === 'image/gif') return 'gif'
  if (file.type.startsWith('video/')) return 'video'
  return 'image'
}

function kindLabel(kind: 'image' | 'gif' | 'video'): string {
  if (kind === 'gif') return 'GIF'
  if (kind === 'video') return '视频'
  return '静态图片'
}

type TabId = 'image' | 'gif' | 'video'

const TAB_STORAGE_KEY = 'media-compress-hub:last-tab'

const TABS: { id: TabId; label: string }[] = [
  { id: 'image', label: '图片' },
  { id: 'gif', label: 'GIF' },
  { id: 'video', label: '视频' },
]

function isTabId(v: string | null): v is TabId {
  return v === 'image' || v === 'gif' || v === 'video'
}

function readStoredTab(): TabId {
  try {
    const v = localStorage.getItem(TAB_STORAGE_KEY)
    if (isTabId(v)) return v
  } catch {
    /* 隐私模式等 */
  }
  return 'image'
}

function persistTab(t: TabId) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, t)
  } catch {
    /* ignore */
  }
}

function acceptForTab(tab: TabId): string {
  if (tab === 'image') {
    return 'image/jpeg,image/png,image/webp,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.bmp,.avif'
  }
  if (tab === 'gif') return 'image/gif,.gif'
  return 'video/*'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const { Text, Title, Paragraph, Link } = Typography

function encodeFormatLabel(f: ImageEncodeFormat): string {
  if (f === 'jpeg') return 'JPG / JPEG（.jpg）'
  if (f === 'png') return 'PNG（.png）'
  return 'WebP（.webp）'
}

export function HomePage() {
  const [format, setFormat] = useState<ImageFormatPreference>('original')
  const [quality, setQuality] = useState(0.82)
  const [maxWidth, setMaxWidth] = useState(1920)
  const [crf, setCrf] = useState(28)
  const [scaleWidth, setScaleWidth] = useState(720)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultName, setResultName] = useState('')
  const [lastStats, setLastStats] = useState<{
    inBytes: number
    outBytes: number
    inName: string
  } | null>(null)
  const [ffmpegReady, setFfmpegReady] = useState(false)
  const [ffmpegLoading, setFfmpegLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [activeTab, setActiveTabState] = useState<TabId>(() => readStoredTab())

  const setTab = useCallback((t: TabId) => {
    setActiveTabState(t)
    persistTab(t)
  }, [])

  const fileKind = selectedFile ? classifyFile(selectedFile) : null
  const tabFileMismatch = Boolean(selectedFile && fileKind && fileKind !== activeTab)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const setPreviewForBlob = useCallback((blob: Blob | null) => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return blob ? URL.createObjectURL(blob) : null
    })
  }, [])

  const handlePreloadFfmpeg = useCallback(async () => {
    setFfmpegLoading(true)
    setError(null)
    try {
      await preloadFfmpeg()
      setFfmpegReady(true)
      setStatusText('FFmpeg 已就绪（仍仅在本地运行）')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFfmpegLoading(false)
    }
  }, [])

  const pickFile = useCallback(
    (file: File) => {
      const detected = classifyFile(file)
      setTab(detected)
      setSelectedFile(file)
      setError(null)
      setStatusText('')
      setResultBlob(null)
      setResultName('')
      setPreviewForBlob(null)
      setLastStats(null)
      setProgress(0)
    },
    [setPreviewForBlob, setTab],
  )

  const clearSelection = useCallback(() => {
    if (busy) return
    setSelectedFile(null)
    setError(null)
    setStatusText('')
  }, [busy])

  const processFile = useCallback(
    async (file: File) => {
      setError(null)
      setBusy(true)
      setProgress(0)
      setStatusText('读取文件…')
      setResultBlob(null)
      setResultName('')
      setPreviewForBlob(null)
      setLastStats(null)

      const jobId = crypto.randomUUID()
      const kind = classifyFile(file)
      const inBytes = file.size

      try {
        const buf = await file.arrayBuffer()

        if (kind === 'image') {
          if (!file.type.startsWith('image/')) {
            throw new Error('不支持的图片类型，请使用常见位图格式')
          }
          const encodeFormat = resolveEncodeFormat(format, file)
          setStatusText('在后台 Worker 中压缩图片…')
          const out = await runImageCompress(
            jobId,
            buf,
            file.type || 'image/jpeg',
            {
              format: encodeFormat,
              quality,
              maxWidth: maxWidth > 0 ? maxWidth : undefined,
            },
            setProgress,
          )
          const blob = new Blob([out.buffer], { type: out.outputMime })
          const base = file.name.replace(/\.[^.]+$/, '')
          const ext =
            out.outputMime === 'image/jpeg'
              ? '.jpg'
              : out.outputMime === 'image/webp'
                ? '.webp'
                : '.png'
          const name = `${base}-compressed${ext}`
          setResultBlob(blob)
          setResultName(name)
          setPreviewForBlob(blob)
          setLastStats({ inBytes, outBytes: blob.size, inName: file.name })
          setProgress(100)
          setStatusText('完成（未上传任何数据）')

          const thumb = await makeThumbnailBlob(blob)
          await addJob({
            id: jobId,
            createdAt: Date.now(),
            kind: 'image',
            inputName: file.name,
            inputMime: file.type,
            inputBytes: inBytes,
            outputMime: out.outputMime,
            outputBytes: blob.size,
            ratio: inBytes ? 1 - blob.size / inBytes : 0,
            status: 'done',
            width: out.width,
            height: out.height,
            thumbnailBlob: thumb,
          })
          return
        }

        if (!ffmpegReady) {
          setStatusText('正在加载 FFmpeg（首次需联网拉取核心，仅一次）…')
          await preloadFfmpeg()
          setFfmpegReady(true)
        }

        setStatusText(kind === 'gif' ? '在 Worker 中处理 GIF…' : '在 Worker 中压缩视频（无音轨以减小体积）…')
        const out = await runFfmpegCompress(
          jobId,
          buf,
          file.name,
          kind === 'gif' ? 'gif' : 'video',
          crf,
          scaleWidth,
          setProgress,
        )
        const blob = new Blob([out.buffer], { type: out.outputMime })
        setResultBlob(blob)
        setResultName(out.outputFileName)
        setPreviewForBlob(blob)
        setLastStats({ inBytes, outBytes: blob.size, inName: file.name })
        setProgress(100)
        setStatusText('完成（未上传任何数据）')

        const thumb =
          kind === 'gif' ? await makeThumbnailBlob(new Blob([out.buffer], { type: 'image/gif' })) : undefined
        await addJob({
          id: jobId,
          createdAt: Date.now(),
          kind,
          inputName: file.name,
          inputMime: file.type,
          inputBytes: inBytes,
          outputMime: out.outputMime,
          outputBytes: blob.size,
          ratio: inBytes ? 1 - blob.size / inBytes : 0,
          status: 'done',
          thumbnailBlob: thumb,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
        setStatusText('')
        await addJob({
          id: jobId,
          createdAt: Date.now(),
          kind: kind === 'image' ? 'image' : kind === 'gif' ? 'gif' : 'video',
          inputName: file.name,
          inputMime: file.type,
          inputBytes: inBytes,
          outputMime: '',
          outputBytes: 0,
          ratio: 0,
          status: 'error',
          errorMessage: message,
        })
      } finally {
        setBusy(false)
      }
    },
    [crf, ffmpegReady, format, maxWidth, quality, scaleWidth, setPreviewForBlob],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (f) pickFile(f)
    },
    [pickFile],
  )

  const uploadProps: UploadProps = useMemo(
    () => ({
      accept: acceptForTab(activeTab),
      showUploadList: false,
      multiple: false,
      disabled: busy,
      beforeUpload: (file) => {
        pickFile(file)
        return false
      },
    }),
    [activeTab, busy, pickFile],
  )

  const onStartCompress = useCallback(() => {
    if (!selectedFile || busy) return
    const k = classifyFile(selectedFile)
    if (k !== activeTab) setTab(k)
    void processFile(selectedFile)
  }, [activeTab, busy, processFile, selectedFile, setTab])

  const tabItems = useMemo(
    () =>
      TABS.map((t) => ({
        key: t.id,
        label: t.label,
        disabled: busy,
      })),
    [busy],
  )

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroBadge}>
          <span className={styles.shield} aria-hidden>
            ⬡
          </span>
          纯本地 · 浏览器内处理
        </div>
        <h1 id="hero-title" className={styles.title}>
          本地无损压缩 | 图片 / 视频 / GIF 100% 不上传，隐私零风险
        </h1>
        <p className={styles.lead}>
          所有压缩全程在您的浏览器内完成，文件永不上传云端，无需注册登录，历史记录仅保存在本地，彻底告别隐私泄露风险。
        </p>
      </section>

      <section className={styles.panel} aria-label="上传与选项">
        <Tabs activeKey={activeTab} items={tabItems} onChange={(k) => setTab(k as TabId)} size="large" />

        <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 16 }}>
          上次打开时会记住您选中的标签；上传文件后将按内容自动切换到对应类型。
        </Paragraph>

        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <Upload.Dragger key={activeTab} {...uploadProps} style={{ opacity: busy ? 0.65 : 1, pointerEvents: busy ? 'none' : undefined }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: '#34d399', fontSize: 48 }} />
            </p>
            <Title level={5} style={{ marginTop: 8 }}>
              拖放文件到此处，或点击选择
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 480, margin: '8px auto 0' }}>
              支持拖入任意支持的图片 / GIF / 视频，系统将<strong>自动识别</strong>并切换到对应标签。选择文件后请确认参数，再点「开始压缩」。
            </Paragraph>
          </Upload.Dragger>
        </div>

        {selectedFile && (
          <Card size="small" style={{ marginTop: 16 }} styles={{ body: { padding: '12px 16px' } }}>
            <Flex align="center" justify="space-between" gap={12} wrap="wrap">
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ display: 'block', wordBreak: 'break-all' }}>
                  {selectedFile.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {formatBytes(selectedFile.size)} · 识别为 {kindLabel(classifyFile(selectedFile))}
                  {selectedFile.type ? ` · ${selectedFile.type}` : ''}
                </Text>
              </div>
              <Space wrap>
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStartCompress} disabled={busy}>
                  开始压缩
                </Button>
                <Button icon={<DeleteOutlined />} onClick={clearSelection} disabled={busy}>
                  移除文件
                </Button>
              </Space>
            </Flex>
          </Card>
        )}

        {tabFileMismatch && (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message="标签与文件类型不一致"
            description={
              <>
                当前标签为「{TABS.find((x) => x.id === activeTab)?.label}」，已选文件为 {kindLabel(fileKind!)}。
                点击「开始压缩」将自动切换到正确标签并处理，或请先移除文件后再切换标签。
              </>
            }
          />
        )}

        {activeTab === 'image' && (
          <Card title="图片压缩 · 输出选项" size="small" style={{ marginTop: 16 }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                默认<strong>保持与原图相同的编码格式</strong>（如 JPG 仍输出 JPG）；也可指定转换为 WebP / PNG 等。
              </Paragraph>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  输出格式
                </Text>
                <Select
                  style={{ width: '100%' }}
                  value={format}
                  onChange={(v) => setFormat(v as ImageFormatPreference)}
                  disabled={busy}
                  options={[
                    { value: 'original', label: '默认（保持原图格式）' },
                    { value: 'webp', label: 'WebP（.webp）' },
                    { value: 'jpeg', label: 'JPG / JPEG（.jpg）' },
                    { value: 'png', label: 'PNG（.png）' },
                  ]}
                />
                {selectedFile && format === 'original' && classifyFile(selectedFile) === 'image' && (
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                    当前文件将编码为：{encodeFormatLabel(resolveEncodeFormat('original', selectedFile))}
                    {(!selectedFile.type || selectedFile.type === '') && (
                      <>（根据扩展名推断；无法识别时按 WebP 输出）</>
                    )}
                  </Paragraph>
                )}
              </div>
              <div>
                <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                  <Text type="secondary">质量</Text>
                  <Text strong>{(quality * 100).toFixed(0)}%</Text>
                </Flex>
                <Slider
                  min={40}
                  max={95}
                  value={Math.round(quality * 100)}
                  onChange={(v) => setQuality(v / 100)}
                  disabled={busy}
                  tooltip={{ formatter: (v) => `${v}%` }}
                />
              </div>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  最大边长（px，0 表示不缩放）
                </Text>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  max={16384}
                  value={maxWidth}
                  onChange={(v) => setMaxWidth(typeof v === 'number' ? v : 0)}
                  disabled={busy}
                />
              </div>
            </Space>
          </Card>
        )}

        {(activeTab === 'gif' || activeTab === 'video') && (
          <Card
            title={activeTab === 'gif' ? 'GIF 压缩（FFmpeg · 本地 Worker）' : '视频压缩（FFmpeg · 本地 Worker）'}
            size="small"
            style={{ marginTop: 16 }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                首次处理时会下载 FFmpeg 核心（约数十 MB），仅在您的浏览器缓存中。
              </Paragraph>
              <Button
                onClick={() => void handlePreloadFfmpeg()}
                disabled={busy || ffmpegLoading || ffmpegReady}
                loading={ffmpegLoading}
              >
                {ffmpegReady ? 'FFmpeg 已预加载' : '预加载 FFmpeg'}
              </Button>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  视频 CRF（越大体积越小，画质越低）
                </Text>
                <InputNumber
                  style={{ width: '100%' }}
                  min={18}
                  max={40}
                  value={crf}
                  onChange={(v) => setCrf(typeof v === 'number' ? v : 28)}
                  disabled={busy}
                />
              </div>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  目标最大宽度（{activeTab === 'gif' ? 'GIF' : '视频'} 缩放）
                </Text>
                <InputNumber
                  style={{ width: '100%' }}
                  min={160}
                  max={3840}
                  value={scaleWidth}
                  onChange={(v) => setScaleWidth(typeof v === 'number' ? v : 720)}
                  disabled={busy}
                />
              </div>
            </Space>
          </Card>
        )}

        {busy && (
          <div style={{ marginTop: 20 }}>
            <Progress percent={progress} status="active" />
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              {statusText}
            </Text>
          </div>
        )}

        {!busy && statusText && !error && (
          <Alert style={{ marginTop: 16 }} type="success" showIcon message={statusText} />
        )}
        {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}

        {lastStats && (
          <Card size="small" style={{ marginTop: 16 }} styles={{ body: { padding: '10px 16px' } }}>
            <Flex gap={12} wrap align="center">
              <Text>
                {lastStats.inName}: {formatBytes(lastStats.inBytes)} → {formatBytes(lastStats.outBytes)}
              </Text>
              {lastStats.inBytes > 0 && (
                <Text type="success" strong>
                  约省 {(100 * (1 - lastStats.outBytes / lastStats.inBytes)).toFixed(1)}%
                </Text>
              )}
            </Flex>
          </Card>
        )}

        {resultBlob && (
          <Flex align="center" gap={12} wrap style={{ marginTop: 16 }}>
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => downloadBlob(resultBlob, resultName)}>
              下载结果
            </Button>
            {previewUrl && (
              <Link href={previewUrl} target="_blank" rel="noreferrer">
                新窗口预览
              </Link>
            )}
          </Flex>
        )}
      </section>
    </div>
  )
}
