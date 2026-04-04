/** localStorage：视频压缩是否保留音轨（默认保留） */

export const VIDEO_KEEP_AUDIO_KEY = 'media-compress-hub:video-keep-audio'

export function readVideoKeepAudio(): boolean {
  try {
    const v = localStorage.getItem(VIDEO_KEEP_AUDIO_KEY)
    if (v === null) return true
    return v === '1' || v === 'true'
  } catch {
    return true
  }
}

export function writeVideoKeepAudio(keep: boolean): void {
  try {
    localStorage.setItem(VIDEO_KEEP_AUDIO_KEY, keep ? '1' : '0')
  } catch {
    /* 隐私模式等 */
  }
}
