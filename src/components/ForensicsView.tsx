import { ChevronRight, Download, ExternalLink, Images } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCopyAndOpen } from '@/hooks/useCopyAndOpen'
import { cn } from '@/lib/cn'
import { ACCEPT } from '@/lib/file-types'
import { editFinding } from '@/lib/forensics/history'
import { LAYER_LIMITS, type LayerSettings } from '@/lib/forensics/layer'
import { trailerExtension } from '@/lib/forensics/trailer'
import { compareWords, compressionRows, editRows, hiddenWords, stepWords, thumbnailFinding } from '@/lib/forensics/view'
import type { ImageInfo } from '@/lib/info'
import { stem } from '@/lib/names'
import type { Fingerprint, Layer, ThumbnailMatch, WorkerClient } from '@/lib/protocol'
import type { StageView } from '@/lib/views'
import { Finding } from './Finding'
import { KeyValueList } from './KeyValueList'
import { saveBlob } from './save'
import { Button } from './ui/Button'
import { CopyButton } from './ui/CopyButton'
import { Slider } from './ui/Slider'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`forensics-${id}`} className="flex flex-col gap-2.5">
      <h3 id={`forensics-${id}`} className="text-[13px] font-medium text-ink-soft">
        {title}
      </h3>
      {children}
    </section>
  )
}

const Caption = ({ children }: { children: ReactNode }) => <p className="text-xs text-ink-soft">{children}</p>

const Problem = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="text-xs text-danger">
    {children}
  </p>
)

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** A Blob's object URL for as long as the component shows it. */
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/** The largest thumbnail or preview beside the picture, at the same height, and whether they match. Hidden
 * when the file has none, or none could be read. */
function Thumbnail({ ask }: { ask: () => Promise<ThumbnailMatch | null> }) {
  const [state, setState] = useState<{ match: ThumbnailMatch | null } | { error: string } | null>(null)
  useEffect(() => {
    let live = true
    ask().then(
      (match) => live && setState({ match }),
      (error: unknown) => live && setState({ error: message(error) }),
    )
    return () => {
      live = false
    }
    // `ask` is the client's; Forensics is shown afresh for each file.
  }, [])
  const match = state && 'match' in state ? state.match : null
  const thumbnail = useObjectUrl(match?.thumbnail ?? null)
  const picture = useObjectUrl(match?.picture ?? null)
  if (state && 'match' in state && !match) return null
  return (
    <Section id="thumbnail" title="Embedded thumbnail">
      {!state ? (
        <p className="text-[13px] text-ink-soft">Reading the thumbnail…</p>
      ) : 'error' in state ? (
        <Problem>{state.error}</Problem>
      ) : (
        match && (
          <>
            <div className="flex gap-2">
              {[
                { url: thumbnail, alt: match.label, caption: match.label },
                { url: picture, alt: 'The picture', caption: 'The picture' },
              ].map(({ url, alt, caption }) => (
                <figure key={alt} className="flex min-w-0 flex-col gap-1">
                  <div className="flex h-24 items-center rounded-control bg-sunken">
                    {url && (
                      <img src={url} alt={alt} className="h-24 w-auto max-w-full rounded-control object-contain" />
                    )}
                  </div>
                  <figcaption className="truncate text-xs text-ink-soft">{caption}</figcaption>
                </figure>
              ))}
            </div>
            <ul>
              <Finding finding={thumbnailFinding(match)} />
            </ul>
          </>
        )
      )}
    </Section>
  )
}

const LAYERS: Record<Exclude<Layer, 'depth'>, { title: string; summary: string; caution: string }> = {
  ela: {
    title: 'Error levels',
    summary: 'The picture saved again as a JPEG, and how much each part changed.',
    caution:
      'Parts saved a different number of times can stand out. Edges, text and smooth areas differ naturally, so treat this as a reason to look closer, not proof.',
  },
  noise: {
    title: 'Noise',
    summary: 'The grain in the picture, without what it shows.',
    caution:
      'Each pixel minus the median of the pixels around it, amplified. A part pasted in from another picture, or smoothed or sharpened apart from the rest, can have grain of its own. Edges and texture stand out naturally, so treat this as a reason to look closer, not proof.',
  },
}

/** A layer's section: its heading opens it, which switches the stage to the layer (SPEC.md section 5), and
 * shows its sliders. Open exactly while the stage shows the layer. */
