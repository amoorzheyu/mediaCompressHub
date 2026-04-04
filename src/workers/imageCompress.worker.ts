/// <reference lib="webworker" />

import type { ImageEncodeFormat, ImageWorkerToMain, MainToImageWorker } from '../types/compress'

const MIN_QUALITY = 0.36

function postToMain(msg: ImageWorkerToMain, transfer?: Transferable[]) {
  ;(self as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? [])
}

async function encodeOnce(
  canvas: OffscreenCanvas,
  mime: string,
  quality?: number,
): Promise<{ buf: ArrayBuffer; size: number }> {
  const outBlob = await canvas.convertToBlob(
    quality !== undefined ? { type: mime, quality } : { type: mime },
  )
  const buf = await outBlob.arrayBuffer()
  return { buf, size: outBlob.size }
}

/**
 * 在「输出体积不大于原文件」前提下尽量提高质量：
 * - PNG：先无损；若仍更大则改为有损 WebP 并在质量上限内搜索。
 * - JPEG/WebP：从用户质量向下搜索；若最低质量仍更大则退回原文件。
 */
async function encodeUnderInputSize(
  canvas: OffscreenCanvas,
  inputBuffer: ArrayBuffer,
  inputMime: string,
  format: ImageEncodeFormat,
  userQuality: number,
): Promise<{ buffer: ArrayBuffer; outputMime: string; usedOriginalFallback: boolean }> {
  const inputSize = inputBuffer.byteLength
  const qCeil = Math.min(0.98, Math.max(MIN_QUALITY, userQuality))

  const tryLossyMime = async (
    mime: string,
    ceiling: number,
  ): Promise<{ buffer: ArrayBuffer; outputMime: string } | null> => {
    const top = await encodeOnce(canvas, mime, ceiling)
    if (top.size <= inputSize) {
      return { buffer: top.buf, outputMime: mime }
    }
    const bottom = await encodeOnce(canvas, mime, MIN_QUALITY)
    if (bottom.size > inputSize) return null

    let lo = MIN_QUALITY
    let hi = ceiling
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      const r = await encodeOnce(canvas, mime, mid)
      if (r.size <= inputSize) lo = mid
      else hi = mid
    }
    const best = await encodeOnce(canvas, mime, lo)
    return { buffer: best.buf, outputMime: mime }
  }

  if (format === 'png') {
    const png = await encodeOnce(canvas, 'image/png')
    if (png.size <= inputSize) {
      return { buffer: png.buf, outputMime: 'image/png', usedOriginalFallback: false }
    }
    const webp = await tryLossyMime('image/webp', qCeil)
    if (webp) {
      return { buffer: webp.buffer, outputMime: webp.outputMime, usedOriginalFallback: false }
    }
    return { buffer: inputBuffer, outputMime: inputMime, usedOriginalFallback: true }
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/webp'
  const lossy = await tryLossyMime(mime, qCeil)
  if (lossy) {
    return { buffer: lossy.buffer, outputMime: lossy.outputMime, usedOriginalFallback: false }
  }
  return { buffer: inputBuffer, outputMime: inputMime, usedOriginalFallback: true }
}

self.onmessage = async (ev: MessageEvent<MainToImageWorker>) => {
  const data = ev.data
  if (data.type === 'cancel') return
  if (data.type !== 'image:start') return

  const { jobId, buffer, inputMime, options } = data
  try {
    postToMain({ type: 'image:progress', jobId, progress: 5 })
    const blob = new Blob([buffer], { type: inputMime || 'application/octet-stream' })
    const bitmap = await createImageBitmap(blob)
    const maxW = options.maxWidth
    const w = maxW ? Math.min(bitmap.width, maxW) : bitmap.width
    const h = Math.max(1, Math.round((w / bitmap.width) * bitmap.height))
    postToMain({ type: 'image:progress', jobId, progress: 35 })

    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 2D 上下文')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    postToMain({ type: 'image:progress', jobId, progress: 70 })
    const { buffer: outBuf, outputMime, usedOriginalFallback } = await encodeUnderInputSize(
      canvas,
      buffer,
      inputMime || 'application/octet-stream',
      options.format,
      options.quality,
    )

    postToMain(
      {
        type: 'image:done',
        jobId,
        buffer: outBuf,
        outputMime,
        width: w,
        height: h,
        usedOriginalFallback,
      },
      [outBuf],
    )
  } catch (err) {
    postToMain({
      type: 'image:error',
      jobId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
