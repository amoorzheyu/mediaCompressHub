/** localStorage：图片有损编码质量下限（百分数整数，如 20 表示 20%） */

export const IMAGE_MIN_QUALITY_STORAGE_KEY = 'media-compress-hub:image-min-quality-percent'

export const DEFAULT_IMAGE_MIN_QUALITY_PERCENT = 20

/** 设置里可调范围（百分数） */
export const IMAGE_MIN_QUALITY_MIN_PCT = 5
export const IMAGE_MIN_QUALITY_MAX_PCT = 90

export function clampImageMinQualityPercent(n: number): number {
  const r = Math.round(n)
  return Math.min(IMAGE_MIN_QUALITY_MAX_PCT, Math.max(IMAGE_MIN_QUALITY_MIN_PCT, r))
}

export function readImageMinQualityPercent(): number {
  try {
    const v = localStorage.getItem(IMAGE_MIN_QUALITY_STORAGE_KEY)
    if (v == null) return DEFAULT_IMAGE_MIN_QUALITY_PERCENT
    const parsed = Number.parseInt(v, 10)
    if (!Number.isFinite(parsed)) return DEFAULT_IMAGE_MIN_QUALITY_PERCENT
    return clampImageMinQualityPercent(parsed)
  } catch {
    return DEFAULT_IMAGE_MIN_QUALITY_PERCENT
  }
}

export function writeImageMinQualityPercent(percent: number): void {
  try {
    localStorage.setItem(IMAGE_MIN_QUALITY_STORAGE_KEY, String(clampImageMinQualityPercent(percent)))
  } catch {
    /* 隐私模式等 */
  }
}

/** 传入 Worker 的 0～1 小数 */
export function readImageMinQualityDecimal(): number {
  return readImageMinQualityPercent() / 100
}
