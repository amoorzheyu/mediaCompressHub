export type ImageOutputFormat = 'jpeg' | 'webp' | 'png'

export type ImageCompressOptions = {
  format: ImageOutputFormat
  quality: number
  maxWidth?: number
}

export type MainToImageWorker =
  | {
      type: 'image:start'
      jobId: string
      buffer: ArrayBuffer
      inputMime: string
      options: ImageCompressOptions
    }
  | { type: 'cancel'; jobId: string }

export type ImageWorkerToMain =
  | { type: 'image:progress'; jobId: string; progress: number }
  | {
      type: 'image:done'
      jobId: string
      buffer: ArrayBuffer
      outputMime: string
      width: number
      height: number
    }
  | { type: 'image:error'; jobId: string; message: string }

export type FfmpegWorkerIn =
  | { type: 'load' }
  | {
      type: 'run'
      jobId: string
      buffer: ArrayBuffer
      inputFileName: string
      mode: 'gif' | 'video'
      crf: number
      scaleWidth: number
    }

export type FfmpegWorkerToMain =
  | { type: 'load:done' }
  | { type: 'load:error'; message: string }
  | { type: 'ffmpeg:progress'; jobId: string; progress: number }
  | {
      type: 'ffmpeg:done'
      jobId: string
      buffer: ArrayBuffer
      outputMime: string
      outputFileName: string
    }
  | { type: 'ffmpeg:error'; jobId: string; message: string }
