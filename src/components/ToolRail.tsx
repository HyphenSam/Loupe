import {
  Crop,
  EyeOff,
  FileOutput,
  Info,
  MapPin,
  Microscope,
  PackageOpen,
  ScanText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import { ToggleGroup, Tooltip } from 'radix-ui'
import { Fragment, useId } from 'react'
import { GROUPS, TOOLS, type ToolId } from '@/lib/tools'

const ICONS: Record<ToolId, LucideIcon> = {
  info: Info,
  location: MapPin,
  ai: Sparkles,
  privacy: ShieldCheck,
  forensics: Microscope,
  text: ScanText,
  extract: PackageOpen,
  'edit-metadata': Tags,
  crop: Crop,
  redact: EyeOff,
  adjust: SlidersHorizontal,
  export: FileOutput,
}

const ITEM = [
  'relative flex shrink-0 items-center gap-1.5 rounded-control text-ink-soft transition-colors duration-150',
  // Narrow: a chip with the icon before the name.
  'h-8 px-3 text-[13px] font-medium shadow-[0_0_0_1px_var(--color-line)]',
  // Desktop: the icon above a caption, a bar on the inner edge when selected.
  'lg:h-auto lg:w-full lg:flex-col lg:gap-1 lg:px-1 lg:py-2.5 lg:text-xs lg:font-normal lg:leading-tight lg:shadow-none',
  'enabled:hover:bg-sunken enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-45',
  // A tool that can't apply to the open file: dimmed, still focusable and openable, its reason in a tooltip.
  'data-dimmed:opacity-45',
  'data-[state=on]:bg-sunken data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1.5px_var(--color-focus)] lg:data-[state=on]:shadow-none',
  'lg:after:absolute lg:after:inset-y-2 lg:after:-right-1 lg:after:w-[3px] lg:after:rounded-l-full lg:data-[state=on]:after:bg-focus',
].join(' ')

/** One button per tool in two groups, Inspect and Edit, split by a hairline: a column on desktop, a
 * scrolling row of chips on narrow screens. Arrow keys move between them, across the divider. Every
 * tool is disabled until a file is open; one that can't apply to it is dimmed with `reasons`. */
export function ToolRail({
  value,
  disabled,
  reasons,
  onChange,
}: {
  value: ToolId | null
  disabled: boolean
  reasons: Partial<Record<ToolId, string>>
  onChange: (tool: ToolId) => void
}) {
  const id = useId()
  return (
    <ToggleGroup.Root
      type="single"
      aria-label="Tools"
      value={value ?? ''}
      // Radix sends '' when the selected tool is clicked again; keep it selected.
      onValueChange={(v) => v && onChange(v as ToolId)}
      disabled={disabled}
      // The chip row hides its scrollbar; the chip cut off at the edge shows there's more.
      className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] lg:h-full lg:flex-col lg:gap-1 lg:overflow-x-visible lg:overflow-y-auto lg:px-1 lg:py-2 lg:[scrollbar-width:thin]"
    >
      {GROUPS.map((group, i) => (
        <Fragment key={group.id}>
          {i > 0 && <div aria-hidden="true" className="w-px shrink-0 bg-line lg:mx-2 lg:my-1 lg:h-px lg:w-auto" />}
          <div role="group" aria-label={group.label} className="flex gap-1.5 lg:flex-col lg:gap-1">
            {TOOLS.filter((tool) => tool.group === group.id).map((tool) => {
              const Icon = ICONS[tool.id]
              const reason = disabled ? undefined : reasons[tool.id]
              const item = (
                <ToggleGroup.Item
                  key={tool.id}
                  value={tool.id}
                  className={ITEM}
                  data-dimmed={reason ? '' : undefined}
                  aria-describedby={reason ? `${id}-${tool.id}` : undefined}
                >
                  <Icon aria-hidden="true" className="size-4 lg:size-5" strokeWidth={1.75} />
                  <span className="lg:text-center">{tool.label}</span>
                  {reason && (
                    <span id={`${id}-${tool.id}`} hidden>
                      {reason}
                    </span>
                  )}
                </ToggleGroup.Item>
              )
              if (!reason) return item
              return (
                <Tooltip.Root key={tool.id}>
                  <Tooltip.Trigger asChild>{item}</Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      sideOffset={6}
                      className="z-50 max-w-60 rounded-control bg-panel px-2.5 py-1.5 text-xs text-ink shadow-float ring-1 ring-line"
                    >
                      {reason}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )
            })}
          </div>
        </Fragment>
      ))}
    </ToggleGroup.Root>
  )
}
