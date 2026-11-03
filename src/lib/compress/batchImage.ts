import { zip } from 'fflate'
import { runImageCompress } from './imageWorkerClient'
import { addJob } from '../idb/db'
import { makeThumbnailBlob } from '../thumbnail'
import { resolveEncodeFormat } from '../resolveImageFormat'
import type { ImageCompressOptions, ImageFormatPreference } from '../../types/compress'

export type BatchImageSettings = {
  format: ImageFormatPreference
  mode: 'smart' | 'manual'
  quality: number
  minQuality: number
  targetBytes: number | null
}

export type BatchImageResult = {
  blob: Blob
  name: string
  /** 仅智能模式存在用户设定的目标体积，状态按本次任务的模式保存。 */
  targetUnmet: boolean
  sizeNotReduced: boolean
  historyError?: string
}

export function isStaticImage(file: File): boolean {
  return /^image\/(jpeg|jpg|png|webp|bmp|x-ms-bmp|avif)$/i.test(file.type) ||
    (!file.type && /\.(jpe?g|png|webp|bmp|avif)$/i.test(file.name))
}

export async function compressBatchImage(
  file: File,
  settings: BatchImageSettings,
  onProgress: (progress: number) => void,
): Promise<BatchImageResult> {
  const id = crypto.randomUUID()
  const options: ImageCompressOptions = {
    format: settings.mode === 'smart' && settings.format === 'auto'
      ? 'auto' : resolveEncodeFormat(settings.format, file),
    quality: settings.quality,
    minQuality: settings.minQuality,
  }
  if (settings.mode === 'smart') {
    if (settings.targetBytes == null || !Number.isFinite(settings.targetBytes) || settings.targetBytes <= 0) {
      throw new Error('请填写有效的目标体积')
    }
    options.maxOutputBytes = settings.targetBytes
    options.qualityCeiling = 0.98
  }
  let result: BatchImageResult
  try {
    const out = await runImageCompress(id, await file.arrayBuffer(), file.type, options, onProgress)
    const blob = new Blob([out.buffer], { type: out.outputMime })
    const ext = out.outputMime === 'image/jpeg' ? 'jpg' : out.outputMime === 'image/webp' ? 'webp' : 'png'
    result = {
      blob,
      name: out.usedOriginalFallback ? file.name : `${file.name.replace(/\.[^.]+$/, '')}-compressed.${ext}`,
      targetUnmet: settings.mode === 'smart' && Boolean(out.targetUnmet),
      sizeNotReduced: blob.size >= file.size,
    }
    try {
      await addJob({
        id, createdAt: Date.now(), kind: 'image', inputName: file.name, inputMime: file.type,
        inputBytes: file.size, outputMime: blob.type, outputBytes: blob.size,
        ratio: file.size ? Math.max(0, 1 - blob.size / file.size) : 0,
        status: 'done', width: out.width, height: out.height,
        thumbnailBlob: await makeThumbnailBlob(blob),
      })
    } catch {
      result.historyError = '历史记录保存失败，仍可下载结果'
    }
  } catch (error) {
    try {
      await addJob({
        id, createdAt: Date.now(), kind: 'image', inputName: file.name, inputMime: file.type,
        inputBytes: file.size, outputMime: '', outputBytes: 0, ratio: 0, status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    } catch { /* 历史记录不可用时仍继续队列 */ }
    throw error
  }
  return result
}

/** ZIP 内保留所有同名结果，避免覆盖；文件名不携带路径。 */
export async function zipImageResults(results: BatchImageResult[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = Object.create(null)
  for (const result of results) {
    const name = result.name.replace(/[\\/]/g, '_')
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let unique = name
    let index = 2
    while (Object.hasOwn(entries, unique)) unique = `${base} (${index++})${ext}`
    entries[unique] = new Uint8Array(await result.blob.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => {
      if (error) reject(error)
      else resolve(new Blob([new Uint8Array(data)], { type: 'application/zip' }))
    })
  })
}