function LayerSection({
  layer,
  open,
  onOpen,
  children,
}: {
  layer: Exclude<Layer, 'depth'>
  open: boolean
  onOpen: (open: boolean) => void
  children: ReactNode
}) {
  const { title, summary, caution } = LAYERS[layer]
  return (
    <section aria-labelledby={`forensics-${layer}`} className="flex flex-col gap-2.5">
      <h3 id={`forensics-${layer}`} className="text-[13px] font-medium text-ink-soft">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`forensics-${layer}-body`}
          onClick={() => onOpen(!open)}
          className="-mx-1 flex items-center gap-1 rounded-control px-1 transition-colors duration-150 hover:text-ink"
        >
          {title}
          <ChevronRight
            aria-hidden="true"
            className={cn('size-3.5 transition-transform duration-150', open && 'rotate-90')}
            strokeWidth={2}
          />
        </button>
      </h3>
      <div id={`forensics-${layer}-body`} className="flex flex-col gap-3">
        {open ? (
          <>
            {children}
            <Caption>{caution}</Caption>
          </>
        ) : (
          <Caption>{summary} Opens on the stage.</Caption>
        )}
      </div>
    </section>
  )
}

/** SHA-256 and the perceptual hash, each to copy, and Compare with another image. */
function Fingerprints({ ask }: { ask: (file?: File) => Promise<Fingerprint> }) {
  const [mine, setMine] = useState<Fingerprint | { error: string } | null>(null)
  const [compared, setCompared] = useState<{ name: string; words: string | null; error: string | null } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    ask().then(
      (print) => live && setMine(print),
      (error: unknown) => live && setMine({ error: message(error) }),
    )
    return () => {
      live = false
    }
    // `ask` is the client's; Forensics is shown afresh for each file.
  }, [])

  async function compare(file: File) {
    setCompared({ name: file.name, words: null, error: null })
    try {
      const theirs = await ask(file)
      const print = mine && 'sha256' in mine ? mine : await ask()
      setCompared({ name: file.name, words: compareWords(print, theirs), error: null })
    } catch (error) {
      setCompared({ name: file.name, words: null, error: message(error) })
    }
  }

  const print = mine && 'sha256' in mine ? mine : null
  const rows = print
    ? [
        { label: 'SHA-256', value: print.sha256 },
        { label: 'Perceptual hash', value: print.phash ?? 'None: Loupe can’t show this picture.' },
      ]
    : []

  return (
    <Section id="fingerprints" title="Fingerprints">
      {!mine ? (
        <p className="text-[13px] text-ink-soft">Working out fingerprints…</p>
      ) : 'error' in mine ? (
        <Problem>{mine.error}</Problem>
      ) : (
        <dl className="flex flex-col gap-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="flex items-center justify-between gap-2 text-[13px] text-ink-soft">
                {label}
                {(label === 'SHA-256' || print?.phash) && (
                  <CopyButton
                    text={() => value}
                    label="Copy"
                    name={`Copy ${label === 'SHA-256' ? label : 'perceptual hash'}`}
                  />
                )}
              </dt>
              <dd className="font-mono text-xs break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div>
        <Button size="sm" onClick={() => input.current?.click()}>
          <Images aria-hidden="true" strokeWidth={1.75} />
          Compare with another image…
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          aria-label="Compare with another image"
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            const chosen = e.target.files?.[0]
            if (chosen) void compare(chosen)
            e.target.value = ''
          }}
        />
      </div>
      {compared && (
        <div className="flex flex-col gap-0.5" aria-live="polite">
          <Caption>Compared with {compared.name}</Caption>
          {compared.error ? (
            <Problem>{compared.error}</Problem>
          ) : (
            <p className="text-[13px]">{compared.words ?? 'Comparing…'}</p>
          )}
        </div>
      )}
      <Caption>
        The SHA-256 changes with any change to the file. The perceptual hash describes the picture, so a resized or
        recompressed copy gets one close to it.
      </Caption>
    </Section>
  )
}

const SITES = [
  { name: 'Google Lens', url: 'https://lens.google.com/' },
  { name: 'TinEye', url: 'https://tineye.com/' },
  { name: 'Bing', url: 'https://www.bing.com/visualsearch' },
]
const COPIES = 'Copies the picture and opens the site in a new tab, ready to paste. Only the site you choose sees it.'
const SAVES = 'Saves a PNG copy and opens the site in a new tab, to upload it there. Only the site you choose sees it.'
const COPY_FAILED = 'Copying didn’t work here. Save a PNG copy and upload it there instead.'

