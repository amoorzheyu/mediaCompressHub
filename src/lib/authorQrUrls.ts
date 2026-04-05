/**
 * 微信二维码资源：使用 public/author 下的 JPG。
 * 直接替换同路径文件即可，无需改代码。
 */
function authorPublicAsset(relativePath: string): string {
  const base = import.meta.env.BASE_URL
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `${normalizedBase}${path}`
}

export const AUTHOR_TIP_QRCODE_URL = authorPublicAsset('author/tip-qrcode.jpg')
export const AUTHOR_CONTACT_QRCODE_URL = authorPublicAsset('author/contact-qrcode.jpg')
