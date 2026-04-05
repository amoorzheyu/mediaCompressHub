/** 实际写入 Worker 的编码格式 */
export type ImageEncodeFormat = 'jpeg' | 'webp' | 'png'

/** 界面选择：默认表示按原图类型输出（在发送 Worker 前会解析为 ImageEncodeFormat） */
export type ImageFormatPreference = 'original' | ImageEncodeFormat

export type ImageCompressOptions = {
  format: ImageEncodeFormat
  quality: number
  maxWidth?: number
  /** 输出体积需不超过此值（字节）。未设置时 Worker 使用原图大小作为上限（手动模式） */
  maxOutputBytes?: number
  /** 有损编码时的质量搜索上限。智能压缩时通常为 0.98；未设置时由 quality 推导 */
  qualityCeiling?: number
  /** 有损编码质量下限 0～1（与设置页「图片最低质量」一致），未设置时 Worker 内默认 0.2 */
  minQuality?: number
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
      /** 无法在减小体积的前提下重编码，已退回原始字节（当前图片有损路径一般不再使用） */
      usedOriginalFallback?: boolean
      /** 最低质量仍大于体积预算，已改为输出该最小编码结果 */
      targetUnmet?: boolean
    }
  | { type: 'image:error'; jobId: string; message: string }

export type GifDitherMode = 'bayer' | 'floyd_steinberg' | 'sierra2' | 'none'

/** GIF 重编码参数（palettegen / paletteuse） */
export type GifEncodeOptions = {
  maxFps: number
  maxColors: number
  dither: GifDitherMode
  /** 限制最大宽度，高度按比例；不传或 0 表示不缩放 */
  maxWidth?: number
}

export type FfmpegWorkerIn =
  | { type: 'load' }
  | {
      type: 'run'
      jobId: string
      buffer: ArrayBuffer
      inputFileName: string
      mode: 'gif' | 'video'
      crf: number
      /** 仅 mode === 'video' 时有效：true 保留并重编码为 AAC；false 去除音轨 */
      keepAudio?: boolean
      /** 仅 mode === 'gif'：不传时使用与历史版本一致的默认参数 */
      gifOptions?: GifEncodeOptions
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
