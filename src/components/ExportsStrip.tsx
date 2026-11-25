import { AlertCircle, Copy, Download, Image, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Export, Made } from '@/hooks/useJob'
import { cn } from '@/lib/cn'
import { formatBytes, sizeChange } from '@/lib/format-bytes'
import { Button } from './ui/Button'

/** The results of this session's jobs, newest first, at the foot of the stage (DESIGN.md). `note` says what
 * became of the last job, for screen readers. `busy` while the job slot is taken, which disables Copy. */
export function ExportsStrip({
  exports,
  note,
  busy,
  canCopy,
  onUse,
  onCopy,
  onOpen,
  onRemove,
}: {
  exports: Export[]
  note: string
  busy: boolean
  /** Whether the clipboard takes images here (`Capabilities.clipboardImage`). */
  canCopy: boolean
  /** A result was downloaded. */
  onUse: (id: number) => void
  onCopy: (id: number) => void
  onOpen: (item: Made) => void
  onRemove: (id: number) => void
}) {
  const list = useRef<HTMLUListElement>(null)
  // Where a removed card was, so focus can go to the card that takes its place.
  const removed = useRef<number | null>(null)
  useEffect(() => {
    const at = removed.current
    removed.current = null
    if (at === null || (document.activeElement && document.activeElement !== document.body)) return
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button[data-remove]')
    buttons?.[Math.min(at, buttons.length - 1)]?.focus()
  }, [exports])

  return (
    <>
      {/* Always there, so the first result is announced as well. */}
      <p role="status" aria-label="Latest export" className="sr-only">
        {note}
      </p>
      {exports.length > 0 && (
        <section
          aria-label="Exports"
          className="order-5 border-t border-line bg-panel lg:order-none lg:col-start-3 lg:row-start-3"
        >
          <ul ref={list} className="flex gap-2 overflow-x-auto px-4 py-3 lg:px-5">
            {exports.map((e, i) => (
              <li
                key={e.id}
                className={cn(
                  'flex w-[22rem] shrink-0 items-start gap-3 rounded-panel px-3 py-2.5 ring-1',
                  e.error === undefined ? 'ring-line' : 'ring-danger',
                )}
              >
                {e.error === undefined ? (
                  <Made
                    item={e}
                    busy={busy}
                    canCopy={canCopy}
                    onUse={() => onUse(e.id)}
                    onCopy={() => onCopy(e.id)}
                    onOpen={() => onOpen(e)}
                  />
                ) : (
                  <>
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium" title={e.name}>
                        {e.name}
                      </p>
                      <p className="text-xs text-danger">{e.error}</p>
                    </div>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  data-remove
                  aria-label={`Remove ${e.name}`}
                  className="px-1.5"
                  onClick={() => {
                    removed.current = i
                    onRemove(e.id)
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** A finished result: a 40 × 30 thumbnail, its name, size and change against the source, what the job found
 * on reading it back, and Download, Copy and Open in Loupe. */
function Made({
  item,
  busy,
  canCopy,
  onUse,
  onCopy,
  onOpen,
}: {
  item: Made
  busy: boolean
  canCopy: boolean
  onUse: () => void
  onCopy: () => void
  onOpen: () => void
}) {
  // A format the browser can't show (HEIC outside Safari, raw) falls back to an icon.
  const [shown, setShown] = useState(true)
  return (
    <>
      {shown ? (
        <img
          src={item.url}
          alt=""
          onError={() => setShown(false)}
          className="h-[30px] w-10 shrink-0 rounded-[4px] bg-sunken object-contain"
        />
      ) : (
        <Image aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-soft" strokeWidth={1.75} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div>
          <p className="truncate text-[13px] font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="text-xs text-ink-soft">
            {formatBytes(item.size)} · {sizeChange(item.size, item.sourceSize)}
          </p>
          {item.notes.map((n) => (
            <p key={n} className="text-xs text-ink">
              {n}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <a
            href={item.url}
            download={item.name}
            onClick={onUse}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control bg-panel px-2.5 text-[13px] font-medium text-ink shadow-[0_0_0_1px_var(--color-line-strong)] transition-colors duration-150 hover:bg-sunken [&_svg]:size-4"
          >
            <Download aria-hidden="true" />
            Download
          </a>
          {canCopy && item.png && (
            <Button size="sm" disabled={busy} onClick={onCopy}>
              <Copy aria-hidden="true" />
              Copy
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Open in Loupe
          </Button>
        </div>
      </div>
    </>
  )
}
