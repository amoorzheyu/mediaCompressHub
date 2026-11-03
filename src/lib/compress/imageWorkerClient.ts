import type { ImageCompressOptions, ImageWorkerToMain, MainToImageWorker } from '../../types/compress'

export function runImageCompress(
  jobId: string,
  buffer: ArrayBuffer,
  inputMime: string,
  options: ImageCompressOptions,
  onProgress: (p: number) => void,
): Promise<{
    buffer: ArrayBuffer
    outputMime: string
    width: number
    height: number
    usedOriginalFallback?: boolean
    targetUnmet?: boolean
  }> {
  // 每个任务独享 Worker，确保并发任务在不同线程编码，互不影响。
  const w = new Worker(new URL('../../workers/imageCompress.worker.ts', import.meta.url), {
    type: 'module',
  })
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      w.removeEventListener('messageerror', onMessageError)
      w.terminate()
    }
    const failWorker = (message: string) => {
      cleanup()
      reject(new Error(message))
    }
    const onError = (event: ErrorEvent) => failWorker(event.message || '图片压缩失败，请重试')
    const onMessageError = () => failWorker('无法读取图片压缩结果，请重试')
    const onMessage = (ev: MessageEvent<ImageWorkerToMain>) => {
      const msg = ev.data
      if (msg.jobId !== jobId) return
      if (msg.type === 'image:progress') {
        onProgress(msg.progress)
        return
      }
      if (msg.type === 'image:done') {
        cleanup()
        resolve({
          buffer: msg.buffer,
          outputMime: msg.outputMime,
          width: msg.width,
          height: msg.height,
          usedOriginalFallback: msg.usedOriginalFallback,
          targetUnmet: msg.targetUnmet,
        })
        return
      }
      if (msg.type === 'image:error') {
        cleanup()
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.addEventListener('messageerror', onMessageError)
    const payload: MainToImageWorker = {
      type: 'image:start',
      jobId,
      buffer,
      inputMime,
      options,
    }
    try {
      w.postMessage(payload, [buffer])
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
