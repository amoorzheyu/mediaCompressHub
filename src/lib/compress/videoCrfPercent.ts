/** 将视频 CRF（18～40）与界面「压缩强度」0～100% 线性互转；百分比为抽象档位，非真实体积比例。 */

export const VIDEO_CRF_MIN = 18
export const VIDEO_CRF_MAX = 40

const SPAN = VIDEO_CRF_MAX - VIDEO_CRF_MIN

export function videoCompressPercentToCrf(percent: number): number {
  const p = Math.max(0, Math.min(100, percent))
  const crf = Math.round(VIDEO_CRF_MIN + (p / 100) * SPAN)
  return Math.max(VIDEO_CRF_MIN, Math.min(VIDEO_CRF_MAX, crf))
}

export function videoCrfToCompressPercent(crf: number): number {
  const c = Math.max(VIDEO_CRF_MIN, Math.min(VIDEO_CRF_MAX, crf))
  return Math.round(((c - VIDEO_CRF_MIN) / SPAN) * 100)
}

/** 与默认 CRF 28 对齐的强度（约 45%） */
export const DEFAULT_VIDEO_COMPRESS_PERCENT = videoCrfToCompressPercent(28)
