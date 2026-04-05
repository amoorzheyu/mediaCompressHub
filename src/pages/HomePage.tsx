import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Select,
  Slider,
  Space,
  Switch,
  Tabs,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FallOutlined,
  InboxOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { Link as RouterLink } from 'react-router-dom'
import { runImageCompress } from '../lib/compress/imageWorkerClient'
import { preloadFfmpeg, runFfmpegCompress } from '../lib/compress/ffmpegWorkerClient'
import { addJob } from '../lib/idb/db'
import { makeThumbnailBlob, makeVideoThumbnailBlob } from '../lib/thumbnail'
import { formatBytes } from '../lib/formatBytes'
import {
  maxUploadBytesForKind,
  readGifMaxUploadBytes,
  readImageMaxUploadBytes,
  readVideoMaxUploadBytes,
} from '../lib/fileUploadLimitSettings'
import { readImageMinQualityDecimal, readImageMinQualityPercent } from '../lib/imageCompressSettings'
import { videoCompressPercentToCrf, videoCrfToCompressPercent } from '../lib/compress/videoCrfPercent'
import { readVideoCrfRange, readVideoTargetCrf, writeVideoTargetCrf } from '../lib/videoCrfRangeSettings'
import { readVideoKeepAudio, writeVideoKeepAudio } from '../lib/videoAudioSettings'
import { GIF_SMART_ATTEMPTS } from '../lib/gifEncode'
import { parseGifLogicalScreen } from '../lib/parseGifHeader'
import { resolveEncodeFormat } from '../lib/resolveImageFormat'
import type {
  GifDitherMode,
  ImageCompressOptions,
  ImageEncodeFormat,
  ImageFormatPreference,
} from '../types/compress'
import { FileComparePreview } from '../components/ImageCompareSlider'
import { isElectronApp } from '../lib/isElectronApp'
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

const { Text, Title, Paragraph } = Typography

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

type LastStats = {
  inBytes: number
  outBytes: number
  inName: string
  /** 重编码未采用压缩结果，已保留原文件字节（GIF/视频等） */
  keptOriginal?: boolean
  /** 图片：最低质量仍大于体积预算，已输出该最小编码 */
  targetUnmet?: boolean
  /** 与 targetUnmet 配套，仅图片有意义 */
  imageSmartMode?: boolean
  /** GIF 智能压缩时使用 */
  gifSmartMode?: boolean
}

type TabPaneState = {
  selectedFile: File | null
  resultBlob: Blob | null
  resultName: string
  lastStats: LastStats | null
  previewUrl: string | null
  error: string | null
  /** 非压缩中的提示（如保留原图说明） */
  idleStatusText: string
}

function emptyPane(): TabPaneState {
  return {
    selectedFile: null,
    resultBlob: null,
    resultName: '',
    lastStats: null,
    previewUrl: null,
    error: null,
    idleStatusText: '',
  }
}

function initialPanes(): Record<TabId, TabPaneState> {
  return { image: emptyPane(), gif: emptyPane(), video: emptyPane() }
}

