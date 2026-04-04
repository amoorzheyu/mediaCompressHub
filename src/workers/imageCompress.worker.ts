/// <reference lib="webworker" />

import type { ImageEncodeFormat, ImageWorkerToMain, MainToImageWorker } from '../types/compress'

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

/**
 * 在「输出体积不大于 budgetBytes」前提下尽量提高质量（二分法在质量轴上搜索）：
 * - PNG：先无损；若仍更大则改为有损 WebP 并在质量上限内搜索。
 * - JPEG/WebP：从质量上限向下二分；若最低质量仍大于预算，则输出该最低质量结果并标记 targetUnmet。
 */
async function encodeUnderBudget(
  canvas: OffscreenCanvas,
  budgetBytes: number,
  format: ImageEncodeFormat,
  qualityCeil: number,
  minQ: number,
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

  if (format === 'png') {
    const png = await encodeOnce(canvas, 'image/png')
    if (png.size <= budget) {
      return {
        buffer: png.buf,
        outputMime: 'image/png',
        usedOriginalFallback: false,
        targetUnmet: false,
      }
    }
    const webp = await tryLossyMime('image/webp', qCeil)
    return {
      buffer: webp.buffer,
      outputMime: webp.outputMime,
      usedOriginalFallback: false,
      targetUnmet: webp.targetUnmet,
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
