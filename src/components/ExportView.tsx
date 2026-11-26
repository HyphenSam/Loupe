import type { JobOptions, JobState } from '@/hooks/useJob'
import type { ImageInfo } from '@/lib/info'
import { exportEncoding, exportNotes, planExport } from '@/lib/plans/export'
import type { Plan } from '@/lib/plans/plan'
import { FORMAT_NAMES } from '@/lib/plans/pixel-edit'
import { MAX_SIDE, type ExportSettings } from '@/lib/settings'
import { JobAction } from './JobAction'
import { NumberInput } from './ui/NumberInput'
import { Segmented } from './ui/Segmented'
import { Slider } from './ui/Slider'
import { Toggle } from './ui/Toggle'

const FORMATS: { value: ExportSettings['format']; label: string }[] = [
  { value: 'same', label: 'Same' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'jxl', label: 'JPEG XL' },
  { value: 'png', label: 'PNG' },
]

/** Export (SPEC.md 6.11): format, quality or the Lossless switch, resize, target size and Keep metadata. The App
 * holds the settings, which carry over to the next file and are remembered; `tag` marks the export so the stage can
 * compare it with the source. */
export function ExportView({
  info,
  settings: s,
  onSettings,
  tag,
  job,
  onRun,
  onCancel,
}: {
  info: ImageInfo
  settings: ExportSettings
  onSettings: (settings: ExportSettings) => void
  tag: string
  job: JobState
  onRun: (plan: Plan, options: JobOptions) => void
  onCancel: () => void
}) {
  const set = (over: Partial<ExportSettings>) => onSettings({ ...s, ...over })
  const planned = planExport(info, s)
  const encoding = exportEncoding(info, s)
  const { format } = encoding
  // With Same, a lossless WebP or JPEG XL stays lossless; the switch then can't turn it off.
  const forced = s.format === 'same' && info.lossless

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-medium">Format</span>
        <Segmented
          label="Format"
          value={s.format}
          options={FORMATS}
          onChange={(value) => set({ format: value })}
          className="grid grid-cols-3"
        />
        {(format === 'webp' || format === 'jxl') && (
          <Toggle
            label="Lossless"
            hint={
              forced
                ? `A lossless ${FORMAT_NAMES[format]} stays lossless with Same.`
                : 'Every pixel is kept. Files are larger.'
            }
            checked={encoding.lossless}
            disabled={forced}
            onChange={(on) => set(format === 'webp' ? { webpLossless: on } : { jxlLossless: on })}
          />
        )}
        {format !== 'png' && !encoding.lossless && (
          <Slider
            label="Quality"
            value={s.quality[format]}
            min={1}
            max={100}
            onChange={(v) => set({ quality: { ...s.quality, [format]: v } })}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Toggle
          label="Resize"
          hint="Fits inside a box, never larger. Lanczos3 in linear light."
          checked={s.resize}
          onChange={(on) => set({ resize: on })}
        />
        {s.resize && (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="Maximum width"
              value={s.maxWidth}
              min={1}
              max={MAX_SIDE}
              unit="px"
              onChange={(v) => set({ maxWidth: v })}
            />
            <NumberInput
              label="Maximum height"
              value={s.maxHeight}
              min={1}
              max={MAX_SIDE}
              unit="px"
              onChange={(v) => set({ maxHeight: v })}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Toggle
          label="Target size"
          hint="The highest quality, up to the slider’s, whose file fits."
          checked={s.target}
          onChange={(on) => set({ target: on })}
        />
        {s.target && (
          <div className="flex gap-2">
            <NumberInput
              label="Target size"
              value={s.targetSize}
              min={0.1}
              max={1_000_000}
              step={0.1}
              onChange={(v) => set({ targetSize: v })}
              className="flex-1"
            />
            <Segmented
              label="Unit"
              value={s.targetUnit}
              options={[
                { value: 'kB', label: 'kB' },
                { value: 'MB', label: 'MB' },
              ]}
              onChange={(unit) => set({ targetUnit: unit })}
              fit
            />
          </div>
        )}
      </div>

      <Toggle
        label="Keep metadata"
        hint="Off removes everything but the colour profile."
        checked={s.keepMetadata}
        onChange={(on) => set({ keepMetadata: on })}
      />

      <JobAction
        planned={planned}
        verb="Export"
        state={job}
        onCancel={onCancel}
        onStart={() => {
          const plan = planned.plan
          if (plan?.kind !== 'export') return
          onRun(plan, {
            doing: 'Exporting',
            size: info.size,
            tag,
            notes: (result) => exportNotes(plan, result.blob.size, info.size, result.fitted ?? null),
            png: (blob) => ({ blob, format: plan.encoding.format, orientation: 1 }),
          })
        }}
      />
    </div>
  )
}
