import type { ImageEncodeFormat, ImageFormatPreference } from '../types/compress'

function mimeFromFileName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.avif')) return 'image/avif'
  return ''
}

/**
 * 将用户选择的输出偏好解析为 Worker 可用的编码格式。
 * 「保持原格式」时：JPEG/PNG/WebP 一一对应；BMP 用 PNG；AVIF/未知 用 WebP（浏览器侧易编码）。
 */
export function resolveEncodeFormat(preference: ImageFormatPreference, file: File): ImageEncodeFormat {
  if (preference !== 'original') return preference

  const raw = (file.type || mimeFromFileName(file.name)).toLowerCase()
  const mime = raw.split(';')[0].trim()

  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/pjpeg') return 'jpeg'
  if (mime === 'image/png' || mime === 'image/x-png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/bmp' || mime === 'image/x-ms-bmp') return 'png'
  if (mime === 'image/avif') return 'webp'
  if (mime.startsWith('image/')) return 'webp'

  return 'webp'
}
