import { FlipHorizontal2, FlipVertical2, RectangleVertical, RotateCcw, RotateCw } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import type { JobOptions, JobState } from '@/hooks/useJob'
import {
  ASPECTS,
  aspectCrop,
  cropSettings,
  fieldCrop,
  snapCrop,
  straightenCrop,
  turnCrop,
  type CropTool,
} from '@/lib/crop'
import type { ImageInfo } from '@/lib/info'
import { jpegGrid } from '@/lib/mcu'
import { gridWords, planCropRotate, turnedSize } from '@/lib/plans/crop-rotate'
import type { Plan } from '@/lib/plans/plan'
import type { Rect } from '@/lib/pixels'
import { JobAction } from './JobAction'
import { Button } from './ui/Button'
import { NumberInput } from './ui/NumberInput'
import { Segmented } from './ui/Segmented'
import { Slider } from './ui/Slider'
import { Toggle } from './ui/Toggle'

const TURNS = [
  { how: 'left', label: 'Rotate left', Icon: RotateCcw },
  { how: 'right', label: 'Rotate right', Icon: RotateCw },
  { how: 'horizontal', label: 'Flip horizontal', Icon: FlipHorizontal2 },
  { how: 'vertical', label: 'Flip vertical', Icon: FlipVertical2 },
] as const

const FIELDS: { field: keyof Rect; label: string }[] = [
  { field: 'x', label: 'X' },
  { field: 'y', label: 'Y' },
  { field: 'width', label: 'Width' },
  { field: 'height', label: 'Height' },
]

const heading = 'text-[13px] font-medium'

/** Crop and rotate (SPEC.md 6.8): aspect, turns and flips, straightening and the lossless grid, over the frame
 * on the stage. The App holds the tool's state, which the stage's frame and `[` `]` change too. */
export function CropRotateView({
  info,
  tool,
  onTool,
  job,
  onRun,
  onCancel,
}: {
  info: ImageInfo
  tool: CropTool
  onTool: (tool: CropTool) => void
  job: JobState
  onRun: (plan: Plan, options: JobOptions) => void
  onCancel: () => void
}) {
  const planned = planCropRotate(info, cropSettings(tool))
  const size = turnedSize(info, tool.turn)
  const { crop } = tool
  const whole = crop.x === 0 && crop.y === 0 && crop.width === size.width && crop.height === size.height
  const fixed = tool.aspect !== 'free' && tool.aspect !== '1:1'
  const grid = info.format === 'jpeg' ? jpegGrid(info, tool.turn) : null

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={heading}>Aspect</span>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={tool.portrait}
            disabled={!fixed}
            className="h-6 aria-pressed:bg-sunken aria-pressed:text-ink"
            onClick={() => onTool(aspectCrop(tool, info, tool.aspect, !tool.portrait))}
          >
            <RectangleVertical aria-hidden="true" strokeWidth={1.75} />
            Portrait
          </Button>
        </div>
        <Segmented
          label="Aspect"
          value={tool.aspect}
          options={ASPECTS}
          onChange={(aspect) => onTool(aspectCrop(tool, info, aspect))}
          className="grid grid-cols-4 gap-0.5"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TURNS.map(({ how, label, Icon }) => (
          <Button key={how} size="sm" onClick={() => onTool(turnCrop(tool, info, how))}>
            <Icon aria-hidden="true" strokeWidth={1.75} />
            {label}
          </Button>
        ))}
        <p className="col-span-2 text-xs text-ink-soft">
          <kbd className="font-sans">[</kbd> and <kbd className="font-sans">]</kbd> rotate too.
        </p>
      </div>

      <Slider
        label="Straighten"
        value={tool.straighten}
        min={-45}
        max={45}
        step={0.1}
        centred
        onChange={(degrees) => onTool(straightenCrop(tool, info, degrees))}
        aside={
          <NumberInput
            label="Straighten"
            value={tool.straighten}
            min={-45}
            max={45}
            step={0.1}
            unit="°"
            onChange={(degrees) => onTool(straightenCrop(tool, info, degrees))}
            className="w-24"
          />
        }
      />

      {grid && (
        <Toggle
          label="Lossless grid"
          hint={
            tool.straighten
              ? 'Straightening re-encodes the picture, so the grid doesn’t apply.'
              : `Keeps the crop’s left and top edges on the JPEG’s ${gridWords(grid)} blocks, so it’s lossless.`
          }
          checked={tool.snap}
          onChange={(on) => onTool(snapCrop(tool, info, on))}
        />
      )}

      {planned.trim && (
        <div className="flex flex-col gap-2">
          <span id="crop-partial" className={heading}>
            Partial blocks
          </span>
          <RadioGroup.Root
            aria-labelledby="crop-partial"
            value={tool.partial}
            onValueChange={(partial) => onTool({ ...tool, partial: partial as CropTool['partial'] })}
            className="flex flex-col gap-1.5"
          >
            {[
              { value: 'trim', label: planned.trim },
              { value: 'reencode', label: 'Re-encode the whole picture' },
            ].map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                <RadioGroup.Item
                  value={option.value}
                  aria-label={option.label}
                  className="flex size-4 shrink-0 items-center justify-center rounded-full bg-panel shadow-[0_0_0_1px_var(--color-line-strong)] data-[state=checked]:shadow-[0_0_0_1px_var(--color-accent)]"
                >
                  <RadioGroup.Indicator className="size-2 rounded-full bg-accent" />
                </RadioGroup.Item>
                {option.label}
              </label>
            ))}
          </RadioGroup.Root>
          <p className="text-xs text-ink-soft">
            A turn can only move whole blocks of a JPEG, so the part-block strip at that edge is trimmed or the picture
            is re-encoded.
          </p>
        </div>
      )}

      <details className="group">
        <summary className={`${heading} cursor-pointer text-ink-soft hover:text-ink`}>More options</summary>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {FIELDS.map(({ field, label }) => (
            <div key={field} className="flex flex-col gap-1 text-xs text-ink-soft">
              <span aria-hidden="true">{label}</span>
              <NumberInput
                label={label}
                value={crop[field]}
                min={field === 'width' || field === 'height' ? 1 : 0}
                max={field === 'x' || field === 'width' ? size.width : size.height}
                unit="px"
                onChange={(value) => onTool(fieldCrop(tool, info, field, value))}
              />
            </div>
          ))}
        </div>
      </details>

      <JobAction
        planned={planned}
        verb={whole ? 'Rotate' : 'Crop'}
        state={job}
        onCancel={onCancel}
        onStart={() => {
          const plan = planned.plan
          if (!plan) return
          onRun(plan, {
            doing: whole ? 'Rotating' : 'Cropping',
            size: info.size,
            png: (blob) =>
              plan.kind === 'pixels'
                ? { blob, format: plan.encoding.format, orientation: 1 }
                : plan.kind === 'jpegtran'
                  ? { blob, format: 'jpeg', orientation: 1 }
                  : null,
          })
        }}
      />
    </div>
  )
}
