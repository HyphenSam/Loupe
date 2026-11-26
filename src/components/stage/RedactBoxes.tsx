import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/lib/cn'
import type { Handle } from '@/lib/crop'
import type { Pixels, Rect } from '@/lib/pixels'
import { boxFrom, boxWords, dragBox, fillBox, nudgeBox, strengthOf, type Fill } from '@/lib/redact'
import { HANDLES } from './CropFrame'

type Size = { width: number; height: number }
type Drag =
  | { kind: 'draw'; pointer: number; start: { x: number; y: number } }
  | { kind: 'box'; pointer: number; index: number; handle: Handle; from: Rect; x: number; y: number }

/** Redaction boxes (DESIGN.md): drawn by dragging on the picture, each with a 2 px magenta outline and its fill
 * inside, the selected one with handles. Boxes and handles take arrow keys (`nudgeBox`) and Delete. It fills the
 * upright picture's box on the stage; `scale` is CSS pixels per picture pixel, and `preview` a scaled copy of the
 * picture the blur and pixelate are shown on. */
export function RedactBoxes({
  boxes,
  fill,
  selected,
  size,
  scale,
  preview,
  onBoxes,
  onSelect,
}: {
  boxes: Rect[]
  fill: Fill
  selected: number | null
  size: Size
  scale: number
  preview: Pixels | null
  onBoxes: (boxes: Rect[]) => void
  onSelect: (index: number | null) => void
}) {
  const hint = useId()
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<Rect | null>(null)

  const pointOf = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current!.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }
  }
  const replace = (index: number, box: Rect) => onBoxes(boxes.map((b, i) => (i === index ? box : b)))
  const remove = (index: number) => {
    onBoxes(boxes.filter((_, i) => i !== index))
    onSelect(null)
  }

  function startDraw(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    // The stage would pan otherwise.
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { kind: 'draw', pointer: event.pointerId, start: pointOf(event) }
  }
  function startBox(index: number, handle: Handle) {
    return (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      onSelect(index)
      drag.current = {
        kind: 'box',
        pointer: event.pointerId,
        index,
        handle,
        from: boxes[index],
        x: event.clientX,
        y: event.clientY,
      }
    }
  }
  // Moves bubble here from whichever element holds the pointer.
  function move(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointer !== event.pointerId) return
    if (d.kind === 'draw') setDraft(boxFrom(d.start, pointOf(event), size))
    else replace(d.index, dragBox(d.from, d.handle, (event.clientX - d.x) / scale, (event.clientY - d.y) / scale, size))
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointer !== event.pointerId) return
    drag.current = null
    if (d.kind !== 'draw') return
    const box = boxFrom(d.start, pointOf(event), size)
    setDraft(null)
    // A click, or a drag too small to mean a box, only clears the selection.
    if (box.width < 2 || box.height < 2) return onSelect(null)
    onBoxes([...boxes, box])
    onSelect(boxes.length)
  }
  // A touch cancelled, or a second finger making a pinch (the stage takes the pointer): nothing is drawn, and a
  // dragged box goes back.
  function drop(event: PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.pointer !== event.pointerId) return
    drag.current = null
    setDraft(null)
    if (d.kind === 'box') replace(d.index, d.from)
  }
  function key(index: number, handle: Handle) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.ctrlKey || event.metaKey) return
      if (event.key === 'Delete' || event.key === 'Backspace') remove(index)
      else {
        const next = nudgeBox(boxes[index], handle, event, size)
        if (!next) return
        replace(index, next)
      }
      // Arrows would pan the stage otherwise.
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const place = (b: Rect) => ({ left: b.x * scale, top: b.y * scale, width: b.width * scale, height: b.height * scale })
  const chosen = selected !== null ? boxes[selected] : undefined
  return (
    <div
      ref={surface}
      role="group"
      aria-label="Draw a box over what to hide"
      className="absolute inset-0 cursor-crosshair"
      onPointerDown={startDraw}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={drop}
      onLostPointerCapture={drop}
    >
      <p id={hint} hidden>
        Arrow keys move it; Alt and an arrow resize it; Delete removes it.
      </p>
      {boxes.map((box, index) => (
        <div
          key={index}
          role="button"
          tabIndex={0}
          aria-roledescription="redaction box"
          aria-label={boxWords(box, index)}
          aria-describedby={hint}
          className="absolute cursor-move outline-2 outline-accent focus-visible:outline-offset-2"
          style={place(box)}
          onPointerDown={startBox(index, 'move')}
          onFocus={() => onSelect(index)}
          onKeyDown={key(index, 'move')}
        >
          <BoxFill box={box} fill={fill} preview={preview} size={size} />
        </div>
      ))}
      {draft && (
        <div aria-hidden="true" className="absolute outline-2 outline-accent" style={place(draft)}>
          <BoxFill box={draft} fill={fill} preview={preview} size={size} />
        </div>
      )}
      {chosen &&
        HANDLES.map(({ handle, name, at, cursor }) => {
          const b = place(chosen)
          return (
            // A 24 px hit area around the 12 px square, 44 px for a finger.
            <div
              key={handle}
              role="button"
              tabIndex={0}
              aria-roledescription="handle"
              aria-label={`${name} handle`}
              className={cn(
                'absolute flex size-6 items-center justify-center rounded-[3px] -translate-x-1/2 -translate-y-1/2 pointer-coarse:size-11',
                cursor,
              )}
              style={{ left: b.left + at[0] * b.width, top: b.top + at[1] * b.height }}
              onPointerDown={startBox(selected!, handle)}
              onKeyDown={key(selected!, handle)}
            >
              <span className="size-3 bg-accent shadow-[0_0_0_1px_oklch(1_0_0/0.85)]" />
            </div>
          )
        })}
    </div>
  )
}

/** What a box will look like: black, or the fill worked out on the scaled copy at the box's scaled strength. */
function BoxFill({ box, fill, preview, size }: { box: Rect; fill: Fill; preview: Pixels | null; size: Size }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const shown = fill !== 'black' && preview
  useEffect(() => {
    const el = canvas.current
    if (!el || !shown) return
    const p = shown.width / size.width
    const x0 = Math.min(shown.width - 1, Math.floor(box.x * p))
    const y0 = Math.min(shown.height - 1, Math.floor(box.y * p))
    const w = Math.max(1, Math.min(shown.width, Math.ceil((box.x + box.width) * p)) - x0)
    const h = Math.max(1, Math.min(shown.height, Math.ceil((box.y + box.height) * p)) - y0)
    const part: Pixels = { width: w, height: h, data: new Uint8ClampedArray(4 * w * h) }
    for (let y = 0; y < h; y++)
      part.data.set(
        shown.data.subarray(4 * ((y0 + y) * shown.width + x0), 4 * ((y0 + y) * shown.width + x0 + w)),
        4 * y * w,
      )
    fillBox(part, { x: 0, y: 0, width: w, height: h }, fill, strengthOf(box) * p)
    el.width = w
    el.height = h
    el.getContext('2d')?.putImageData(new ImageData(part.data as ImageDataArray, w, h), 0, 0)
  }, [box.x, box.y, box.width, box.height, fill, shown, size.width])
  if (fill === 'black') return <div aria-hidden="true" className="absolute inset-0 bg-black" />
  return shown ? <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" /> : null
}
