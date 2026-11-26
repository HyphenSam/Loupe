import { isUnsure, type TextLine } from '@/lib/ocr/types'

/** The Text view's boxes (DESIGN.md, Text lines): each line's four corners in a 1 px light outline (dashed when
 * Unsure) over a darker halo so it shows on light pictures too, no fill, and the selected line's in 2 px magenta with
 * its text in a chip above. Pressing a box selects its line; dragging from one still pans the stage. It fills the
 * upright picture's box on the stage; `scale` is CSS pixels per picture pixel. The list in the settings column is
 * what keyboards and screen readers use, so the boxes are hidden from them. */
export function TextBoxes({
  lines,
  selected,
  scale,
  onSelect,
}: {
  lines: TextLine[]
  selected: number | null
  scale: number
  onSelect: (line: number) => void
}) {
  const points = (line: TextLine) => line.quad.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')
  // The selected box is drawn last, so its magenta is on top where boxes overlap.
  const order = lines.map((_, i) => i).filter((i) => i !== selected)
  if (selected !== null && lines[selected]) order.push(selected)
  const chosen = selected !== null ? lines[selected] : undefined
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <svg className="absolute inset-0 size-full overflow-visible">
        {order.map((i) => {
          const line = lines[i]
          const unsure = isUnsure(line)
          const on = i === selected
          return (
            <g key={i}>
              <polygon
                points={points(line)}
                fill="none"
                stroke="oklch(0 0 0 / 0.45)"
                strokeWidth={on ? 4 : 3}
                strokeLinejoin="round"
              />
              <polygon
                data-line={i}
                data-unsure={unsure ? '' : undefined}
                data-selected={on ? '' : undefined}
                points={points(line)}
                // A transparent fill takes the pointer over the whole box, finger-sized or not.
                fill="transparent"
                pointerEvents="all"
                stroke={on ? 'var(--color-accent)' : 'var(--color-stage-ink)'}
                strokeWidth={on ? 2 : 1}
                strokeDasharray={unsure ? '4 3' : undefined}
                strokeLinejoin="round"
                className="cursor-pointer"
                onPointerDown={() => onSelect(i)}
              />
            </g>
          )
        })}
      </svg>
      {chosen && (
        <span
          data-chip=""
          className="pointer-events-none absolute max-w-80 -translate-y-full truncate rounded-full bg-black/55 px-2.5 py-0.5 text-xs text-stage-ink backdrop-blur-sm"
          style={{
            left: Math.min(...chosen.quad.map((p) => p.x)) * scale,
            top: Math.min(...chosen.quad.map((p) => p.y)) * scale - 6,
          }}
        >
          {chosen.text}
        </span>
      )}
    </div>
  )
}
