/// <reference lib="webworker" />

import type { ImageWorkerToMain, MainToImageWorker } from '../types/compress'

function postToMain(msg: ImageWorkerToMain, transfer?: Transferable[]) {
  ;(self as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? [])
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
    const outMime =
      options.format === 'jpeg'
        ? 'image/jpeg'
        : options.format === 'webp'
          ? 'image/webp'
          : 'image/png'
    const quality = options.format === 'png' ? undefined : options.quality
    const outBlob = await canvas.convertToBlob(
      quality !== undefined ? { type: outMime, quality } : { type: outMime },
    )
    const outBuf = await outBlob.arrayBuffer()
    postToMain(
      {
        type: 'image:done',
        jobId,
        buffer: outBuf,
        outputMime: outMime,
        width: w,
        height: h,
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
