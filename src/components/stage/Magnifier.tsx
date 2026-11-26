import { useLayoutEffect, useRef } from 'react'

export const MAGNIFIER_SIZE = 160

/** The loupe the app is named after (DESIGN.md): a circle showing the picture around `point` at
 * `magnification` CSS pixels per picture pixel, with a pixel grid past 6×, the centre pixel outlined, and
 * its colour in a chip beneath. `source` is what the stage draws (the `<img>` or the canvas), `scale` its
 * own pixels per picture pixel. `transform` turns what it shows as the stage turns the picture (Crop and rotate). */
export function Magnifier({
  source,
  scale,
  point,
  at,
  magnification,
  colour,
  colorSpace,
  transform,
}: {
  source: CanvasImageSource
  scale: number
  point: { x: number; y: number }
  /** Where its centre sits on the stage, in CSS pixels. */
  at: { x: number; y: number }
  magnification: number
  colour: string | null
  colorSpace: PredefinedColorSpace
  transform?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const el = canvas.current
    const context = el?.getContext('2d', { colorSpace })
    if (!el || !context) return
    const ratio = window.devicePixelRatio || 1
    const side = Math.round(MAGNIFIER_SIZE * ratio)
    if (el.width !== side) el.width = el.height = side
    const shown = MAGNIFIER_SIZE / magnification // picture pixels across
    const left = point.x + 0.5 - shown / 2
    const top = point.y + 0.5 - shown / 2
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, side, side)
    context.drawImage(source, left * scale, top * scale, shown * scale, shown * scale, 0, 0, side, side)
    const cell = magnification * ratio
    const offset = (n: number) => (Math.floor(n) - n) * cell
    if (magnification > 6) {
      context.strokeStyle = 'rgba(128, 128, 128, 0.45)'
      context.lineWidth = 1
      context.beginPath()
      for (let x = offset(left); x < side; x += cell)
        (context.moveTo(Math.round(x) + 0.5, 0), context.lineTo(Math.round(x) + 0.5, side))
      for (let y = offset(top); y < side; y += cell)
        (context.moveTo(0, Math.round(y) + 0.5), context.lineTo(side, Math.round(y) + 0.5))
      context.stroke()
    }
    // The centre pixel, outlined in black and white so it shows on any colour.
    const c = (side - cell) / 2
    context.lineWidth = Math.max(1, ratio)
    context.strokeStyle = 'black'
    context.strokeRect(
      c - context.lineWidth,
      c - context.lineWidth,
      cell + 2 * context.lineWidth,
      cell + 2 * context.lineWidth,
    )
    context.strokeStyle = 'white'
    context.strokeRect(c, c, cell, cell)
  })

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 flex flex-col items-center gap-1.5"
      style={{ left: at.x - MAGNIFIER_SIZE / 2, top: at.y - MAGNIFIER_SIZE / 2 }}
    >
      <canvas
        ref={canvas}
        className="rounded-full bg-stage shadow-float ring-2 ring-white/80"
        style={{ width: MAGNIFIER_SIZE, height: MAGNIFIER_SIZE, transform }}
      />
      {colour && (
        <span className="flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-0.5 font-mono text-xs text-stage-ink backdrop-blur-sm">
          <span className="size-2.5 rounded-full ring-1 ring-white/60" style={{ background: colour }} />
          {colour}
        </span>
      )}
    </div>
  )
}
