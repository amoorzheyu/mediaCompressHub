import type { GifEncodeOptions } from '../types/compress'

/** 构建 FFmpeg -vf 滤镜链（调色板 GIF） */
export function buildGifVideoFilter(opts: GifEncodeOptions): string {
  const { maxFps, maxColors, dither, maxWidth } = opts
  const colors = Math.min(256, Math.max(2, Math.round(maxColors)))
  const fps = Math.min(60, Math.max(1, maxFps))
  const scalePart =
    maxWidth != null && maxWidth > 0
      ? `scale=min(iw\\,${Math.round(maxWidth)}):-2:flags=lanczos,`
      : ''
  return `${scalePart}fps=${fps},split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=single[p];[s1][p]paletteuse=dither=${dither}`
}

export type GifSmartAttempt = GifEncodeOptions

/** 智能压缩：从较温和到较激进依次尝试 */
export const GIF_SMART_ATTEMPTS: readonly GifSmartAttempt[] = [
  { maxFps: 16, maxColors: 220, dither: 'floyd_steinberg' },
  { maxFps: 14, maxColors: 180, dither: 'bayer' },
  { maxFps: 12, maxColors: 144, dither: 'bayer', maxWidth: 1280 },
  { maxFps: 10, maxColors: 112, dither: 'bayer', maxWidth: 960 },
  { maxFps: 8, maxColors: 88, dither: 'bayer', maxWidth: 720 },
  { maxFps: 6, maxColors: 64, dither: 'bayer', maxWidth: 560 },
  { maxFps: 5, maxColors: 48, dither: 'bayer', maxWidth: 480 },
]

export const DEFAULT_GIF_CUSTOM: GifEncodeOptions = {
  maxFps: 12,
  maxColors: 128,
  dither: 'bayer',
}
