import { useCallback, useEffect, useState } from 'react'
import { runImageCompress } from '../lib/compress/imageWorkerClient'
import { preloadFfmpeg, runFfmpegCompress } from '../lib/compress/ffmpegWorkerClient'
import { addJob } from '../lib/idb/db'
import { makeThumbnailBlob } from '../lib/thumbnail'
import { formatBytes } from '../lib/formatBytes'
import type { ImageOutputFormat } from '../types/compress'
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function HomePage() {
  const [format, setFormat] = useState<ImageOutputFormat>('webp')
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

  const fileKind = selectedFile ? classifyFile(selectedFile) : null
  const imageOptionsDisabled = busy || fileKind === 'gif' || fileKind === 'video'
  const ffmpegOptionsDisabled = busy || fileKind === 'image'

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

  const pickFile = useCallback((file: File) => {
    setSelectedFile(file)
    setError(null)
    setStatusText('')
    setResultBlob(null)
    setResultName('')
    setPreviewForBlob(null)
    setLastStats(null)
    setProgress(0)
  }, [setPreviewForBlob])

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
          setStatusText('在后台 Worker 中压缩图片…')
          const out = await runImageCompress(
            jobId,
            buf,
            file.type || 'image/jpeg',
            {
              format,
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

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) pickFile(f)
      e.target.value = ''
    },
    [pickFile],
  )

  const onStartCompress = useCallback(() => {
    if (!selectedFile || busy) return
    void processFile(selectedFile)
  }, [busy, processFile, selectedFile])

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
        <div
          className={styles.dropzone}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          data-busy={busy}
        >
          <input
            className={styles.fileInput}
            type="file"
            accept="image/*,video/*"
            onChange={onFileInput}
            disabled={busy}
            aria-label="选择图片或视频文件"
          />
          <div className={styles.dropzoneInner}>
            <p className={styles.dropTitle}>拖放文件到此处，或点击选择</p>
            <p className={styles.dropHint}>
              选择文件后请确认下方参数，再点击「开始压缩」。源文件格式由浏览器自动识别，无需手动指定。
            </p>
          </div>
        </div>

        {selectedFile && (
          <div className={styles.selectionBar}>
            <div className={styles.selectionInfo}>
              <span className={styles.selectionName}>{selectedFile.name}</span>
              <span className={styles.selectionMeta}>
                {formatBytes(selectedFile.size)} · {kindLabel(classifyFile(selectedFile))}
                {selectedFile.type ? ` · ${selectedFile.type}` : ''}
              </span>
            </div>
            <div className={styles.selectionActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onStartCompress}
                disabled={busy}
              >
                开始压缩
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={clearSelection}
                disabled={busy}
              >
                移除文件
              </button>
            </div>
          </div>
        )}

        <div className={styles.options}>
          <fieldset className={styles.fieldset} disabled={imageOptionsDisabled}>
            <legend>静态图片 · 仅输出选项</legend>
            <p className={styles.fieldHint}>
              JPEG / PNG / WebP 等源格式由您上传的文件决定；此处只选择<strong>压缩后的输出格式</strong>与参数。
            </p>
            <label className={styles.row}>
              输出格式
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ImageOutputFormat)}
                disabled={imageOptionsDisabled}
              >
                <option value="webp">WebP</option>
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
              </select>
            </label>
            <label className={styles.row}>
              质量 {(quality * 100).toFixed(0)}%
              <input
                type="range"
                min={0.4}
                max={0.95}
                step={0.01}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                disabled={imageOptionsDisabled}
              />
            </label>
            <label className={styles.row}>
              最大边长 (px，0 表示不缩放)
              <input
                type="number"
                min={0}
                step={1}
                value={maxWidth}
                onChange={(e) => setMaxWidth(Number(e.target.value))}
                disabled={imageOptionsDisabled}
              />
            </label>
            {(fileKind === 'gif' || fileKind === 'video') && (
              <p className={styles.fieldMuted}>当前文件为 GIF 或视频，请使用右侧 FFmpeg 选项。</p>
            )}
          </fieldset>

          <fieldset className={styles.fieldset} disabled={ffmpegOptionsDisabled}>
            <legend>GIF / 视频（FFmpeg.wasm · Worker）</legend>
            <p className={styles.fieldHint}>
              首次处理 GIF 或视频时会下载 FFmpeg 核心（约数十 MB），仅在您的浏览器缓存中。
            </p>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void handlePreloadFfmpeg()}
              disabled={busy || ffmpegLoading || ffmpegReady}
            >
              {ffmpegReady ? 'FFmpeg 已预加载' : ffmpegLoading ? '正在加载…' : '预加载 FFmpeg'}
            </button>
            <label className={styles.row}>
              视频 CRF（越大体积越小，画质越低）
              <input
                type="number"
                min={18}
                max={40}
                value={crf}
                onChange={(e) => setCrf(Number(e.target.value))}
                disabled={ffmpegOptionsDisabled}
              />
            </label>
            <label className={styles.row}>
              目标最大宽度 (GIF / 视频缩放)
              <input
                type="number"
                min={160}
                max={3840}
                step={1}
                value={scaleWidth}
                onChange={(e) => setScaleWidth(Number(e.target.value))}
                disabled={ffmpegOptionsDisabled}
              />
            </label>
            {fileKind === 'image' && (
              <p className={styles.fieldMuted}>当前为静态图片，请使用左侧输出格式选项。</p>
            )}
          </fieldset>
        </div>

        {busy && (
          <div className={styles.progressWrap} role="status" aria-live="polite">
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
            <p className={styles.status}>{statusText}</p>
          </div>
        )}

        {!busy && statusText && !error && <p className={styles.statusOk}>{statusText}</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {lastStats && (
          <div className={styles.stats}>
            <span>
              {lastStats.inName}: {formatBytes(lastStats.inBytes)} → {formatBytes(lastStats.outBytes)}
            </span>
            {lastStats.inBytes > 0 && (
              <span className={styles.saved}>
                约省 {(100 * (1 - lastStats.outBytes / lastStats.inBytes)).toFixed(1)}%
              </span>
            )}
          </div>
        )}

        {resultBlob && (
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} onClick={() => downloadBlob(resultBlob, resultName)}>
              下载结果
            </button>
            {previewUrl && (
              <a className={styles.previewLink} href={previewUrl} target="_blank" rel="noreferrer">
                新窗口预览
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
