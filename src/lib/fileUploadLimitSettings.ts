/** localStorage：各类型单文件上传体积上限（字节，整数字符串） */

export const MAX_UPLOAD_IMAGE_KEY = 'media-compress-hub:max-upload-bytes-image'
export const MAX_UPLOAD_GIF_KEY = 'media-compress-hub:max-upload-bytes-gif'
export const MAX_UPLOAD_VIDEO_KEY = 'media-compress-hub:max-upload-bytes-video'

const MB = 1024 * 1024
const GB = 1024 * 1024 * 1024

export const DEFAULT_IMAGE_MAX_UPLOAD_BYTES = 50 * MB
export const DEFAULT_GIF_MAX_UPLOAD_BYTES = 500 * MB
export const DEFAULT_VIDEO_MAX_UPLOAD_BYTES = 5 * GB

/** 设置页可调范围 */
export const IMAGE_MAX_UPLOAD_MB_MIN = 1
export const IMAGE_MAX_UPLOAD_MB_MAX = 500
export const GIF_MAX_UPLOAD_MB_MIN = 10
export const GIF_MAX_UPLOAD_MB_MAX = 2048
export const VIDEO_MAX_UPLOAD_GB_MIN = 0.5
export const VIDEO_MAX_UPLOAD_GB_MAX = 20

function parseStoredBytes(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return fallback
    const n = Number.parseInt(v, 10)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return n
  } catch {
    return fallback
  }
}

export function clampImageMaxUploadBytes(n: number): number {
  const lo = IMAGE_MAX_UPLOAD_MB_MIN * MB
  const hi = IMAGE_MAX_UPLOAD_MB_MAX * MB
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

export function clampGifMaxUploadBytes(n: number): number {
  const lo = GIF_MAX_UPLOAD_MB_MIN * MB
  const hi = GIF_MAX_UPLOAD_MB_MAX * MB
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

export function clampVideoMaxUploadBytes(n: number): number {
  const lo = Math.round(VIDEO_MAX_UPLOAD_GB_MIN * GB)
  const hi = Math.round(VIDEO_MAX_UPLOAD_GB_MAX * GB)
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

export function readImageMaxUploadBytes(): number {
  return clampImageMaxUploadBytes(parseStoredBytes(MAX_UPLOAD_IMAGE_KEY, DEFAULT_IMAGE_MAX_UPLOAD_BYTES))
}

export function readGifMaxUploadBytes(): number {
  return clampGifMaxUploadBytes(parseStoredBytes(MAX_UPLOAD_GIF_KEY, DEFAULT_GIF_MAX_UPLOAD_BYTES))
}

export function readVideoMaxUploadBytes(): number {
  return clampVideoMaxUploadBytes(parseStoredBytes(MAX_UPLOAD_VIDEO_KEY, DEFAULT_VIDEO_MAX_UPLOAD_BYTES))
}

export function writeImageMaxUploadBytes(bytes: number): void {
  try {
    localStorage.setItem(MAX_UPLOAD_IMAGE_KEY, String(clampImageMaxUploadBytes(bytes)))
  } catch {
    /* ignore */
  }
}

export function writeGifMaxUploadBytes(bytes: number): void {
  try {
    localStorage.setItem(MAX_UPLOAD_GIF_KEY, String(clampGifMaxUploadBytes(bytes)))
  } catch {
    /* ignore */
  }
}

export function writeVideoMaxUploadBytes(bytes: number): void {
  try {
    localStorage.setItem(MAX_UPLOAD_VIDEO_KEY, String(clampVideoMaxUploadBytes(bytes)))
  } catch {
    /* ignore */
  }
}

export function maxUploadBytesForKind(kind: 'image' | 'gif' | 'video'): number {
  if (kind === 'gif') return readGifMaxUploadBytes()
  if (kind === 'video') return readVideoMaxUploadBytes()
  return readImageMaxUploadBytes()
}
