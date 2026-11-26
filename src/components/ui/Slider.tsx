import { Slider as RadixSlider } from 'radix-ui'
import type { ReactNode } from 'react'

/** DESIGN.md's slider (Bytesize's): a label with its value on the right, a magenta range, one thumb named
 * after the label. `format` writes the value as shown ("×20"). A `centred` slider runs either side of zero: its
 * range fills from a tick at zero, and double-clicking it goes back to zero. `aside` takes the value's place
 * beside the label: a number field for typing it. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  centred = false,
  format = String,
  aside,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  centred?: boolean
  format?: (value: number) => string
  aside?: ReactNode
  onChange: (value: number) => void
}) {
  const at = (v: number) => ((v - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-[13px] font-medium">
        <span>{label}</span>
        {aside ?? <span className="text-ink-soft tabular-nums">{format(value)}</span>}
      </div>
      <RadixSlider.Root
        className="relative flex h-5 touch-none items-center select-none"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        onDoubleClick={centred ? () => onChange(0) : undefined}
      >
        <RadixSlider.Track className="relative h-1 grow rounded-full bg-line-strong">
          {centred ? (
            <>
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-ink-soft"
                style={{ left: `${at(0)}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute h-full rounded-full bg-accent"
                style={{ left: `${Math.min(at(0), at(value))}%`, width: `${Math.abs(at(value) - at(0))}%` }}
              />
            </>
          ) : (
            <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
          )}
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={label}
          aria-valuetext={format(value)}
          className="block size-4 rounded-full bg-white shadow-[0_0_0_1px_var(--color-line-strong),0_1px_3px_oklch(0_0_0/0.25)] focus-visible:outline-2 focus-visible:outline-focus"
        />
      </RadixSlider.Root>
    </div>
  )
}
