/** 实际写入 Worker 的编码格式 */
export type ImageEncodeFormat = 'jpeg' | 'webp' | 'png'

/** 界面选择：默认表示按原图类型输出（在发送 Worker 前会解析为 ImageEncodeFormat） */
export type ImageFormatPreference = 'original' | ImageEncodeFormat

export type ImageCompressOptions = {
  format: ImageEncodeFormat
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
