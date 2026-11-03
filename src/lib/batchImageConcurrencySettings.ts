const STORAGE_KEY = 'media-compress-hub:batch-image-concurrency'

export const DEFAULT_BATCH_IMAGE_CONCURRENCY = 3
export const MAX_BATCH_IMAGE_CONCURRENCY = 16

export function clampBatchImageConcurrency(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_IMAGE_CONCURRENCY
  return Math.min(MAX_BATCH_IMAGE_CONCURRENCY, Math.max(1, Math.trunc(value)))
}

export function readBatchImageConcurrency(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored == null || stored.trim() === '') return DEFAULT_BATCH_IMAGE_CONCURRENCY
    const value = Number(stored)
    if (!Number.isInteger(value) || value < 1) return DEFAULT_BATCH_IMAGE_CONCURRENCY
    return clampBatchImageConcurrency(value)
  } catch {
    return DEFAULT_BATCH_IMAGE_CONCURRENCY
  }
}

export function writeBatchImageConcurrency(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampBatchImageConcurrency(value)))
  } catch { /* 本地存储不可用时仍允许本次使用 */ }
}
