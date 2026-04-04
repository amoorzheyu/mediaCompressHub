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
