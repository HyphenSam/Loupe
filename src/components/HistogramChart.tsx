import { useMemo } from 'react'
import { clippingWords, histogram } from '@/lib/histogram'
import type { Pixels } from '@/lib/pixels'

const WIDTH = 288
const HEIGHT = 80

/** Info's histogram (SPEC.md 6.1): luminance as a grey area, red, green and blue as lines over it, and how
 * much is clipped. The channels carry their own colours: they're the picture's, not the interface's. */
export function HistogramChart({ pixels }: { pixels: Pixels }) {
  const h = useMemo(() => histogram(pixels), [pixels])
  // Scaled to the tallest bin away from the ends, so a clipped spike doesn't flatten the rest.
  const top = Math.max(1, ...[h.red, h.green, h.blue, h.luma].flatMap((bins) => Array.from(bins.subarray(1, 255))))
  const path = (bins: Uint32Array, closed: boolean) => {
    const points = Array.from(bins, (n, i) => {
      const x = (i / 255) * WIDTH
      const y = HEIGHT - Math.min(1, n / top) * HEIGHT
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return closed ? `M0,${HEIGHT} L${points.join(' L')} L${WIDTH},${HEIGHT} Z` : `M${points.join(' L')}`
  }
  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label="Histogram of red, green, blue and luminance"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-20 w-full rounded-control bg-sunken"
        preserveAspectRatio="none"
      >
        <path d={path(h.luma, true)} className="fill-ink-soft/30" />
        <path d={path(h.red, false)} fill="none" stroke="oklch(0.62 0.16 25)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={path(h.green, false)} fill="none" stroke="oklch(0.62 0.14 150)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={path(h.blue, false)} fill="none" stroke="oklch(0.6 0.14 255)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="text-xs text-ink-soft">{clippingWords(h.shadows, h.highlights)}</figcaption>
    </figure>
  )
}
