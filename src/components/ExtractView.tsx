import type { ManifestStore } from '@contentauth/c2pa-web'
import {
  BadgeCheck,
  Download,
  FileCode,
  FileQuestion,
  FileText,
  Film,
  Image,
  Palette,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { extractName, extractType } from '@/lib/extract'
import { formatBytes } from '@/lib/format-bytes'
import type { Embedded, EmbeddedKind, ImageInfo } from '@/lib/info'
import type { WorkerClient } from '@/lib/protocol'
import { LosslessBadge } from './LosslessBadge'
import { saveBlob } from './save'
import { Button } from './ui/Button'

const ICONS: Record<EmbeddedKind, LucideIcon> = {
  thumbnail: Image,
  preview: Image,
  'mpf-image': Image,
  'depth-map': Image,
  'gain-map': Image,
  'motion-video': Film,
  'icc-profile': Palette,
  xmp: FileCode,
  'comfyui-workflow': Workflow,
  'generation-parameters': FileText,
  'c2pa-manifest': BadgeCheck,
  trailer: FileQuestion,
  'samsung-picture': Image,
  'samsung-edits': FileCode,
  'drawing-tiles': Image,
  drawing: Image,
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** `credentials`: the manifest store the C2PA SDK read, saved as it gives it, or why it can't be saved yet. */
type Props = {
  info: ImageInfo
  extract: WorkerClient['extract']
  credentials: ManifestStore | string
  onOpen: (file: File) => void
  /** Whether this file is still the open one: an item read for it that arrives after another has opened is dropped. */
  isOpen: () => boolean
}

/** Extract (SPEC.md 6.6): everything embedded in the file, each saved as it is, and pictures opened in Loupe.
 * Pictures are read out at once for their thumbnails, one at a time; the rest when saved. */
export function ExtractView({ info, extract, credentials, onOpen, isOpen }: Props) {
  const [blobs, setBlobs] = useState<Record<string, Blob>>({})
  const asked = useRef<Record<string, Promise<Blob>>>({})

  const read = (item: Embedded): Promise<Blob> => {
    if (item.kind === 'c2pa-manifest') {
      if (typeof credentials === 'string') return Promise.reject(new Error(credentials))
      return Promise.resolve(new Blob([JSON.stringify(credentials, null, 2)], { type: extractType(item) }))
    }
    asked.current[item.id] ??= extract(item.id).then(
      (blob) => {
        setBlobs((current) => ({ ...current, [item.id]: blob }))
        return blob
      },
      (error: unknown) => {
        delete asked.current[item.id]
        throw error
      },
    )
    return asked.current[item.id]
  }

  // Pictures one after another, so ExifTool reads one at a time and the first thumbnails come soonest.
  useEffect(() => {
    let chain = Promise.resolve()
    for (const item of info.embedded.filter((e) => e.isImage))
      chain = chain.then(() =>
        read(item).then(
          () => {},
          () => {},
        ),
      )
    // `extract` is the client's; Extract is shown afresh for each file.
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-4">
        {info.embedded.map((item) => (
          <Row
            key={item.id}
            item={item}
            name={extractName(info.name, item, info.embedded)}
            blob={blobs[item.id] ?? null}
            read={() => read(item)}
            onOpen={onOpen}
            isOpen={isOpen}
          />
        ))}
      </ul>
      <div className="flex flex-col gap-1.5">
        <div>
          <LosslessBadge lossless />
        </div>
        <p className="text-xs text-ink-soft">Copied out as they are.</p>
      </div>
    </div>
  )
}

function Row({
  item,
  name,
  blob,
  read,
  onOpen,
  isOpen,
}: {
  item: Embedded
  name: string
  blob: Blob | null
  read: () => Promise<Blob>
  onOpen: (file: File) => void
  isOpen: () => boolean
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<string | null>(null)
  const url = useObjectUrl(item.isImage ? blob : null)
  const [shown, setShown] = useState(true)
  const Icon = ICONS[item.kind]
  const labelId = `extract-${item.id}`

  async function act(then: (blob: Blob) => void) {
    setProblem(null)
    try {
      const blob = await read()
      if (isOpen()) then(blob)
    } catch (error) {
      setProblem(message(error))
    }
  }

  const details = [dimensions, item.size === null ? null : formatBytes(item.size)].filter(Boolean).join(' · ')
  return (
    <li aria-labelledby={labelId} className="flex items-start gap-3">
      <span className="flex h-[30px] w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken">
        {url && shown ? (
          <img
            src={url}
            alt=""
            onLoad={(e) => setDimensions(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)}
            onError={() => setShown(false)}
            className="size-full object-contain"
          />
        ) : (
          <Icon aria-hidden="true" className="size-4 text-ink-soft" strokeWidth={1.75} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div>
          <p id={labelId} className="text-[13px] font-medium">
            {item.label}
          </p>
          {details && <p className="text-xs text-ink-soft">{details}</p>}
          {item.kind === 'drawing' && (
            <p className="text-xs text-ink-soft">Put back together by Loupe from Samsung Gallery’s tiles.</p>
          )}
          {item.kind === 'motion-video' && (
            <p className="text-xs text-ink-soft">Moviola can trim it or take its sound.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => void act((b) => saveBlob(b, name))}>
            <Download aria-hidden="true" strokeWidth={1.75} />
            Save
          </Button>
          {item.isImage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void act((b) => onOpen(new File([b], name, { type: b.type, lastModified: Date.now() })))}
            >
              Open in Loupe
            </Button>
          )}
        </div>
        {problem && (
          <p role="alert" className="text-xs text-danger">
            {problem}
          </p>
        )}
      </div>
    </li>
  )
}

/** A Blob's object URL for as long as the row shows it. */
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
