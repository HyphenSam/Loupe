import type { ImageInfo } from '@/lib/info'
import { defaultEncoding, encodingFor, FORMAT_NAMES, outputChoice, outputWords } from '@/lib/plans/pixel-edit'
import type { Encoding } from '@/lib/plans/plan'
import { Segmented } from './ui/Segmented'
import { Slider } from './ui/Slider'
import { Toggle } from './ui/Toggle'

// Export's order, without Same.
const FORMATS = (['jpeg', 'webp', 'avif', 'jxl', 'png'] as const).map((value) => ({
  value,
  label: FORMAT_NAMES[value],
}))

/** The Output disclosure under a pixel edit's settings (SPEC.md 6.0): the format, quality and, for WebP and
 * JPEG XL, the Lossless switch, for this edit only. `output` is the edit's setting, null for the default, which the
 * summary names; choosing the default again sets it back to null. */
export function OutputDisclosure({
  info,
  output,
  onOutput,
  hint = 'For this edit only.',
}: {
  info: ImageInfo
  output: Encoding | null
  onOutput: (output: Encoding | null) => void
  hint?: string
}) {
  const e = output ?? defaultEncoding(info).encoding
  const choose = (next: Encoding) => onOutput(outputChoice(info, next))

  return (
    <details>
      <summary className="cursor-pointer text-[13px] font-medium text-ink-soft hover:text-ink">
        {/* The space keeps the words apart when read out. */}
        <span>Output</span> <span className="ml-1 font-normal tabular-nums">{outputWords(e)}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <Segmented
          label="Format"
          value={e.format}
          options={FORMATS}
          onChange={(format) => choose(encodingFor(info, format))}
          className="grid grid-cols-3"
        />
        {(e.format === 'webp' || e.format === 'jxl') && (
          <Toggle
            label="Lossless"
            hint="Every pixel is kept. Files are larger."
            checked={e.lossless}
            onChange={(on) => choose(encodingFor(info, e.format, on))}
          />
        )}
        {!e.lossless && e.quality !== null && (
          <Slider
            label="Quality"
            value={e.quality}
            min={1}
            max={100}
            onChange={(quality) => choose({ ...e, quality })}
          />
        )}
        <p className="text-xs text-ink-soft">{hint}</p>
      </div>
    </details>
  )
}
