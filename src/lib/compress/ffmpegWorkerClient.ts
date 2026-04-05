import type { FfmpegWorkerIn, FfmpegWorkerToMain, GifEncodeOptions } from '../../types/compress'

let worker: Worker | null = null
let preloadTask: Promise<void> | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/ffmpegCompress.worker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return worker
}

export function preloadFfmpeg(): Promise<void> {
  if (preloadTask) return preloadTask
  const w = getWorker()
  preloadTask = new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<FfmpegWorkerToMain>) => {
      const msg = ev.data
      if (msg.type === 'load:done') {
        w.removeEventListener('message', onMessage)
        resolve()
      } else if (msg.type === 'load:error') {
        w.removeEventListener('message', onMessage)
        preloadTask = null
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', onMessage)
    const payload: FfmpegWorkerIn = { type: 'load' }
    w.postMessage(payload)
  })
  return preloadTask
}

export function runFfmpegCompress(
  jobId: string,
  buffer: ArrayBuffer,
  inputFileName: string,
  mode: 'gif' | 'video',
  crf: number,
  onProgress: (p: number) => void,
  /** 仅视频 MP4：默认 true 保留音轨并重编码为 AAC */
  keepAudio = true,
  /** 仅 GIF：调色板与帧率等参数 */
  gifOptions?: GifEncodeOptions,
): Promise<{ buffer: ArrayBuffer; outputMime: string; outputFileName: string }> {
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<FfmpegWorkerToMain>) => {
      const msg = ev.data
      if (msg.type === 'ffmpeg:progress' && msg.jobId === jobId) {
        onProgress(msg.progress)
        return
      }
      if (msg.type === 'ffmpeg:done' && msg.jobId === jobId) {
        w.removeEventListener('message', onMessage)
        resolve({
          buffer: msg.buffer,
          outputMime: msg.outputMime,
          outputFileName: msg.outputFileName,
        })
        return
      }
      if (msg.type === 'ffmpeg:error' && msg.jobId === jobId) {
        w.removeEventListener('message', onMessage)
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', onMessage)
    const payload: FfmpegWorkerIn = {
      type: 'run',
      jobId,
      buffer,
      inputFileName,
      mode,
      crf,
      ...(mode === 'video' ? { keepAudio } : {}),
      ...(mode === 'gif' && gifOptions ? { gifOptions } : {}),
    }
    w.postMessage(payload, [buffer])
  })
}