export function HomePage() {
  const { message: toast } = App.useApp()

  const [format, setFormat] = useState<ImageFormatPreference>('original')
  const [imageCompressMode, setImageCompressMode] = useState<'smart' | 'manual'>('smart')
  const [gifCompressMode, setGifCompressMode] = useState<'smart' | 'custom'>('smart')
  const [gifSmartTargetValue, setGifSmartTargetValue] = useState<number | null>(512)
  const [gifSmartTargetUnit, setGifSmartTargetUnit] = useState<SmartTargetUnit>('kb')
  const [gifCustomMaxFps, setGifCustomMaxFps] = useState(12)
  const [gifCustomMaxColors, setGifCustomMaxColors] = useState(128)
  const [gifCustomDither, setGifCustomDither] = useState<GifDitherMode>('bayer')
  /** null 表示不限制宽度 */
  const [gifCustomMaxWidth, setGifCustomMaxWidth] = useState<number | null>(null)
  const [gifLogicalSize, setGifLogicalSize] = useState<{ width: number; height: number } | null>(null)
  /** null 表示输入框被清空，便于重新输入；不再用默认值强行回填 */
  const [smartTargetValue, setSmartTargetValue] = useState<number | null>(512)
  const [smartTargetUnit, setSmartTargetUnit] = useState<SmartTargetUnit>('kb')
  const [quality, setQuality] = useState(0.82)
  const [, bumpVideoCrfUi] = useReducer((x: number) => x + 1, 0)
  const [videoKeepAudio, setVideoKeepAudio] = useState(() => readVideoKeepAudio())
  const [busy, setBusy] = useState(false)
  /** 与 `busy` 配套：正在压缩的标签页，用于避免切换标签后进度条跑到错误的文件卡片上 */
  const [compressingKind, setCompressingKind] = useState<TabId | null>(null)
  const [progress, setProgress] = useState(0)
  /** 仅压缩进行中时展示在进度条下方 */
  const [compressStatusText, setCompressStatusText] = useState('')
  const [ffmpegReady, setFfmpegReady] = useState(false)
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false)
  const [panes, setPanes] = useState<Record<TabId, TabPaneState>>(initialPanes)
  const [activeTab, setActiveTabState] = useState<TabId>(() => readStoredTab())

  const panesRef = useRef(panes)
  panesRef.current = panes

  const mergePane = useCallback((tab: TabId, patch: Partial<TabPaneState>) => {
    setPanes((prev) => {
      const o = prev[tab]
      const next = { ...o, ...patch }
      if ('previewUrl' in patch && patch.previewUrl !== o.previewUrl) {
        if (o.previewUrl) URL.revokeObjectURL(o.previewUrl)
      }
      return { ...prev, [tab]: next }
    })
  }, [])

  const setTab = useCallback((t: TabId) => {
    setActiveTabState(t)
    setResultPreviewOpen(false)
    persistTab(t)
  }, [])

  const pane = panes[activeTab]
  const { selectedFile, resultBlob, resultName, lastStats, previewUrl, error, idleStatusText } = pane

  const compressingThisTab = Boolean(busy && compressingKind === activeTab)

  const imageMinQualityPct = readImageMinQualityPercent()
  const imageMinQualityDec = readImageMinQualityDecimal()

  const videoCrfRange = readVideoCrfRange()
  const videoTargetCrf = readVideoTargetCrf()
  const videoCompressPercent = videoCrfToCompressPercent(
    videoTargetCrf,
    videoCrfRange.min,
    videoCrfRange.max,
  )

  const fileCardSubtitle = useMemo(() => {
    if (!selectedFile) return null
    const inTypeRaw = selectedFile.type || ''
    const inTypeLabel = inTypeRaw || '无类型'
    if (!resultBlob) {
      return (
        <>
          {formatBytes(selectedFile.size)} · {inTypeLabel}
        </>
      )
    }
    const outType = resultBlob.type || ''
    const showOutputMime = Boolean(outType && outType !== inTypeRaw)
    return (
      <>
        {formatBytes(selectedFile.size)} · {inTypeLabel} → {formatBytes(resultBlob.size)}
        {showOutputMime ? ` · ${outType}` : ''}
      </>
    )
  }, [resultBlob, selectedFile])

  const fileCardSavings = useMemo(() => {
    if (!selectedFile || !resultBlob) return null
    if (lastStats?.keptOriginal) return null
    const inB = lastStats?.inBytes ?? selectedFile.size
    const outB = lastStats?.outBytes ?? resultBlob.size
    if (inB <= 0 || outB >= inB) return null
    const pct = (100 * (1 - outB / inB)).toFixed(1)
    return (
      <Text type="success" strong style={{ fontSize: 13, flexShrink: 0, lineHeight: 1.4 }}>
        <FallOutlined aria-hidden style={{ marginRight: 4 }} />
         {pct}%
      </Text>
    )
  }, [lastStats, resultBlob, selectedFile])

  useEffect(() => {
    setQuality((q) => Math.max(imageMinQualityDec, q))
  }, [imageMinQualityDec])

  useEffect(() => {
    return () => {
      const p = panesRef.current
      for (const id of TABS.map((t) => t.id)) {
        const u = p[id].previewUrl
        if (u) URL.revokeObjectURL(u)
      }
    }
  }, [])

  const pickFile = useCallback(
    (file: File) => {
      const detected = classifyFile(file)
      const limit = maxUploadBytesForKind(detected)
      if (file.size > limit) {
        setPanes((p) => ({
          ...p,
          [detected]: {
            ...p[detected],
            error: `单文件不能超过 ${formatBytes(limit)}（当前 ${formatBytes(file.size)}），可在设置中调大上限或压缩、拆分后重试`,
          },
        }))
        setTab(detected)
        return
      }
      setTab(detected)
      setPanes((p) => {
        const old = p[detected]
        if (old.previewUrl) URL.revokeObjectURL(old.previewUrl)
        return {
          ...p,
          [detected]: { ...emptyPane(), selectedFile: file },
        }
      })
      setResultPreviewOpen(false)
      setProgress(0)
      if (detected === 'image') {
        const d = defaultSmartTarget(file.size)
        setSmartTargetValue(d.value)
        setSmartTargetUnit(d.unit)
      }
      if (detected === 'gif') {
        const d = defaultSmartTarget(file.size)
        setGifSmartTargetValue(d.value)
        setGifSmartTargetUnit(d.unit)
        void file.slice(0, 32).arrayBuffer().then((ab) => {
          setGifLogicalSize(parseGifLogicalScreen(ab))
        })
      } else {
        setGifLogicalSize(null)
      }
    },
    [setTab],
  )

  const clearSelection = useCallback(() => {
    setGifLogicalSize(null)
    setPanes((p) => {
      const o = p[activeTab]
      if (o.previewUrl) URL.revokeObjectURL(o.previewUrl)
      return { ...p, [activeTab]: emptyPane() }
    })
  }, [activeTab])

  const processFile = useCallback(
    async (file: File) => {
      const kind = classifyFile(file)
      const limit = maxUploadBytesForKind(kind)
      if (file.size > limit) {
        mergePane(kind, {
          error: `单文件不能超过 ${formatBytes(limit)}（当前 ${formatBytes(file.size)}），可在设置中调大上限`,
        })
        return
      }
      mergePane(kind, {
        error: null,
        idleStatusText: '',
        resultBlob: null,
        resultName: '',
        lastStats: null,
        previewUrl: null,
      })
      setBusy(true)
      setCompressingKind(kind)
      setProgress(0)
      setCompressStatusText('读取文件…')
      setResultPreviewOpen(false)

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
          setCompressStatusText(
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
          const url = URL.createObjectURL(blob)
          const idleMsg =
            keptOriginal || targetUnmet
              ? keptOriginal
                ? imageCompressMode === 'smart'
                  ? '完成：无法压缩到您设定的目标体积，已保留原图'
                  : '完成：当前参数下无法比原文件更小，已保留原图'
                : imageCompressMode === 'smart'
                  ? '完成：未达目标体积，已输出最低质量下的最小文件，可下载使用'
                  : '完成：无法压至原图以下，已输出最低质量下的最小文件，可下载使用'
              : ''
          const paneStillThisFile = panesRef.current[kind].selectedFile === file
          if (paneStillThisFile) {
            mergePane(kind, {
              resultBlob: blob,
              resultName: name,
              previewUrl: url,
              lastStats: {
                inBytes,
                outBytes: blob.size,
                inName: file.name,
                keptOriginal,
                targetUnmet,
                imageSmartMode: imageCompressMode === 'smart',
              },
              idleStatusText: idleMsg,
            })
            setProgress(100)
            if (!keptOriginal && !targetUnmet) {
              toast.success('压缩完成')
            }
          } else {
            URL.revokeObjectURL(url)
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
          setCompressStatusText('正在加载 FFmpeg（首次需联网拉取核心，仅一次）…')
          await preloadFfmpeg()
          setFfmpegReady(true)
        }

        let out: { buffer: ArrayBuffer; outputMime: string; outputFileName: string }
        let gifTargetUnmet = false

        if (kind === 'gif') {
          if (gifCompressMode === 'smart') {
            if (
              gifSmartTargetValue == null ||
              !Number.isFinite(gifSmartTargetValue) ||
              gifSmartTargetValue <= 0
            ) {
              throw new Error('请填写有效的目标体积')
            }
            const targetBytes =
              gifSmartTargetUnit === 'kb'
                ? Math.max(1, Math.round(gifSmartTargetValue * 1024))
                : Math.max(1, Math.round(gifSmartTargetValue * 1024 * 1024))
            let best: typeof out | null = null
            let bestSize = Infinity
            let chosen: typeof out | null = null
            const n = GIF_SMART_ATTEMPTS.length
            for (let i = 0; i < n; i++) {
              const copy = buf.slice(0)
              const span = 88 / n
              setCompressStatusText(`GIF 智能压缩：尝试参数组 ${i + 1} / ${n}…`)
              const attemptOut = await runFfmpegCompress(
                jobId,
                copy,
                file.name,
                'gif',
                readVideoTargetCrf(),
                (p) => setProgress(Math.min(99, Math.floor(i * span + (p / 100) * span))),
                true,
                GIF_SMART_ATTEMPTS[i],
              )
              if (attemptOut.buffer.byteLength < bestSize) {
                bestSize = attemptOut.buffer.byteLength
                best = attemptOut
              }
              if (attemptOut.buffer.byteLength <= targetBytes) {
                chosen = attemptOut
                break
              }
            }
            if (!best) {
              throw new Error('GIF 编码失败')
            }
            if (chosen === null) {
              chosen = best
              gifTargetUnmet = best.buffer.byteLength > targetBytes
            }
            out = chosen
          } else {
            setCompressStatusText('在 Worker 中按自定义参数压缩 GIF…')
            out = await runFfmpegCompress(
              jobId,
              buf,
              file.name,
              'gif',
              readVideoTargetCrf(),
              setProgress,
              true,
              {
                maxFps: gifCustomMaxFps,
                maxColors: gifCustomMaxColors,
                dither: gifCustomDither,
                maxWidth:
                  gifCustomMaxWidth != null && gifCustomMaxWidth > 0
                    ? Math.round(gifCustomMaxWidth)
                    : undefined,
              },
            )
          }
        } else {
          setCompressStatusText(
            videoKeepAudio
              ? '在 Worker 中压缩视频（保留音轨）…'
              : '在 Worker 中压缩视频（已去除音轨以减小体积）…',
          )
          out = await runFfmpegCompress(
            jobId,
            buf,
            file.name,
            'video',
            readVideoTargetCrf(),
            setProgress,
            videoKeepAudio,
          )
        }
        let blob = new Blob([out.buffer], { type: out.outputMime })
        let outputFileName = out.outputFileName
        let keptOriginal = false
        if (blob.size >= inBytes) {
          const origBuf = await file.arrayBuffer()
          blob = new Blob([origBuf], { type: file.type || out.outputMime })
          outputFileName = file.name
          keptOriginal = true
        }
        const url = URL.createObjectURL(blob)
        const paneStillThisFile = panesRef.current[kind].selectedFile === file
        const gifSmartIdle =
          kind === 'gif' && gifCompressMode === 'smart' && gifTargetUnmet && !keptOriginal
            ? '完成：已尝试多档参数，当前结果仍大于您设定的目标体积；可下载使用，或调高目标、改用自定义压缩'
            : ''
        if (paneStillThisFile) {
          mergePane(kind, {
            resultBlob: blob,
            resultName: outputFileName,
            previewUrl: url,
            lastStats: {
              inBytes,
              outBytes: blob.size,
              inName: file.name,
              keptOriginal,
              ...(kind === 'gif' && gifCompressMode === 'smart'
                ? { gifSmartMode: true, targetUnmet: gifTargetUnmet }
                : {}),
            },
            idleStatusText: keptOriginal
              ? '完成：编码结果未小于原文件，已保留原文件'
              : gifSmartIdle,
          })
          setProgress(100)
          if (!keptOriginal && !(kind === 'gif' && gifCompressMode === 'smart' && gifTargetUnmet)) {
            toast.success('压缩完成')
          }
        } else {
          URL.revokeObjectURL(url)
        }

        const thumb =
          kind === 'gif'
            ? await makeThumbnailBlob(blob)
            : kind === 'video'
              ? await makeVideoThumbnailBlob(blob)
              : undefined
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
        if (panesRef.current[kind].selectedFile === file) {
          mergePane(kind, { error: message })
        }
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
        setCompressingKind(null)
        setCompressStatusText('')
      }
    },
    [
      ffmpegReady,
      mergePane,
      videoKeepAudio,
      format,
      imageCompressMode,
      imageMinQualityDec,
      quality,
      smartTargetUnit,
      smartTargetValue,
      toast,
      gifCompressMode,
      gifSmartTargetUnit,
      gifSmartTargetValue,
      gifCustomMaxFps,
      gifCustomMaxColors,
      gifCustomDither,
      gifCustomMaxWidth,
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
      beforeUpload: (file) => {
        pickFile(file)
        return false
      },
    }),
    [activeTab, pickFile],
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

  const gifSmartTargetApproxBytes = useMemo(() => {
    if (
      gifSmartTargetValue == null ||
      !Number.isFinite(gifSmartTargetValue) ||
      gifSmartTargetValue <= 0
    ) {
      return null
    }
    return gifSmartTargetUnit === 'kb'
      ? Math.max(1, Math.round(gifSmartTargetValue * 1024))
      : Math.max(1, Math.round(gifSmartTargetValue * 1024 * 1024))
  }, [gifSmartTargetUnit, gifSmartTargetValue])

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
      })),
    [],
  )

  return (
    <div className={styles.page}>
      {!isElectronApp && (
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" className={styles.title}>
            本地智能压缩 | 100% 不上传，隐私零风险
          </h1>
          <p className={styles.lead}>
            图片 / 视频 / GIF 全支持，浏览器本地处理，文件永不云端存储，压缩更快更安全
          </p>
        </section>
      )}

      <section className={styles.panel} aria-label="上传与选项">
        <Tabs activeKey={activeTab} items={tabItems} onChange={(k) => setTab(k as TabId)} size="large" />

        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <Upload.Dragger key={activeTab} {...uploadProps}>
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
                  ，可在 <RouterLink to="/settings">设置</RouterLink> 调整上限
                </>
              )}
              {activeTab === 'gif' && (
                <>
                  支持 GIF 动图；单文件最大 <strong>{formatBytes(readGifMaxUploadBytes())}</strong>
                  ，可在 <RouterLink to="/settings">设置</RouterLink> 调整上限
                </>
              )}
              {activeTab === 'video' && (
                <>
                  支持 MP4、WebM、MOV 等常见视频；单文件最大{' '}
                  <strong>{formatBytes(readVideoMaxUploadBytes())}</strong>
                  ，可在 <RouterLink to="/settings">设置</RouterLink> 调整上限
                </>
              )}
            </Paragraph>
           
          </Upload.Dragger>
        </div>

        {selectedFile && (
          <Card size="small" style={{ marginTop: 16 }} styles={{ body: { padding: '12px 16px' } }}>
            <div className={styles.fileCardGrid}>
              <div style={{ minWidth: 0 }}>
                {fileCardSavings ? (
                  <Flex justify="space-between" align="stretch" gap={8}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ display: 'block', wordBreak: 'break-all', marginBottom: 4 }}>
                        {selectedFile.name}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {fileCardSubtitle}
                      </Text>
                    </div>
                    <Flex align="center" style={{ flexShrink: 0 }}>
                      {fileCardSavings}
                    </Flex>
                  </Flex>
                ) : (
                  <>
                    <Text strong style={{ display: 'block', wordBreak: 'break-all', marginBottom: 4 }}>
                      {selectedFile.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {fileCardSubtitle}
                    </Text>
                  </>
                )}
              </div>
              <div className={styles.fileCardCenter}>
                <Flex align="center" gap={10} wrap={false} className={styles.fileCardCenterInner}>
                  {resultBlob && previewUrl ? (
                    <Space size="small" wrap={false}>
                      <Tooltip title="预览压缩结果">
                        <Button
                          type="default"
                          icon={<EyeOutlined />}
                          onClick={() => setResultPreviewOpen(true)}
                          aria-label="预览压缩结果"
                        />
                      </Tooltip>
                      <Button
                        type="default"
                        icon={<DownloadOutlined />}
                        iconPlacement="end"
                        onClick={() => downloadBlob(resultBlob, resultName)}
                        aria-label="下载压缩结果"
                      />
                    </Space>
                  ) : null}
                  {compressingThisTab ? (
                    <Tooltip title={compressStatusText || '压缩中'}>
                      <div className={styles.fileCardProgress}>
                        <Progress percent={progress} size="small" status="active" showInfo />
                      </div>
                    </Tooltip>
                  ) : null}
                </Flex>
              </div>
              <div className={styles.fileCardActions}>
                <Space wrap>
                  <Button
                    type="primary"
                    icon={compressingThisTab ? <LoadingOutlined /> : undefined}
                    onClick={onStartCompress}
                  >
                    {compressingThisTab ? '压缩中…' : '开始压缩'}
                  </Button>
                  <Button icon={<DeleteOutlined />} onClick={clearSelection} aria-label="移除当前文件">
                    
                  </Button>
                </Space>
              </div>
            </div>
          </Card>
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
                  options={[
                    { label: '智能压缩', value: 'smart' },
                    { label: '手动调节压缩质量', value: 'manual' },
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
                    />
                    <Select<SmartTargetUnit>
                      style={{ width: 88 }}
                      value={smartTargetUnit}
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
                      <> 输入框为空时请填入数字后再压缩</>
                    ) : null}
                  </Paragraph>
                </div>
              ) : (
                <div>
                  <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                    <Text type="secondary">压缩质量</Text>
                    <Text strong>{(quality * 100).toFixed(0)}%</Text>
                  </Flex>
                  <Slider
                    min={imageMinQualityPct}
                    max={95}
                    value={Math.round(quality * 100)}
                    onChange={(v) => setQuality(v / 100)}
                    tooltip={{ formatter: (v) => `${v}%` }}
                  />
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                    压缩质量越低，压缩体积越小，压缩质量下限 {imageMinQualityPct}% 可在{' '}
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
              {activeTab === 'video' ? (
                <div>
                  <Flex justify="space-between" align="center" style={{ marginBottom: 8 }} wrap gap={8}>
                    <Text type="secondary">压缩强度</Text>
                    <Text type="secondary">{videoCompressPercent}%</Text>
                  </Flex>
                  <Slider
                    min={0}
                    max={100}
                    value={videoCompressPercent}
                    onChange={(pct) => {
                      const crf = videoCompressPercentToCrf(pct, videoCrfRange.min, videoCrfRange.max)
                      writeVideoTargetCrf(crf)
                      bumpVideoCrfUi()
                    }}
                    tooltip={{ formatter: (v) => (v != null ? `${v}%` : '') }}
                  />
                  <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 12, fontSize: 13 }}>
                    当前对应 CRF {videoTargetCrf}（范围{' '}
                    {videoCrfRange.min}～{videoCrfRange.max}，可在{' '}
                    <RouterLink to="/settings">设置</RouterLink> 调整上下限）
                  </Paragraph>
                  <Flex justify="space-between" align="center" wrap gap={8} style={{ marginTop: 16 }}>
                    <Text type="secondary">保留音频</Text>
                    <Switch
                      checked={videoKeepAudio}
                      onChange={(checked) => {
                        writeVideoKeepAudio(checked)
                        setVideoKeepAudio(checked)
                      }}
                    />
                  </Flex>
                  <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4, fontSize: 12 }}>
                    开启时会保留音频，关闭可减小体积
                  </Paragraph>
                </div>
              ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      压缩方式
                    </Text>
                    <Segmented<'smart' | 'custom'>
                      block
                      value={gifCompressMode}
                      onChange={(v) => setGifCompressMode(v)}
                      options={[
                        { label: '智能压缩', value: 'smart' },
                        { label: '自定义压缩', value: 'custom' },
                      ]}
                    />
                  </div>
                  {gifLogicalSize ? (
                    <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
                      源图逻辑尺寸约 {gifLogicalSize.width}×{gifLogicalSize.height}px（自文件头读取）
                    </Paragraph>
                  ) : null}
                  {gifCompressMode === 'smart' ? (
                    <div>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                        目标最大体积
                      </Text>
                      <Space.Compact style={{ width: '100%', maxWidth: 360 }}>
                        <InputNumber
                          style={{ width: 'calc(100% - 88px)' }}
                          min={gifSmartTargetUnit === 'kb' ? 1 : 0.0001}
                          max={gifSmartTargetUnit === 'kb' ? 512 * 1024 : 500}
                          step={gifSmartTargetUnit === 'kb' ? 1 : 0.05}
                          value={gifSmartTargetValue}
                          onChange={(v) => {
                            setGifSmartTargetValue(typeof v === 'number' ? v : null)
                          }}
                        />
                        <Select<SmartTargetUnit>
                          style={{ width: 88 }}
                          value={gifSmartTargetUnit}
                          options={[
                            { value: 'kb', label: 'KB' },
                            { value: 'mb', label: 'MB' },
                          ]}
                          onChange={(u) => {
                            if (u === gifSmartTargetUnit) return
                            const fileSize = selectedFile?.size ?? 1024 * 1024
                            const prevBytes =
                              gifSmartTargetValue != null &&
                              Number.isFinite(gifSmartTargetValue) &&
                              gifSmartTargetValue > 0
                                ? gifSmartTargetUnit === 'mb'
                                  ? gifSmartTargetValue * 1024 * 1024
                                  : gifSmartTargetValue * 1024
                                : Math.min(fileSize, Math.max(1, Math.floor(fileSize * 0.65)))
                            if (u === 'kb') {
                              setGifSmartTargetValue(Math.max(1, Math.round(prevBytes / 1024)))
                            } else {
                              setGifSmartTargetValue(
                                Math.round((prevBytes / (1024 * 1024)) * 10_000) / 10_000,
                              )
                            }
                            setGifSmartTargetUnit(u)
                          }}
                        />
                      </Space.Compact>
                      <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                        将按多组参数依次重编码，优先满足体积目标；GIF 为调色板动画，无法像静态图一样精确二分逼近。
                        {selectedFile && gifSmartTargetApproxBytes != null ? (
                          <>
                            {' '}
                            当前约等于 {formatBytes(gifSmartTargetApproxBytes)}
                            {gifSmartTargetApproxBytes >= selectedFile.size ? (
                              <>（不小于原文件 {formatBytes(selectedFile.size)}，一般较易满足）</>
                            ) : null}
                          </>
                        ) : selectedFile ? (
                          <> 请填写有效数字后再压缩</>
                        ) : null}
                      </Paragraph>
                    </div>
                  ) : (
                    <div>
                      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                        <Text type="secondary">输出帧率上限</Text>
                        <Text strong>{gifCustomMaxFps} fps</Text>
                      </Flex>
                      <Slider
                        min={1}
                        max={24}
                        value={gifCustomMaxFps}
                        onChange={(v) => setGifCustomMaxFps(Array.isArray(v) ? gifCustomMaxFps : v)}
                      />
                      <Flex justify="space-between" align="center" style={{ marginBottom: 8, marginTop: 16 }}>
                        <Text type="secondary">调色板颜色数</Text>
                        <Text strong>{gifCustomMaxColors}</Text>
                      </Flex>
                      <Slider
                        min={32}
                        max={256}
                        value={gifCustomMaxColors}
                        onChange={(v) => setGifCustomMaxColors(Array.isArray(v) ? gifCustomMaxColors : v)}
                      />
                      <Text type="secondary" style={{ display: 'block', marginBottom: 8, marginTop: 16 }}>
                        抖动算法
                      </Text>
                      <Select<GifDitherMode>
                        style={{ width: '100%' }}
                        value={gifCustomDither}
                        onChange={setGifCustomDither}
                        options={[
                          { value: 'bayer', label: 'Bayer（有序抖动，颗粒感）' },
                          { value: 'floyd_steinberg', label: 'Floyd–Steinberg（扩散抖动）' },
                          { value: 'sierra2', label: 'Sierra-2' },
                          { value: 'none', label: '无抖动' },
                        ]}
                      />
                      <Text type="secondary" style={{ display: 'block', marginBottom: 8, marginTop: 16 }}>
                        最大宽度（像素）
                      </Text>
                      <InputNumber
                        style={{ width: '100%', maxWidth: 360 }}
                        min={32}
                        max={4096}
                        placeholder="留空表示不缩放"
                        changeOnWheel={false}
                        value={gifCustomMaxWidth ?? undefined}
                        onChange={(v) => {
                          setGifCustomMaxWidth(v == null || !Number.isFinite(v) ? null : v)
                        }}
                      />
                      <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                        高度按比例缩放；不填则保持原始像素尺寸。与视频 CRF 无关。
                      </Paragraph>
                    </div>
                  )}
                </Space>
              )}
            </Space>
          </Card>
        )}

        {!busy && idleStatusText && !error && (
          <Alert style={{ marginTop: 16 }} type="warning" showIcon message={idleStatusText} />
        )}
        {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}

        <Modal
          title="压缩结果预览"
          open={resultPreviewOpen}
          onCancel={() => setResultPreviewOpen(false)}
          footer={null}
          centered
          width={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 48 : 900)}
          destroyOnHidden
        >
          {previewUrl && resultBlob && selectedFile && (
            <div style={{ textAlign: 'center' }}>
              {resultBlob.type.startsWith('video/') ? (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  style={{ width: '100%', maxHeight: '70vh', verticalAlign: 'middle' }}
                />
              ) : (
                <FileComparePreview
                  key={previewUrl}
                  file={selectedFile}
                  processedSrc={previewUrl}
                  altProcessed={resultName || '压缩后'}
                />
              )}
            </div>
          )}
        </Modal>
      </section>
    </div>
  )
}
