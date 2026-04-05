/** 读取 GIF 逻辑屏幕尺寸（不解析完整帧表） */
export function parseGifLogicalScreen(buffer: ArrayBuffer): { width: number; height: number } | null {
  const u8 = new Uint8Array(buffer)
  if (u8.length < 10) return null
  if (u8[0] !== 0x47 || u8[1] !== 0x49 || u8[2] !== 0x46) return null
  const width = u8[6] | (u8[7] << 8)
  const height = u8[8] | (u8[9] << 8)
  if (width <= 0 || height <= 0) return null
  return { width, height }
}
