import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  InputNumber,
  Progress,
  Segmented,
  Select,
  Slider,
  Space,
  Tabs,
  Typography,
  Upload,
} from 'antd'
import { DeleteOutlined, DownloadOutlined, InboxOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { Link as RouterLink } from 'react-router-dom'
import { runImageCompress } from '../lib/compress/imageWorkerClient'
import { preloadFfmpeg, runFfmpegCompress } from '../lib/compress/ffmpegWorkerClient'
import { addJob } from '../lib/idb/db'
import { makeThumbnailBlob } from '../lib/thumbnail'
import { formatBytes } from '../lib/formatBytes'
import {
  maxUploadBytesForKind,
  readGifMaxUploadBytes,
  readImageMaxUploadBytes,
  readVideoMaxUploadBytes,
} from '../lib/fileUploadLimitSettings'
import { readImageMinQualityDecimal, readImageMinQualityPercent } from '../lib/imageCompressSettings'
import { resolveEncodeFormat } from '../lib/resolveImageFormat'
import type { ImageCompressOptions, ImageEncodeFormat, ImageFormatPreference } from '../types/compress'
import styles from './HomePage.module.css'

function classifyFile(file: File): 'image' | 'gif' | 'video' {
  if (file.type === 'image/gif') return 'gif'
  if (file.type.startsWith('video/')) return 'video'
  return 'image'
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

type SmartTargetUnit = 'kb' | 'mb'

/** 智能压缩默认目标：约为原体积的 65%，且不超过原图；小图用 KB、大图用 MB 更易读 */
function defaultSmartTarget(fileSizeBytes: number): { value: number; unit: SmartTargetUnit } {
  const targetBytes = Math.min(fileSizeBytes, Math.max(1, Math.floor(fileSizeBytes * 0.65)))
  if (targetBytes < 1024 * 1024) {
    return { value: Math.max(1, Math.round(targetBytes / 1024)), unit: 'kb' }
  }
  const mb = targetBytes / (1024 * 1024)
  return { value: Math.round(mb * 10_000) / 10_000, unit: 'mb' }
}

export function HomePage() {
  const { message: toast } = App.useApp()

  const [format, setFormat] = useState<ImageFormatPreference>('original')
  const [imageCompressMode, setImageCompressMode] = useState<'smart' | 'manual'>('smart')
  /** null 表示输入框被清空，便于重新输入；不再用默认值强行回填 */
  const [smartTargetValue, setSmartTargetValue] = useState<number | null>(512)
  const [smartTargetUnit, setSmartTargetUnit] = useState<SmartTargetUnit>('kb')
  const [quality, setQuality] = useState(0.82)
  const [crf, setCrf] = useState(28)
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
    /** 重编码未采用压缩结果，已保留原文件字节（GIF/视频等） */
    keptOriginal?: boolean
    /** 图片：最低质量仍大于体积预算，已输出该最小编码 */
    targetUnmet?: boolean
    /** 与 targetUnmet 配套，仅图片有意义 */
    imageSmartMode?: boolean
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

  const imageMinQualityPct = readImageMinQualityPercent()
  const imageMinQualityDec = readImageMinQualityDecimal()

  useEffect(() => {
    setQuality((q) => Math.max(imageMinQualityDec, q))
  }, [imageMinQualityDec])

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
      setStatusText('')
      toast.success('FFmpeg 已就绪（仍仅在本地运行）')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFfmpegLoading(false)
    }
  }, [toast])

  const pickFile = useCallback(
    (file: File) => {
      const detected = classifyFile(file)
      const limit = maxUploadBytesForKind(detected)
      if (file.size > limit) {
        setError(
          `单文件不能超过 ${formatBytes(limit)}（当前 ${formatBytes(file.size)}），可在设置中调大上限或压缩、拆分后重试`,
        )
        return
      }
      setTab(detected)
      setSelectedFile(file)
      setError(null)
      setStatusText('')
      setResultBlob(null)
      setResultName('')
      setPreviewForBlob(null)
      setLastStats(null)
      setProgress(0)
      if (detected === 'image') {
        const d = defaultSmartTarget(file.size)
        setSmartTargetValue(d.value)
        setSmartTargetUnit(d.unit)
      }
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
      const kind = classifyFile(file)
      const limit = maxUploadBytesForKind(kind)
      if (file.size > limit) {
        setError(
          `单文件不能超过 ${formatBytes(limit)}（当前 ${formatBytes(file.size)}），可在设置中调大上限`,
        )
        return
      }
      setError(null)
      setBusy(true)
      setProgress(0)
      setStatusText('读取文件…')
      setResultBlob(null)
      setResultName('')
      setPreviewForBlob(null)
      setLastStats(null)

      const jobId = crypto.randomUUID()
      const inBytes = file.size

      try {
        const buf = await file.arrayBuffer()

        if (kind === 'image') {
          if (!file.type.startsWith('image/')) {
            throw new Error('不支持的图片类型，请使用常见位图格式')
          }
          const encodeFormat = resolveEncodeFormat(format, file)
          let imageOptions: ImageCompressOptions
          if (imageCompressMode === 'smart') {
            if (
              smartTargetValue == null ||
              !Number.isFinite(smartTargetValue) ||
              smartTargetValue <= 0
            ) {
              throw new Error('请填写有效的目标体积')
            }
            const targetBytes =
              smartTargetUnit === 'kb'
                ? Math.max(1, Math.round(smartTargetValue * 1024))
                : Math.max(1, Math.round(smartTargetValue * 1024 * 1024))
            imageOptions = {
              format: encodeFormat,
              quality,
              maxOutputBytes: targetBytes,
              qualityCeiling: 0.98,
              minQuality: imageMinQualityDec,
            }
          } else {
            imageOptions = { format: encodeFormat, quality, minQuality: imageMinQualityDec }
          }
          setStatusText(
            imageCompressMode === 'smart'
              ? '在后台 Worker 中智能压缩（二分法逼近目标体积）…'
              : '在后台 Worker 中压缩图片…',
          )
          const out = await runImageCompress(jobId, buf, file.type || 'image/jpeg', imageOptions, setProgress)
          const blob = new Blob([out.buffer], { type: out.outputMime })
          const base = file.name.replace(/\.[^.]+$/, '')
          const ext =
            out.outputMime === 'image/jpeg'
              ? '.jpg'
              : out.outputMime === 'image/webp'
                ? '.webp'
                : '.png'
          const keptOriginal = Boolean(out.usedOriginalFallback)
          const targetUnmet = Boolean(out.targetUnmet)
          const name = keptOriginal ? file.name : `${base}-compressed${ext}`
          setResultBlob(blob)
          setResultName(name)
          setPreviewForBlob(blob)
          setLastStats({
            inBytes,
            outBytes: blob.size,
            inName: file.name,
            keptOriginal,
            targetUnmet,
            imageSmartMode: imageCompressMode === 'smart',
          })
          setProgress(100)
          if (keptOriginal || targetUnmet) {
            setStatusText(
              keptOriginal
                ? imageCompressMode === 'smart'
                  ? '完成：无法压缩到您设定的目标体积，已保留原图'
                  : '完成：当前参数下无法比原文件更小，已保留原图'
                : imageCompressMode === 'smart'
                  ? '完成：未达目标体积，已输出最低质量下的最小文件，可下载使用'
                  : '完成：无法压至原图以下，已输出最低质量下的最小文件，可下载使用',
            )
          } else {
            setStatusText('')
            toast.success('压缩完成')
          }

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
            ratio: keptOriginal || !inBytes ? 0 : Math.max(0, 1 - blob.size / inBytes),
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
          setProgress,
        )
        let blob = new Blob([out.buffer], { type: out.outputMime })
        let outputFileName = out.outputFileName
        let keptOriginal = false
        if (blob.size >= inBytes) {
          const origBuf = await file.arrayBuffer()
          blob = new Blob([origBuf], { type: file.type || out.outputMime })
          outputFileName = file.name
          keptOriginal = true
        }
        setResultBlob(blob)
        setResultName(outputFileName)
        setPreviewForBlob(blob)
        setLastStats({
          inBytes,
          outBytes: blob.size,
          inName: file.name,
          keptOriginal,
        })
        setProgress(100)
        if (keptOriginal) {
          setStatusText('完成：编码结果未小于原文件，已保留原文件')
        } else {
          setStatusText('')
          toast.success('压缩完成')
        }

        const thumb = kind === 'gif' ? await makeThumbnailBlob(blob) : undefined
        await addJob({
          id: jobId,
          createdAt: Date.now(),
          kind,
          inputName: file.name,
          inputMime: file.type,
          inputBytes: inBytes,
          outputMime: keptOriginal ? file.type || out.outputMime : out.outputMime,
          outputBytes: blob.size,
          ratio: keptOriginal || !inBytes ? 0 : Math.max(0, 1 - blob.size / inBytes),
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
    [
      crf,
      ffmpegReady,
      format,
      imageCompressMode,
      imageMinQualityDec,
      quality,
      setPreviewForBlob,
      smartTargetUnit,
      smartTargetValue,
      toast,
    ],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const { files } = e.dataTransfer
      const f = files[0]
      if (!f) return
      if (files.length > 1) {
        toast.info('已拖入多个文件，当前每次处理 1 个，已为您选取第一个')
      }
      pickFile(f)
    },
    [pickFile, toast],
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

  const smartTargetApproxBytes = useMemo(() => {
    if (
      smartTargetValue == null ||
      !Number.isFinite(smartTargetValue) ||
      smartTargetValue <= 0
    ) {
      return null
    }
    return smartTargetUnit === 'kb'
      ? Math.max(1, Math.round(smartTargetValue * 1024))
      : Math.max(1, Math.round(smartTargetValue * 1024 * 1024))
  }, [smartTargetUnit, smartTargetValue])

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
          本地智能压缩 | 100% 不上传，隐私零风险
        </h1>
        <p className={styles.lead}>
          图片 / 视频 / GIF 全支持，浏览器本地处理，文件永不云端存储，压缩更快更安全
        </p>
      </section>

      <section className={styles.panel} aria-label="上传与选项">
        <Tabs activeKey={activeTab} items={tabItems} onChange={(k) => setTab(k as TabId)} size="large" />

        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <Upload.Dragger key={activeTab} {...uploadProps} style={{ opacity: busy ? 0.65 : 1, pointerEvents: busy ? 'none' : undefined }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: '#34d399', fontSize: 52 }} />
            </p>
            <Title level={5} style={{ marginTop: 8 }}>
              拖入文件或点击选择
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 520, margin: '10px auto 0', lineHeight: 1.65 }}>
              {activeTab === 'image' && (
                <>
                  支持 JPG、PNG、WebP、AVIF、BMP 等常见静态图片；单文件最大{' '}
                  <strong>{formatBytes(readImageMaxUploadBytes())}</strong>
                  ，可在 <RouterLink to="/settings">设置</RouterLink> 调整上限。
                </>
              )}
              {activeTab === 'gif' && (
                <>
                  支持 GIF 动图；单文件最大 <strong>{formatBytes(readGifMaxUploadBytes())}</strong>
                  ，可在 <RouterLink to="/settings">设置</RouterLink> 调整上限。
                </>
              )}
              {activeTab === 'video' && (
                <>
                  支持 MP4、WebM、MOV 等常见视频；单文件最大{' '}
                  <strong>{formatBytes(readVideoMaxUploadBytes())}</strong>
                  ，可在 <RouterLink to="/settings">设置</RouterLink> 调整上限。
                </>
              )}
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
                  {formatBytes(selectedFile.size)}
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
          />
        )}

        {activeTab === 'image' && (
          <Card title="图片压缩 · 输出选项" size="small" style={{ marginTop: 16 }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  压缩方式
                </Text>
                <Segmented<'smart' | 'manual'>
                  block
                  value={imageCompressMode}
                  onChange={(v) => setImageCompressMode(v)}
                  disabled={busy}
                  options={[
                    { label: '智能压缩', value: 'smart' },
                    { label: '手动调节压缩率', value: 'manual' },
                  ]}
                />
              </div>
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
              {imageCompressMode === 'smart' ? (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    目标最大体积
                  </Text>
                  <Space.Compact style={{ width: '100%', maxWidth: 360 }}>
                    <InputNumber
                      style={{ width: 'calc(100% - 88px)' }}
                      min={smartTargetUnit === 'kb' ? 1 : 0.0001}
                      max={smartTargetUnit === 'kb' ? 512 * 1024 : 500}
                      step={smartTargetUnit === 'kb' ? 1 : 0.05}
                      value={smartTargetValue}
                      onChange={(v) => {
                        setSmartTargetValue(typeof v === 'number' ? v : null)
                      }}
                      disabled={busy}
                    />
                    <Select<SmartTargetUnit>
                      style={{ width: 88 }}
                      value={smartTargetUnit}
                      disabled={busy}
                      options={[
                        { value: 'kb', label: 'KB' },
                        { value: 'mb', label: 'MB' },
                      ]}
                      onChange={(u) => {
                        if (u === smartTargetUnit) return
                        const fileSize = selectedFile?.size ?? 1024 * 1024
                        const prevBytes =
                          smartTargetValue != null &&
                          Number.isFinite(smartTargetValue) &&
                          smartTargetValue > 0
                            ? smartTargetUnit === 'mb'
                              ? smartTargetValue * 1024 * 1024
                              : smartTargetValue * 1024
                            : Math.min(fileSize, Math.max(1, Math.floor(fileSize * 0.65)))
                        if (u === 'kb') {
                          setSmartTargetValue(Math.max(1, Math.round(prevBytes / 1024)))
                        } else {
                          setSmartTargetValue(Math.round((prevBytes / (1024 * 1024)) * 10_000) / 10_000)
                        }
                        setSmartTargetUnit(u)
                      }}
                    />
                  </Space.Compact>
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                    在小于目标体积的前提下尽量提高画质，压缩质量下限见{' '}
                    <RouterLink to="/settings">设置</RouterLink>
                    （当前 {imageMinQualityPct}%）
                    {selectedFile && smartTargetApproxBytes != null ? (
                      <>
                        {' '}
                        当前约等于 {formatBytes(smartTargetApproxBytes)}
                        {smartTargetApproxBytes >= selectedFile.size ? (
                          <>（不小于原图 {formatBytes(selectedFile.size)}，一般会直接满足）</>
                        ) : null}
                      </>
                    ) : selectedFile ? (
                      <> 输入框为空时请填入数字后再压缩。</>
                    ) : null}
                  </Paragraph>
                </div>
              ) : (
                <div>
                  <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                    <Text type="secondary">质量上限</Text>
                    <Text strong>{(quality * 100).toFixed(0)}%</Text>
                  </Flex>
                  <Slider
                    min={imageMinQualityPct}
                    max={95}
                    value={Math.round(quality * 100)}
                    onChange={(v) => setQuality(v / 100)}
                    disabled={busy}
                    tooltip={{ formatter: (v) => `${v}%` }}
                  />
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                    压缩率下限 {imageMinQualityPct}% 可在{' '}
                    <RouterLink to="/settings">设置</RouterLink> 修改
                  </Paragraph>
                </div>
              )}
            </Space>
          </Card>
        )}

        {(activeTab === 'gif' || activeTab === 'video') && (
          <Card
            title={activeTab === 'gif' ? 'GIF 压缩' : '视频压缩'}
            size="small"
            style={{ marginTop: 16 }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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
          <Alert style={{ marginTop: 16 }} type="warning" showIcon message={statusText} />
        )}
        {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}

        {lastStats && (
          <Card size="small" style={{ marginTop: 16 }} styles={{ body: { padding: '10px 16px' } }}>
            <Flex gap={12} wrap align="center">
              <Text>
                {lastStats.inName}: {formatBytes(lastStats.inBytes)} → {formatBytes(lastStats.outBytes)}
              </Text>
              {lastStats.keptOriginal ? (
                <Text type="secondary">体积未增大（已保留原文件）</Text>
              ) : lastStats.targetUnmet ? (
                <Text type="secondary">
                  {lastStats.imageSmartMode
                    ? '未达目标体积，已输出最低质量下尽量小的文件'
                    : '未小于原图体积，已输出最低质量下尽量小的文件'}
                </Text>
              ) : lastStats.inBytes > 0 && lastStats.outBytes < lastStats.inBytes ? (
                <Text type="success" strong>
                  约省 {(100 * (1 - lastStats.outBytes / lastStats.inBytes)).toFixed(1)}%
                </Text>
              ) : null}
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
