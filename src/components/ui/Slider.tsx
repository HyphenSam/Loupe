import { Slider as RadixSlider } from 'radix-ui'

/** DESIGN.md's slider (Bytesize's): a label with its value on the right, a magenta range, one thumb named
 * after the label. `format` writes the value as shown ("×20"). */
export function Slider({
  label,
  value,
  min,
  max,
  format = String,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[13px] font-medium">
        <span>{label}</span>
        <span className="text-ink-soft tabular-nums">{format(value)}</span>
      </div>
      <RadixSlider.Root
        className="relative flex h-5 touch-none items-center select-none"
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      >
        <RadixSlider.Track className="relative h-1 grow rounded-full bg-line-strong">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
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
