import { useEffect, useRef, useState } from 'react'
import type { Source } from '@/hooks/useSource'
import type { StageSettings } from '@/lib/settings'
import type { StageView } from '@/lib/views'
import { Compare, COMPARE_MODES } from './Compare'
import { CompareControls, StageToolbar } from './StageToolbar'

/** Export's newest result, as Compare shows it: its own URL where the browser shows its format, otherwise a PNG
 * the worker makes of it. */
export type Compared = { id: number; url: string; shown: boolean; png: () => Promise<Blob> }

/** A URL for a Blob made on demand, again whenever `key` changes, and revoked after. */
function useMadeUrl(make: (() => Promise<Blob>) | null, key: unknown): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const latest = useRef(make)
  latest.current = make
  useEffect(() => {
    const made = latest.current
    if (!made) return
    let live = true
    let created: string | null = null
    made().then(
      (blob) => {
        if (!live) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      },
      () => {},
    )
    return () => {
      live = false
      if (created) URL.revokeObjectURL(created)
      setUrl(null)
    }
  }, [key])
  return url
}

/** The Compare view (SPEC.md 6.11): the source and Export's newest result, compared in the mode the stage
 * remembers. The source is the file itself where the browser shows it, otherwise the worker's PNG of it. */
export function CompareStage({
  source,
  result,
  originalPng,
  settings,
  onSettings,
  views,
  view,
  onView,
}: {
  source: Source
  result: Compared
  originalPng: () => Promise<Blob>
  settings: StageSettings
  onSettings: (settings: StageSettings) => void
  views: StageView[]
  view: StageView
  onView: (view: StageView) => void
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const shown = source.picture?.type === 'file'
  const originalUrl = useMadeUrl(shown ? async () => source.file : originalPng, source.id)
  const madeResult = useMadeUrl(result.shown ? null : result.png, result.id)
  const resultUrl = result.shown ? result.url : madeResult
  const light = settings.background === 'light'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <StageToolbar views={views} view={view} onView={onView} light={light}>
        <CompareControls
          modes={COMPARE_MODES}
          mode={settings.compare}
          onMode={(compare) => onSettings({ ...settings, compare })}
          showOriginal={showOriginal}
          onShowOriginal={setShowOriginal}
          light={light}
        />
      </StageToolbar>
      {originalUrl ? (
        <Compare
          // Side by side halves the stage, so a zoom from another mode doesn't carry over.
          key={`${settings.compare}:${result.id}`}
          originalUrl={originalUrl}
          resultUrl={resultUrl}
          mode={settings.compare}
          showOriginal={showOriginal}
          background={settings.background}
        />
      ) : (
        <p className="flex flex-1 items-center justify-center text-[13px] text-stage-ink-soft">
          Preparing the comparison…
        </p>
      )}
    </div>
  )
}
