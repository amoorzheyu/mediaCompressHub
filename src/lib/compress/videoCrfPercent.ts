/** 将「压缩强度」0～100% 与 CRF 区间线性互转；百分比为抽象档位，非真实体积比例。 */

export function videoCompressPercentToCrf(percent: number, crfMin: number, crfMax: number): number {
  const lo = Math.min(crfMin, crfMax)
  const hi = Math.max(crfMin, crfMax)
  const span = hi - lo
  const p = Math.max(0, Math.min(100, percent))
  if (span <= 0) return lo
  const crf = Math.round(lo + (p / 100) * span)
  return Math.max(lo, Math.min(hi, crf))
}

export function videoCrfToCompressPercent(crf: number, crfMin: number, crfMax: number): number {
  const lo = Math.min(crfMin, crfMax)
  const hi = Math.max(crfMin, crfMax)
  const span = hi - lo
  const c = Math.max(lo, Math.min(hi, crf))
  if (span <= 0) return 0
  return Math.round(((c - lo) / span) * 100)
}
