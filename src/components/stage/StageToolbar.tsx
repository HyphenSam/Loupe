import { Check, Minus, Plus, Search, SwatchBook } from 'lucide-react'
import { DropdownMenu, RadioGroup } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Background, StageSettings } from '@/lib/settings'
import { VIEW_LABELS, type StageView } from '@/lib/views'

const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'checker', label: 'Checkerboard' },
]

/** The classes of a toolbar button, and of one that's on, for the stage's background. */
function itemClasses(light: boolean) {
  return {
    item: cn(
      'flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium transition-colors duration-150 [&_svg]:size-4',
      light ? 'hover:bg-black/10' : 'hover:bg-white/15',
    ),
    on: light ? 'bg-black/12 text-stage-light-ink' : 'bg-white/20 text-stage-ink',
  }
}

/** The toolbar floating at the stage's top edge (DESIGN.md): the view chips, then the view's own controls.
 * Light ink on translucent black, or dark ink on translucent white over the light background. */
export function StageToolbar({
  views,
  view,
  onView,
  light,
  children,
}: {
  views: StageView[]
  view: StageView
  onView: (view: StageView) => void
  light: boolean
  children: ReactNode
}) {
  const { item, on } = itemClasses(light)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div
        role="toolbar"
        aria-label="Stage"
        className={cn(
          'pointer-events-auto flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1 text-[13px] backdrop-blur-sm [scrollbar-width:none]',
          light ? 'bg-white/70 text-stage-light-ink ring-1 ring-black/10' : 'bg-black/55 text-stage-ink',
        )}
      >
        <RadioGroup.Root
          aria-label="View"
          value={view}
          onValueChange={(value) => onView(value as StageView)}
          orientation="horizontal"
          className="flex"
        >
          {views.map((v) => (
            <RadioGroup.Item key={v} value={v} className={cn(item, v === view && on)}>
              {VIEW_LABELS[v]}
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
        <Divider light={light} />
        {children}
      </div>
    </div>
  )
}

/** The picture's controls: zoom, the background menu and the magnifier. */
export function PictureControls({
  zoom,
  fitted,
  settings,
  onSettings,
  onFit,
  onActualSize,
  onZoom,
  light,
}: {
  zoom: string
  fitted: boolean
  settings: StageSettings
  onSettings: (settings: StageSettings) => void
  onFit: () => void
  onActualSize: () => void
  onZoom: (factor: number) => void
  light: boolean
}) {
  const { item, on } = itemClasses(light)
  return (
    <>
      <button type="button" aria-pressed={fitted} onClick={onFit} className={cn(item, fitted && on)}>
        Fit
      </button>
      <button type="button" onClick={onActualSize} className={item}>
        100%
      </button>
      <ZoomButtons zoom={zoom} onZoom={onZoom} light={light} />
      <Divider light={light} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Background"
          className={cn(item, light ? 'data-[state=open]:bg-black/12' : 'data-[state=open]:bg-white/20')}
        >
          <SwatchBook strokeWidth={1.75} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="center"
            sideOffset={8}
            className="z-50 min-w-40 rounded-panel bg-panel p-1 text-ink shadow-float ring-1 ring-line"
          >
            <DropdownMenu.Label className="px-2 py-1 text-xs text-ink-soft">Background</DropdownMenu.Label>
            <DropdownMenu.RadioGroup
              value={settings.background}
              onValueChange={(value) => onSettings({ ...settings, background: value as Background })}
            >
              {BACKGROUNDS.map(({ value, label }) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button
        type="button"
        aria-label="Magnifier"
        aria-keyshortcuts="L"
        aria-pressed={settings.magnifier}
        title="Magnifier (L)"
        onClick={() => onSettings({ ...settings, magnifier: !settings.magnifier })}
        className={cn(item, settings.magnifier && on)}
      >
        <Search strokeWidth={1.75} />
      </button>
    </>
  )
}

/** Zoom out, the zoom level as text, zoom in: the picture's and the map's. */
export function ZoomButtons({
  zoom,
  onZoom,
  light,
}: {
  zoom?: string
  onZoom: (step: number) => void
  light: boolean
}) {
  const { item } = itemClasses(light)
  return (
    <>
      <button type="button" aria-label="Zoom out" onClick={() => onZoom(0.8)} className={cn(item, 'px-1.5')}>
        <Minus strokeWidth={2} />
      </button>
      {zoom !== undefined && (
        <span aria-live="polite" aria-label="Zoom" className="min-w-11 text-center text-xs tabular-nums">
          {zoom}
        </span>
      )}
      <button type="button" aria-label="Zoom in" onClick={() => onZoom(1.25)} className={cn(item, 'px-1.5')}>
        <Plus strokeWidth={2} />
      </button>
    </>
  )
}

function Divider({ light }: { light: boolean }) {
  return <span aria-hidden="true" className={cn('mx-1 h-4 w-px shrink-0', light ? 'bg-black/15' : 'bg-white/20')} />
}

function MenuItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <DropdownMenu.RadioItem
      value={value}
      className="flex h-8 cursor-default items-center gap-2 rounded-[6px] px-2 text-[13px] outline-none select-none data-highlighted:bg-sunken"
    >
      {children}
      <DropdownMenu.ItemIndicator className="ml-auto pl-3">
        <Check className="size-4" />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  )
}
