import { useEffect, useRef, type CSSProperties } from 'react'
import { adjust, type Adjustments } from '@/lib/adjust'
import type { Pixels } from '@/lib/pixels'

/** Adjust's preview (SPEC.md 6.10): the stage-sized copy of the picture with the adjustment applied, drawn over the
 * picture. A slider sends many values a frame; only the latest is drawn, once in the next frame, into one buffer. */
export function AdjustPreview({
  preview,
  adjustments,
  colorSpace,
  style,
}: {
  preview: Pixels
  adjustments: Adjustments
  colorSpace: PredefinedColorSpace
  style: CSSProperties
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ preview, adjustments, colorSpace })
  latest.current = { preview, adjustments, colorSpace }
  const frame = useRef<number | null>(null)
  const buffer = useRef<Uint8ClampedArray<ArrayBuffer> | null>(null)

  useEffect(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const el = canvas.current
      if (!el) return
      const { preview, adjustments, colorSpace } = latest.current
      const { width, height } = preview
      if (el.width !== width || el.height !== height) [el.width, el.height] = [width, height]
      if (buffer.current?.length !== preview.data.length) buffer.current = new Uint8ClampedArray(preview.data.length)
      adjust(preview, adjustments, buffer.current)
      el.getContext('2d', { colorSpace })?.putImageData(
        new ImageData(buffer.current, width, height, { colorSpace }),
        0,
        0,
      )
    })
  }, [preview, adjustments, colorSpace])
  // Cleared as well as cancelled, so a remount (StrictMode's included) draws again.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    },
    [],
  )

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="absolute top-0 left-0 max-w-none origin-top-left"
      style={style}
    />
  )
}
