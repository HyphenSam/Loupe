import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/lib/cn'
import { dragCrop, nudgeCrop, type CropTool, type Handle } from '@/lib/crop'
import type { ImageInfo } from '@/lib/info'
import type { Rect } from '@/lib/pixels'

/** Each handle: its name, where it sits on the frame (fractions of its width and height), and its cursor. */
const HANDLES: { handle: Exclude<Handle, 'move'>; name: string; at: [number, number]; cursor: string }[] = [
  { handle: 'nw', name: 'Top-left', at: [0, 0], cursor: 'cursor-nwse-resize' },
  { handle: 'n', name: 'Top', at: [0.5, 0], cursor: 'cursor-ns-resize' },
  { handle: 'ne', name: 'Top-right', at: [1, 0], cursor: 'cursor-nesw-resize' },
  { handle: 'e', name: 'Right', at: [1, 0.5], cursor: 'cursor-ew-resize' },
  { handle: 'se', name: 'Bottom-right', at: [1, 1], cursor: 'cursor-nwse-resize' },
  { handle: 's', name: 'Bottom', at: [0.5, 1], cursor: 'cursor-ns-resize' },
  { handle: 'sw', name: 'Bottom-left', at: [0, 1], cursor: 'cursor-nesw-resize' },
  { handle: 'w', name: 'Left', at: [0, 0.5], cursor: 'cursor-ew-resize' },
]

/** The crop frame (DESIGN.md): a 2 px magenta rectangle with eight square handles, the picture outside it dimmed
 * to 40%, and a rule-of-thirds grid while it's dragged. It fills the turned picture's box on the stage; `scale` is
 * CSS pixels per picture pixel. The frame and each handle take arrow keys (`nudgeCrop`). */
export function CropFrame({
  tool,
  info,
  scale,
  onTool,
}: {
  tool: CropTool
  info: ImageInfo
  scale: number
  onTool: (tool: CropTool) => void
}) {
  const hint = useId()
  const drag = useRef<{ handle: Handle; from: Rect; x: number; y: number; pointer: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const { x, y, width, height } = tool.crop

  function start(handle: Handle) {
    return (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      // The stage would pan otherwise.
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      drag.current = { handle, from: tool.crop, x: event.clientX, y: event.clientY, pointer: event.pointerId }
      setDragging(true)
    }
  }
  function move(event: PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.pointer !== event.pointerId) return
    onTool(dragCrop(tool, info, d.from, d.handle, (event.clientX - d.x) / scale, (event.clientY - d.y) / scale))
  }
  function end() {
    drag.current = null
    setDragging(false)
  }
  function key(handle: Handle) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.ctrlKey || event.metaKey) return
      const next = nudgeCrop(tool, info, handle, event)
      if (!next) return
      // Arrows would pan the stage otherwise.
      event.preventDefault()
      event.stopPropagation()
      onTool(next)
    }
  }
  const pointer = (handle: Handle) => ({
    onPointerDown: start(handle),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: key(handle),
  })

  const box = { left: x * scale, top: y * scale, width: width * scale, height: height * scale }
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        role="button"
        tabIndex={0}
        aria-roledescription="crop frame"
        aria-label={`Crop frame, ${width} × ${height} at ${x}, ${y}`}
        aria-describedby={hint}
        className="pointer-events-auto absolute cursor-move outline-2 outline-accent shadow-[0_0_0_100000px_oklch(0_0_0/0.6)] focus-visible:outline-offset-2"
        style={box}
        {...pointer('move')}
      >
        {dragging && (
          <div aria-hidden="true" className="absolute inset-0">
            {[1, 2].map((i) => (
              <span
                key={`v${i}`}
                className="absolute inset-y-0 w-px bg-white/45"
                style={{ left: `${(i * 100) / 3}%` }}
              />
            ))}
            {[1, 2].map((i) => (
              <span
                key={`h${i}`}
                className="absolute inset-x-0 h-px bg-white/45"
                style={{ top: `${(i * 100) / 3}%` }}
              />
            ))}
          </div>
        )}
      </div>
      <p id={hint} hidden>
        Arrow keys move it; Alt and an arrow resize it.
      </p>
      {HANDLES.map(({ handle, name, at, cursor }) => (
        // A 24 px hit area around the 12 px square.
        <div
          key={handle}
          role="button"
          tabIndex={0}
          aria-roledescription="handle"
          aria-label={`${name} handle`}
          className={cn('pointer-events-auto absolute flex size-6 items-center justify-center rounded-[3px]', cursor)}
          style={{ left: box.left + at[0] * box.width - 12, top: box.top + at[1] * box.height - 12 }}
          {...pointer(handle)}
        >
          <span className="size-3 bg-accent shadow-[0_0_0_1px_oklch(1_0_0/0.85)]" />
        </div>
      ))}
    </div>
  )
}
