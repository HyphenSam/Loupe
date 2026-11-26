import { useRef, useState } from 'react'
import { clampPan, fitScale, pinch, type Size, type View, zoomAt } from '@/lib/zoom'

/** Moving further than this between press and release is a pan, not a click. */
const CLICK_SLOP = 4

type Point = { clientX: number; clientY: number }
type PointerLike = Point & { button: number; pointerId: number; currentTarget: Element }
type Finger = Point & { pointerId: number; stopPropagation?: () => void }
type Press = PointerLike & { isPrimary?: boolean; stopPropagation?: () => void }
type WheelLike = Point & { deltaY: number }

/** Wheel zoom, drag pan and two-finger pinch over an image of `size` in `viewport`.
 * `view` is null while the image is
 * drawn at `fit()`, the view it has when not zoomed.
 *
 * Fingers are followed in the capture phase, so a pinch that starts on the crop frame or a redaction box still
 * zooms. When a second finger lands the stage takes both pointers (`setPointerCapture`), so whatever the first was
 * dragging gets `lostpointercapture` and drops its drag, and the pinch's events go no further than the stage. */
export function useZoomPan({
  size,
  viewport,
  stage,
  fit,
  onChange,
}: {
  size: Size | null
  viewport: Size | null
  stage: { current: Element | null }
  fit: () => View | null
  /** Every zoom or pan, null when back at fit. */
  onChange?: (view: View | null) => void
}) {
  const [view, setView] = useState<View | null>(null)
  const latest = useRef<View | null>(null)
  // The pointer's last position while a drag pans; each move pans the
  // latest view, so a wheel zoom during the drag stands.
  const drag = useRef<{ x: number; y: number } | null>(null)
  const press = useRef<{ x: number; y: number } | null>(null)
  // Each pointer down on the stage, by id, at its last position (stage pixels): two make a pinch.
  const fingers = useRef(new Map<number, { x: number; y: number }>())

  function set(next: View | null) {
    latest.current = next
    setView(next)
    onChange?.(next)
  }

  function local(event: Point) {
    const rect = stage.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  /** Zooms by `factor` at `point` (stage pixels, the middle by default);
   * zooming out to the fit scale goes back to fit. */
  function zoomBy(factor: number, point?: { x: number; y: number }) {
    const base = fit()
    const current = latest.current ?? base
    if (!size || !viewport || !current || !base) return
    const at = point ?? { x: viewport.width / 2, y: viewport.height / 2 }
    settle(zoomAt(current, at, factor, size, viewport), base)
  }

  /** `next`, or fit when it's zoomed out to the fit scale. `fit()` may leave a margin, below the scale zooming
   * stops at; either is back to fit. */
  function settle(next: View, base: View) {
    if (!size || !viewport) return
    set(next.scale <= Math.max(base.scale, fitScale(size, viewport)) ? null : next)
  }

  function lift(event: { pointerId: number }) {
    fingers.current.delete(event.pointerId)
    drag.current = null
  }

  const handlers = {
    onWheel(event: WheelLike) {
      zoomBy(Math.pow(1.0015, -event.deltaY), local(event))
    },
    onPointerDownCapture(event: Press) {
      if (event.button !== 0) return
      // The first finger of a touch (or any mouse press) starts afresh, in case a lift was never seen.
      if (event.isPrimary) fingers.current.clear()
      fingers.current.set(event.pointerId, local(event))
      if (fingers.current.size < 2) return
      // A second finger turns a drag into a pinch.
      drag.current = null
      event.stopPropagation?.()
      for (const id of fingers.current.keys()) {
        try {
          event.currentTarget.setPointerCapture?.(id)
        } catch {
          // A pointer that's already gone.
        }
      }
    },
    onPointerDown(event: PointerLike) {
      press.current = { x: event.clientX, y: event.clientY }
      if (event.button !== 0 || fingers.current.size > 1 || !latest.current) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY }
    },
    onPointerMoveCapture(event: Finger) {
      if (!fingers.current.has(event.pointerId)) return
      if (fingers.current.size !== 2) return void fingers.current.set(event.pointerId, local(event))
      event.stopPropagation?.()
      const base = fit()
      const current = latest.current ?? base
      const from = [...fingers.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      fingers.current.set(event.pointerId, local(event))
      const to = [...fingers.current.values()] as typeof from
      if (size && viewport && current && base) settle(pinch(current, from, to, size, viewport), base)
    },
    onPointerMove(event: Point) {
      const last = drag.current
      const current = latest.current
      if (!last || !size || !viewport) return
      drag.current = { x: event.clientX, y: event.clientY }
      if (!current) return
      set(
        clampPan(
          { ...current, x: current.x + event.clientX - last.x, y: current.y + event.clientY - last.y },
          size,
          viewport,
        ),
      )
    },
    onPointerUpCapture: lift,
    onPointerCancelCapture: lift,
  }

  /** Whether the pointer moved far enough since the press to be a pan. */
  function moved(event: Point): boolean {
    const start = press.current
    return !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP
  }

  return { view, zoomBy, set, reset: () => set(null), handlers, moved }
}
