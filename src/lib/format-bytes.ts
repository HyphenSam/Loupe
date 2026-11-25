/** 38978681 → "39.0 MB" (decimal, as browsers' download UIs show). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1e6) return `${Math.round(bytes / 1000)} kB`
  return `${(bytes / 1e6).toFixed(1)} MB`
}

/** A result's size against its source's, rounded to a whole per cent: "−68%", "+4%", or "Same size". */
export function sizeChange(size: number, source: number): string {
  const change = Math.round(((size - source) / source) * 100)
  if (change === 0) return 'Same size'
  return change < 0 ? `−${-change}%` : `+${change}%`
}
