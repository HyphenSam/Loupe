import { Plus, X } from 'lucide-react'
import type { JobOptions, JobState } from '@/hooks/useJob'
import type { ImageInfo } from '@/lib/info'
import type { Plan } from '@/lib/plans/plan'
import { planRedact, type RedactSettings } from '@/lib/plans/redact'
import { boxWords, middleBox, type Fill } from '@/lib/redact'
import { JobAction } from './JobAction'
import { OutputDisclosure } from './OutputDisclosure'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'
import { Toggle } from './ui/Toggle'

const FILLS: { value: Fill; label: string }[] = [
  { value: 'black', label: 'Black' },
  { value: 'blur', label: 'Blur' },
  { value: 'pixelate', label: 'Pixelate' },
]

const heading = 'text-[13px] font-medium'

/** Redact (SPEC.md 6.9): the boxes drawn on the stage, listed with delete buttons, the fill for all of them and
 * the Remove metadata switch. The App holds the settings, which the boxes on the stage change too. */
export function RedactView({
  info,
  settings,
  onSettings,
  onDelete,
  job,
  onRun,
  onCancel,
}: {
  info: ImageInfo
  settings: RedactSettings
  onSettings: (settings: RedactSettings) => void
  /** Deletes a box, keeping the selection on the box it was on. */
  onDelete: (index: number) => void
  job: JobState
  onRun: (plan: Plan, options: JobOptions) => void
  onCancel: () => void
}) {
  const planned = planRedact(info, settings)
  const { boxes } = settings

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <span className={heading}>Boxes</span>
        {boxes.length ? (
          <ul className="flex flex-col gap-0.5">
            {boxes.map((box, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[13px] tabular-nums">
                {boxWords(box, i)}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete box ${i + 1}`}
                  className="px-1.5"
                  onClick={() => onDelete(i)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-ink-soft">
          Drag on the picture to draw a box, or add one and move it with the arrow keys. Hold{' '}
          <kbd className="font-sans">\</kbd> to look under the boxes.
        </p>
        {/* For the keyboard: a box in the middle of the picture, which the arrow keys then move and resize. */}
        <Button
          size="sm"
          className="self-start"
          onClick={() =>
            onSettings({
              ...settings,
              boxes: [...boxes, middleBox({ width: info.displayWidth, height: info.displayHeight })],
            })
          }
        >
          <Plus />
          Add box
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <span className={heading}>Fill</span>
        <Segmented
          label="Fill"
          value={settings.fill}
          options={FILLS}
          onChange={(fill) => onSettings({ ...settings, fill })}
        />
        {settings.fill !== 'black' && (
          <p className="text-xs text-ink-soft">
            Blurred and pixelated text can sometimes be read back. Black is safest.
          </p>
        )}
      </div>

      <Toggle
        label="Remove metadata"
        hint="Everything Privacy’s Everything removes. The colour profile stays."
        checked={settings.removeMetadata}
        onChange={(removeMetadata) => onSettings({ ...settings, removeMetadata })}
      />

      <OutputDisclosure
        info={info}
        output={settings.output}
        onOutput={(output) => onSettings({ ...settings, output })}
      />

      <JobAction
        planned={planned}
        verb="Redact"
        state={job}
        onCancel={onCancel}
        onStart={() => {
          const plan = planned.plan
          if (plan?.kind !== 'pixels') return
          onRun(plan, {
            doing: 'Redacting',
            size: info.size,
            png: (blob) => ({ blob, format: plan.encoding.format, orientation: 1 }),
          })
        }}
      />
    </div>
  )
}
