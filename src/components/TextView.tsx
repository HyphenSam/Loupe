import { CircleDashed, ScanText } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { TextFiles } from '@/hooks/useTextFiles'
import type { TextRead } from '@/hooks/useTextReads'
import { cn } from '@/lib/cn'
import { downloadSize, filesFor, keptWords, megabytes, progressWords } from '@/lib/ocr/files'
import type { Models } from '@/lib/ocr/models'
import { SCRIPTS, type Script } from '@/lib/ocr/scripts'
import { isUnsure } from '@/lib/ocr/types'
import { FIELD } from './ui/TextField'
import { Button } from './ui/Button'
import { CopyButton } from './ui/CopyButton'

/** The Text tool (SPEC.md 6.12): the Script select, the download the script needs, then the lines read from the
 * picture, each with Copy. `selected` is the line whose box the stage shows in magenta. */
export function TextView({
  script,
  onScript,
  files,
  models,
  read,
  onDownload,
  onRemove,
  onRetry,
  selected,
  onSelect,
}: {
  script: Script
  onScript: (script: Script) => void
  files: TextFiles
  models: Models
  read: TextRead | null
  onDownload: () => void
  /** Deletes the files and frees the models. */
  onRemove: () => void
  onRetry: () => void
  selected: number | null
  onSelect: (line: number) => void
}) {
  const held = files.held
  const { state } = files
  const downloading = state.phase === 'downloading' ? state.downloading : null
  const error = state.phase === 'failed' ? state.error : null
  const scriptHeld = !!held && filesFor(script, models).every((f) => held.includes(f.path))
  const kept = held && keptWords(held, models)
  const box = useRef<HTMLDivElement>(null)

  // Download and Cancel replace each other; focus left on the one that went goes to the one that came.
  const phase = downloading ? 'downloading' : scriptHeld ? 'held' : 'not held'
  const was = useRef(phase)
  useEffect(() => {
    if (was.current === phase) return
    was.current = phase
    if (document.activeElement && document.activeElement !== document.body) return
    box.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [phase])

  const status = downloading
    ? 'Downloading text recognition…'
    : !scriptHeld
      ? ''
      : read?.status === 'reading'
        ? 'Reading text…'
        : read?.status === 'read'
          ? read.lines.length
            ? `${linesWords(read.lines.length)}.`
            : 'No text found.'
          : ''

  return (
    <div ref={box} className="flex flex-col gap-5">
      <p role="status" aria-label="Text" className="sr-only">
        {status}
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="text-script" className="text-[13px] font-medium">
          Script
        </label>
        <select
          id="text-script"
          value={script}
          onChange={(e) => onScript(e.target.value as Script)}
          className={`${FIELD} h-8`}
        >
          {SCRIPTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {held === null ? null : downloading ? (
        <Progress
          label="Downloading text recognition"
          fraction={downloading.total ? downloading.done / downloading.total : 0}
          words={progressWords(downloading.done, downloading.total)}
          onCancel={files.cancel}
        />
      ) : !scriptHeld ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-soft">
            Loupe reads text with a recognition model that runs on this device. It’s downloaded once from Loupe’s own
            site and kept for offline use; the picture never leaves your device.
          </p>
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <div>
            <Button variant="primary" onClick={onDownload}>
              Download (about {megabytes(downloadSize(script, held, models))})
            </Button>
          </div>
        </div>
      ) : read?.status === 'reading' ? (
        <Progress
          label="Reading text"
          fraction={read.progress ? read.progress.line / read.progress.lines : null}
          words={read.progress ? `Reading line ${read.progress.line} of ${read.progress.lines}` : 'Reading text…'}
        />
      ) : read?.status === 'failed' ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-[13px] text-danger">
            {read.message}
          </p>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : read?.status === 'read' ? (
        read.lines.length ? (
          <Lines read={read} selected={selected} onSelect={onSelect} />
        ) : (
          <div className="flex flex-col gap-1 text-xs text-ink-soft">
            <p className="flex gap-1.5">
              <CircleDashed aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
              No text found.
            </p>
            <p className="pl-5">
              Try another script if the text isn’t in {SCRIPTS.find((s) => s.id === script)!.reads}.
            </p>
          </div>
        )
      ) : null}

      {kept && !downloading && (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-ink-soft">{kept}</p>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      )}
    </div>
  )
}

const linesWords = (count: number) => `${count} ${count === 1 ? 'line' : 'lines'} found`

/** The lines in reading order, each selectable text with Copy; focusing or hovering one selects its box. */
function Lines({
  read,
  selected,
  onSelect,
}: {
  read: Extract<TextRead, { status: 'read' }>
  selected: number | null
  onSelect: (line: number) => void
}) {
  const list = useRef<HTMLOListElement>(null)
  // A box picked on the stage brings its line into view where the settings column scrolls (desktop); on a phone the
  // column is the page, and the chip over the box already shows the line.
  useEffect(() => {
    if (selected === null || !window.matchMedia('(min-width: 64rem)').matches) return
    list.current?.children[selected]?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])
  const { lines } = read
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium">{linesWords(lines.length)}</p>
        <CopyButton variant="secondary" label="Copy all" text={() => lines.map((l) => l.text).join('\n')} />
      </div>
      <ol ref={list} aria-label="Lines" className="-mx-2 flex flex-col">
        {lines.map((line, i) => (
          <li
            key={i}
            aria-current={selected === i ? 'true' : undefined}
            onFocus={() => onSelect(i)}
            onPointerEnter={() => onSelect(i)}
            className={cn(
              'flex items-start gap-2 rounded-control px-2 py-1.5 transition-colors duration-150',
              selected === i && 'bg-sunken',
            )}
          >
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-sm break-words select-text">{line.text}</p>
              {isUnsure(line) && (
                <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                  <CircleDashed aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                  Unsure
                </span>
              )}
            </div>
            <CopyButton label="Copy" name={`Copy line ${i + 1}`} text={() => line.text} />
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-1.5 text-xs text-ink-soft">
        <ScanText aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
        Read by PaddleOCR on this device. Check anything that matters against the picture.
      </p>
    </div>
  )
}

/** A magenta bar filling left to right (pulsing while it can't say how far), the words under it, and Cancel. */
function Progress({
  label,
  fraction,
  words,
  onCancel,
}: {
  label: string
  fraction: number | null
  words: string
  onCancel?: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fraction === null ? undefined : Math.floor(fraction * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-sunken"
        >
          <div
            className={
              fraction === null ? 'h-full w-full animate-pulse bg-accent' : 'h-full bg-accent transition-[width]'
            }
            style={fraction === null ? undefined : { width: `${fraction * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-soft tabular-nums">{words}</p>
      </div>
      {onCancel && <Button onClick={onCancel}>Cancel</Button>}
    </div>
  )
}
