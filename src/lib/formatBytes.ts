export function formatBytes(n: number): string {
  if (n === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)))
  return `${(n / k ** i).toFixed(i > 1 ? 2 : 1)} ${sizes[i]}`
}