/** Reverse image search: each site's button copies the picture and opens it, as Check on SynthID does. */
function FindOnline({ info, png, canCopy }: { info: ImageInfo; png: () => Promise<Blob>; canCopy: boolean }) {
  const { go, save, problem, copyFailed } = useCopyAndOpen({
    make: png,
    source: info,
    name: `${stem(info.name)}.png`,
    canCopy,
  })
  return (
    <Section id="online" title="Find it online">
      <div className="flex flex-wrap gap-2">
        {SITES.map((site) => (
          <Button key={site.name} size="sm" disabled={!!problem} onClick={() => go(site.url)}>
            <ExternalLink aria-hidden="true" strokeWidth={1.75} />
            {site.name}
          </Button>
        ))}
      </div>
      <Caption>{problem ?? (copyFailed ? COPY_FAILED : canCopy ? COPIES : SAVES)}</Caption>
      {copyFailed && (
        <div>
          <Button size="sm" onClick={save}>
            <Download aria-hidden="true" strokeWidth={1.75} />
            Save a PNG copy
          </Button>
        </div>
      )}
    </Section>
  )
}

/** Forensics (SPEC.md 6.5): the edit trail, the embedded thumbnail, a JPEG's compression, data hidden after the
 * picture, the error levels and noise layers (each switching the stage to it), fingerprints and Find it online.
 * Read-only apart from the online buttons. `shows`: the stage has a picture, which the layers need. */
export function ForensicsView({
  info,
  shows,
  view,
  onView,
  settings,
  onSettings,
  client,
  canCopy,
}: {
  info: ImageInfo
  shows: boolean
  view: StageView
  onView: (view: StageView) => void
  settings: LayerSettings
  onSettings: (settings: LayerSettings) => void
  client: Pick<WorkerClient, 'extract' | 'thumbnail' | 'fingerprint' | 'png'>
  canCopy: boolean
}) {
  const { edits, jpeg, trailer } = info
  const rows = editRows(edits)
  const [failed, setFailed] = useState<string | null>(null)
  // A raw file's picture is its largest preview already, so there's nothing to compare it with.
  const thumbnail =
    shows && info.format !== 'raw' && info.embedded.some((e) => e.kind === 'thumbnail' || e.kind === 'preview')

  const save = async () => {
    if (!trailer) return
    setFailed(null)
    try {
      saveBlob(await client.extract('trailer'), `${stem(info.name)} hidden.${trailerExtension(trailer.looksLike)}`)
    } catch (error) {
      setFailed(message(error))
    }
  }

  const slider = (key: keyof LayerSettings, label: string, format: (v: number) => string) => (
    <Slider
      label={label}
      value={settings[key]}
      {...LAYER_LIMITS[key]}
      format={format}
      onChange={(v) => onSettings({ ...settings, [key]: v })}
    />
  )
  const times = (v: number) => `×${v}`

  return (
    <div className="flex flex-col gap-7">
      <Section id="edits" title="Edit trail">
        <ul className="flex flex-col gap-2">
          <Finding finding={{ ...editFinding(edits, info.dates), tool: null }} />
        </ul>
        {rows.length > 0 && <KeyValueList rows={rows} />}
        {edits.history.length > 0 && (
          <ol aria-label="History" className="flex flex-col gap-2 border-l border-line pl-3">
            {edits.history.map((step, i) => {
              const words = stepWords(step)
              return (
                <li key={i} className="flex flex-col">
                  <span className="text-[13px] font-medium">{step.action}</span>
                  {words && <span className="text-xs text-ink-soft">{words}</span>}
                </li>
              )
            })}
          </ol>
        )}
      </Section>

      {thumbnail && <Thumbnail ask={() => client.thumbnail()} />}

      {jpeg && (
        <Section id="compression" title="Compression">
          <KeyValueList rows={compressionRows(jpeg)} />
          <Caption>Estimated from the file’s quantisation tables.</Caption>
        </Section>
      )}

      <Section id="hidden" title="Hidden data">
        <p className="text-[13px]">{hiddenWords(info.format, trailer)}</p>
        {trailer && (
          <div>
            <Button size="sm" onClick={() => void save()}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Save it
            </Button>
          </div>
        )}
        {failed && <Problem>{failed}</Problem>}
        {info.unknownChunks.length > 0 && (
          <Caption>PNG chunks Loupe doesn’t know: {info.unknownChunks.join(', ')}.</Caption>
        )}
      </Section>

      {shows ? (
        <>
          <LayerSection layer="ela" open={view === 'ela'} onOpen={(open) => onView(open ? 'ela' : 'picture')}>
            {slider('quality', 'Quality', String)}
            {slider('brightness', 'Brightness', times)}
          </LayerSection>
          <LayerSection layer="noise" open={view === 'noise'} onOpen={(open) => onView(open ? 'noise' : 'picture')}>
            {slider('noise', 'Amplification', times)}
          </LayerSection>
        </>
      ) : (
        <Section id="layers" title="Error levels and noise">
          <Caption>Error levels and noise need a picture Loupe can show.</Caption>
        </Section>
      )}

      <Fingerprints ask={(file) => client.fingerprint(file)} />

      <FindOnline info={info} png={() => client.png()} canCopy={canCopy} />
    </div>
  )
}
