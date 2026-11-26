import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

/** A number from `min` to `max`, whole unless `step` is a fraction (0.1 for tenths). Typing is free; the value
 * is checked when the field loses focus or Enter is pressed, and anything invalid goes back to the last good
 * value. */
export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  className,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Shown after the number, such as "px" or "kB". */
  unit?: string
  onChange: (value: number) => void
  className?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  function commit() {
    // Rounded to the step, at its decimals, so tenths don't come out as 0.30000000000000004.
    const decimals = Math.max(0, -Math.floor(Math.log10(step)))
    const n = text.trim() === '' ? NaN : Number((Math.round(Number(text) / step) * step).toFixed(decimals))
    if (Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value) onChange(n)
      setText(String(n))
    } else setText(String(value))
  }

  return (
    <label
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-control bg-panel px-2.5 text-[13px] shadow-[0_0_0_1px_var(--color-line-strong)] focus-within:shadow-[0_0_0_1.5px_var(--color-focus)]',
        className,
      )}
    >
      <input
        aria-label={label}
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        step={step}
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-full min-w-0 bg-transparent font-medium tabular-nums outline-none focus-visible:outline-none"
      />
      {unit && <span className="text-ink-soft">{unit}</span>}
    </label>
  )
}
