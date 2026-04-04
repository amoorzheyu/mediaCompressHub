export async function makeThumbnailBlob(
  imageBlob: Blob,
  maxEdge = 120,
  quality = 0.72,
): Promise<Blob | undefined> {
  try {
    const bitmap = await createImageBitmap(imageBlob)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return undefined
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    return await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b ?? undefined), 'image/webp', quality)
    })
  } catch {
    return undefined
  }
}

const VIDEO_THUMB_LOAD_MS = 15000

/**
 * 从视频 Blob 截取接近起始处的一帧，生成与 {@link makeThumbnailBlob} 相同风格的 WebP 缩略图。
 */
export async function makeVideoThumbnailBlob(
  videoBlob: Blob,
  maxEdge = 120,
  quality = 0.72,
): Promise<Blob | undefined> {
  const url = URL.createObjectURL(videoBlob)
  const video = document.createElement('video')
  video.muted = true
  video.setAttribute('playsinline', '')
  video.preload = 'auto'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), VIDEO_THUMB_LOAD_MS)
      const done = () => {
        window.clearTimeout(timer)
        resolve()
      }
      const fail = () => {
        window.clearTimeout(timer)
        reject(new Error('load failed'))
      }
      video.addEventListener('loadeddata', done, { once: true })
      video.addEventListener('error', fail, { once: true })
      video.load()
    })

    if (!video.videoWidth || !video.videoHeight) {
      await new Promise<void>((resolve, reject) => {
        const dur = video.duration
        const t =
          Number.isFinite(dur) && dur > 0
            ? Math.min(0.1, Math.max(0.001, dur * 0.01))
            : 0.05
        const onSeeked = () => resolve()
        const onError = () => reject(new Error('seek failed'))
        video.addEventListener('seeked', onSeeked, { once: true })
        video.addEventListener('error', onError, { once: true })
        video.currentTime = t
      })
    }

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return undefined

    const scale = Math.min(1, maxEdge / Math.max(vw, vh))
    const w = Math.max(1, Math.round(vw * scale))
    const h = Math.max(1, Math.round(vh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(video, 0, 0, w, h)
    return await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b ?? undefined), 'image/webp', quality)
    })
  } catch {
    return undefined
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
