import type { JobOptions, JobState } from '@/hooks/useJob'
import { adjustmentWords, isNeutral, NEUTRAL, type AdjustmentKey } from '@/lib/adjust'
import type { ImageInfo } from '@/lib/info'
import { planAdjust, type AdjustSettings } from '@/lib/plans/adjust'
import type { Plan } from '@/lib/plans/plan'
import { JobAction } from './JobAction'
import { OutputDisclosure } from './OutputDisclosure'
import { Button } from './ui/Button'
import { Slider } from './ui/Slider'

const SLIDERS: { key: AdjustmentKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.1 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
  { key: 'warmth', label: 'Warmth', min: -100, max: 100, step: 1 },
]

/** Adjust (SPEC.md 6.10): six sliders centred on zero, each reset by a double-click, and Reset all. The App holds
 * the settings, which the stage previews. */
export function AdjustView({
  info,
  settings,
  onSettings,
  job,
  onRun,
  onCancel,
}: {
  info: ImageInfo
  settings: AdjustSettings
  onSettings: (settings: AdjustSettings) => void
  job: JobState
  onRun: (plan: Plan, options: JobOptions) => void
  onCancel: () => void
}) {
  const planned = planAdjust(info, settings)
  const { adjustments } = settings

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-5">
        {SLIDERS.map(({ key, label, min, max, step }) => (
          <Slider
            key={key}
            label={label}
            value={adjustments[key]}
            min={min}
            max={max}
            step={step}
            centred
            format={(v) => adjustmentWords(key, v)}
            // Exposure's steps are tenths, which adding can leave a hair off (0.30000000000000004).
            onChange={(v) =>
              onSettings({ ...settings, adjustments: { ...adjustments, [key]: Number(v.toFixed(step < 1 ? 1 : 0)) } })
            }
          />
        ))}
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-ink-soft">
          Double-click a slider to reset it. Hold <kbd className="font-sans">\</kbd> to see the picture before.
        </p>
        <Button
          size="sm"
          disabled={isNeutral(adjustments)}
          onClick={() => onSettings({ ...settings, adjustments: NEUTRAL })}
        >
          Reset all
        </Button>
      </div>

      <OutputDisclosure
        info={info}
        output={settings.output}
        onOutput={(output) => onSettings({ ...settings, output })}
      />

      <JobAction
        planned={planned}
        verb="Save"
        state={job}
        onCancel={onCancel}
        onStart={() => {
          const plan = planned.plan
          if (plan?.kind !== 'pixels') return
          onRun(plan, {
            doing: 'Adjusting',
            size: info.size,
            png: (blob) => ({ blob, format: plan.encoding.format, orientation: 1 }),
          })
        }}
      />
    </div>
  )
}
