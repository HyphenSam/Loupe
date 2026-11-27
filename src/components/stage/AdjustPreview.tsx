import { useEffect, useRef, type CSSProperties } from 'react'
import type { Adjustments } from '@/lib/adjust'
import { idle, step, type LatestEvent } from '@/lib/latest'
import type { Pixels } from '@/lib/pixels'

/** Adjust's preview (SPEC.md 6.10): the stage-sized copy of the picture adjusted by the worker, so the page stays
 * free to move the slider, and drawn over the picture. A slider sends many values a frame: one request is out at a
 * time, the next asks for whatever is latest when it comes back, and the newest answer is drawn once a frame. */
export function AdjustPreview({
  adjustments,
  adjusted,
  colorSpace,
  style,
}: {
  adjustments: Adjustments
  /** The stage-sized copy with `adjustments` applied, from the worker. */
  adjusted: (adjustments: Adjustments) => Promise<Pixels>
  colorSpace: PredefinedColorSpace
  style: CSSProperties
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ adjusted, colorSpace })
  latest.current = { adjusted, colorSpace }
  // The requests to the worker, and an answer waiting for a frame. The stage mounts a preview per file, so its key
  // never changes.
  const requests = useRef(idle<null, Adjustments>(null))
  const waiting = useRef<Pixels | null>(null)
  const frame = useRef<number | null>(null)
  const live = useRef(true)

  const draw = () => {
    frame.current = null
    const el = canvas.current
    const pixels = waiting.current
    waiting.current = null
    if (!el || !pixels) return
    const { width, height, data } = pixels
    const { colorSpace } = latest.current
    if (el.width !== width || el.height !== height) [el.width, el.height] = [width, height]
    el.getContext('2d', { colorSpace })?.putImageData(
      new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height, { colorSpace }),
      0,
      0,
    )
  }

  const send = (event: LatestEvent<null, Adjustments>) => {
    const next = step(requests.current, event, Object.is)
    requests.current = next.state
    if (!next.ask) return
    latest.current.adjusted(next.ask.value).then(
      (pixels) => {
        if (live.current) {
          waiting.current = pixels
          frame.current ??= requestAnimationFrame(draw)
        }
        send({ type: 'answer' })
      },
      () => send({ type: 'failure' }),
    )
  }

  useEffect(() => send({ type: 'want', key: null, value: adjustments }), [adjustments])
  // Cancelled, and nothing wanted, so a remount (StrictMode's included) asks and draws again.
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      send({ type: 'want', key: null, value: null })
    }
  }, [])

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="absolute top-0 left-0 max-w-none origin-top-left"
      style={style}
    />
  )
}
