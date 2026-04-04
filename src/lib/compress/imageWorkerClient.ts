import type { ImageCompressOptions, ImageWorkerToMain, MainToImageWorker } from '../../types/compress'

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/imageCompress.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return worker
}

export function runImageCompress(
  jobId: string,
  buffer: ArrayBuffer,
  inputMime: string,
  options: ImageCompressOptions,
  onProgress: (p: number) => void,
): Promise<{ buffer: ArrayBuffer; outputMime: string; width: number; height: number }> {
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<ImageWorkerToMain>) => {
      const msg = ev.data
      if (msg.jobId !== jobId) return
      if (msg.type === 'image:progress') {
        onProgress(msg.progress)
        return
      }
      if (msg.type === 'image:done') {
        w.removeEventListener('message', onMessage)
        resolve({
          buffer: msg.buffer,
          outputMime: msg.outputMime,
          width: msg.width,
          height: msg.height,
        })
        return
      }
      if (msg.type === 'image:error') {
        w.removeEventListener('message', onMessage)
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', onMessage)
    const payload: MainToImageWorker = {
      type: 'image:start',
      jobId,
      buffer,
      inputMime,
      options,
    }
    w.postMessage(payload, [buffer])
  })
}
