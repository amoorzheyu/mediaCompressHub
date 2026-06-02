/// <reference lib="webworker" />

import type { ImageWorkerEncodeFormat, ImageWorkerToMain, MainToImageWorker } from '../types/compress'

const DEFAULT_MIN_QUALITY = 0.2

function clampMinQuality(v: number | undefined): number {
  const raw = v ?? DEFAULT_MIN_QUALITY
  return Math.min(0.98, Math.max(0.05, raw))
}

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

function canvasHasAlpha(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = ctx.getImageData(0, 0, width, height).data
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) return true
  }
  return false
}

/**
 * 在「输出体积不大于 budgetBytes」前提下尽量提高质量（二分法在质量轴上搜索）：
 * - 自动：在 WebP、PNG、无透明时的 JPEG 中选择体积最合适的结果。
 * - PNG：保持 PNG 无损编码；若仍大于预算，则输出 PNG 并标记 targetUnmet。
 * - JPEG/WebP：从质量上限向下二分；若最低质量仍大于预算，则输出该最低质量结果并标记 targetUnmet。
 */
async function encodeUnderBudget(
  canvas: OffscreenCanvas,
  budgetBytes: number,
  format: ImageWorkerEncodeFormat,
  qualityCeil: number,
  minQ: number,
  hasAlpha: boolean,
): Promise<{
  buffer: ArrayBuffer
  outputMime: string
  usedOriginalFallback: boolean
  targetUnmet: boolean
}> {
  const budget = Math.max(1, budgetBytes)
  const qCeil = Math.min(0.98, Math.max(minQ, qualityCeil))

  const tryLossyMime = async (
    mime: string,
    ceiling: number,
  ): Promise<{ buffer: ArrayBuffer; outputMime: string; targetUnmet: boolean }> => {
    const top = await encodeOnce(canvas, mime, ceiling)
    if (top.size <= budget) {
      return { buffer: top.buf, outputMime: mime, targetUnmet: false }
    }
    const bottom = await encodeOnce(canvas, mime, minQ)
    if (bottom.size > budget) {
      return { buffer: bottom.buf, outputMime: mime, targetUnmet: true }
    }

    let lo = minQ
    let hi = ceiling
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      const r = await encodeOnce(canvas, mime, mid)
      if (r.size <= budget) lo = mid
      else hi = mid
    }
    const best = await encodeOnce(canvas, mime, lo)
    return { buffer: best.buf, outputMime: mime, targetUnmet: false }
  }

  if (format === 'auto') {
    const candidates: { buffer: ArrayBuffer; outputMime: string; size: number; targetUnmet: boolean }[] = []

    const webp = await tryLossyMime('image/webp', qCeil)
    candidates.push({
      buffer: webp.buffer,
      outputMime: webp.outputMime,
      size: webp.buffer.byteLength,
      targetUnmet: webp.targetUnmet,
    })

    const png = await encodeOnce(canvas, 'image/png')
    candidates.push({
      buffer: png.buf,
      outputMime: 'image/png',
      size: png.size,
      targetUnmet: png.size > budget,
    })

    if (!hasAlpha) {
      const jpeg = await tryLossyMime('image/jpeg', qCeil)
      candidates.push({
        buffer: jpeg.buffer,
        outputMime: jpeg.outputMime,
        size: jpeg.buffer.byteLength,
        targetUnmet: jpeg.targetUnmet,
      })
    }

    const viable = candidates.filter((candidate) => !candidate.targetUnmet)
    const best = (viable.length ? viable : candidates).reduce((smallest, candidate) =>
      candidate.size < smallest.size ? candidate : smallest,
    )
    return {
      buffer: best.buffer,
      outputMime: best.outputMime,
      usedOriginalFallback: false,
      targetUnmet: best.targetUnmet,
    }
  }

  if (format === 'png') {
    const png = await encodeOnce(canvas, 'image/png')
    return {
      buffer: png.buf,
      outputMime: 'image/png',
      usedOriginalFallback: false,
      targetUnmet: png.size > budget,
    }
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/webp'
  const lossy = await tryLossyMime(mime, qCeil)
  return {
    buffer: lossy.buffer,
    outputMime: lossy.outputMime,
    usedOriginalFallback: false,
    targetUnmet: lossy.targetUnmet,
  }
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
    const hasAlpha = canvasHasAlpha(ctx, w, h)

    postToMain({ type: 'image:progress', jobId, progress: 70 })
    const budgetBytes = options.maxOutputBytes ?? buffer.byteLength
    const minQ = clampMinQuality(options.minQuality)
    const qualityCeil =
      options.qualityCeiling ?? Math.min(0.98, Math.max(minQ, options.quality))
    const { buffer: outBuf, outputMime, usedOriginalFallback, targetUnmet } = await encodeUnderBudget(
      canvas,
      budgetBytes,
      options.format,
      qualityCeil,
      minQ,
      hasAlpha,
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
        targetUnmet,
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
