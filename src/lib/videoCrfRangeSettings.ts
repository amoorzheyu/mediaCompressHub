/** localStorage：视频压缩 CRF 可调范围（上下限）与当前目标 CRF */

export const VIDEO_CRF_RANGE_MIN_KEY = 'media-compress-hub:video-crf-range-min'
export const VIDEO_CRF_RANGE_MAX_KEY = 'media-compress-hub:video-crf-range-max'
export const VIDEO_TARGET_CRF_KEY = 'media-compress-hub:video-target-crf'

export const DEFAULT_VIDEO_CRF_RANGE_MIN = 18
export const DEFAULT_VIDEO_CRF_RANGE_MAX = 40
/** 默认目标 CRF，在范围内使用；改范围后会自动夹紧 */
export const DEFAULT_VIDEO_TARGET_CRF = 28

/**
 * 设置页允许填写的 CRF 上下限范围（可宽于编码器实际支持，便于自定义滑块刻度）。
 * libx264 实际 -crf 见 VIDEO_X264_CRF_ENCODE_MAX。
 */
export const VIDEO_CRF_SETTING_ABS_MIN = 0
export const VIDEO_CRF_SETTING_ABS_MAX = 99

/** libx264 在 CRF 模式下实际可用的夹紧范围（编码前强制落在此区间） */
export const VIDEO_X264_CRF_ENCODE_MIN = 0
export const VIDEO_X264_CRF_ENCODE_MAX = 51

export function clampCrfForX264Encode(crf: number): number {
  const r = Math.round(crf)
  return Math.min(VIDEO_X264_CRF_ENCODE_MAX, Math.max(VIDEO_X264_CRF_ENCODE_MIN, r))
}

export type VideoCrfRange = { min: number; max: number }

export function clampVideoCrfAbsolute(crf: number): number {
  const r = Math.round(crf)
  return Math.min(VIDEO_CRF_SETTING_ABS_MAX, Math.max(VIDEO_CRF_SETTING_ABS_MIN, r))
}

/** 保证 min ≤ max；允许二者相等（此时首页滑块全程对应同一 CRF） */
export function normalizeVideoCrfRange(min: number, max: number): VideoCrfRange {
  let a = clampVideoCrfAbsolute(min)
  let b = clampVideoCrfAbsolute(max)
  if (a > b) {
    const t = a
    a = b
    b = t
  }
  return { min: a, max: b }
}

export function readVideoCrfRange(): VideoCrfRange {
  try {
    const rawMin = localStorage.getItem(VIDEO_CRF_RANGE_MIN_KEY)
    const rawMax = localStorage.getItem(VIDEO_CRF_RANGE_MAX_KEY)
    if (rawMin == null && rawMax == null) {
      return { min: DEFAULT_VIDEO_CRF_RANGE_MIN, max: DEFAULT_VIDEO_CRF_RANGE_MAX }
    }
    const pMin = rawMin != null ? Number.parseInt(rawMin, 10) : DEFAULT_VIDEO_CRF_RANGE_MIN
    const pMax = rawMax != null ? Number.parseInt(rawMax, 10) : DEFAULT_VIDEO_CRF_RANGE_MAX
    if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) {
      return { min: DEFAULT_VIDEO_CRF_RANGE_MIN, max: DEFAULT_VIDEO_CRF_RANGE_MAX }
    }
    return normalizeVideoCrfRange(pMin, pMax)
  } catch {
    return { min: DEFAULT_VIDEO_CRF_RANGE_MIN, max: DEFAULT_VIDEO_CRF_RANGE_MAX }
  }
}

export function writeVideoCrfRange(min: number, max: number): void {
  try {
    const { min: lo, max: hi } = normalizeVideoCrfRange(min, max)
    localStorage.setItem(VIDEO_CRF_RANGE_MIN_KEY, String(lo))
    localStorage.setItem(VIDEO_CRF_RANGE_MAX_KEY, String(hi))
    syncTargetCrfToRange(lo, hi)
  } catch {
    /* 隐私模式等 */
  }
}

function readVideoTargetCrfStored(): number {
  try {
    const v = localStorage.getItem(VIDEO_TARGET_CRF_KEY)
    if (v == null) return DEFAULT_VIDEO_TARGET_CRF
    const parsed = Number.parseInt(v, 10)
    if (!Number.isFinite(parsed)) return DEFAULT_VIDEO_TARGET_CRF
    return clampVideoCrfAbsolute(parsed)
  } catch {
    return DEFAULT_VIDEO_TARGET_CRF
  }
}

function syncTargetCrfToRange(rangeMin: number, rangeMax: number): void {
  const raw = readVideoTargetCrfStored()
  const clamped = Math.min(rangeMax, Math.max(rangeMin, raw))
  try {
    localStorage.setItem(VIDEO_TARGET_CRF_KEY, String(clamped))
  } catch {
    /* */
  }
}

/** 当前范围下的目标 CRF（已夹紧） */
export function readVideoTargetCrf(): number {
  const { min, max } = readVideoCrfRange()
  const raw = readVideoTargetCrfStored()
  return Math.min(max, Math.max(min, raw))
}

export function writeVideoTargetCrf(crf: number): void {
  const { min, max } = readVideoCrfRange()
  const v = Math.min(max, Math.max(min, Math.round(crf)))
  try {
    localStorage.setItem(VIDEO_TARGET_CRF_KEY, String(v))
  } catch {
    /* */
  }
}
