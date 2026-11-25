import { useEffect, useRef, useState } from 'react'
import type { Source } from '@/hooks/useSource'
import { formatBytes } from '@/lib/format-bytes'
import { KIND_CHIPS } from '@/lib/kinds'
import { Button } from './ui/Button'

/** The open file at the top of the settings column (DESIGN.md's File card): a thumbnail, the name with its
 * extension always visible, size, dimensions and format, chips for special kinds, and Replace. */
export function FileCard({ source, onReplace }: { source: Source; onReplace: () => void }) {
  const { file, info } = source
  const dot = file.name.lastIndexOf('.')
  const [stem, extension] = dot > 0 ? [file.name.slice(0, dot), file.name.slice(dot)] : [file.name, '']
  return (
    <section aria-label="Open file" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <Thumbnail source={source} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 text-[13px] font-medium" title={file.name}>
            <span className="truncate">{stem}</span>
            <span className="shrink-0">{extension}</span>
          </p>
          <p className="text-xs text-ink-soft">
            {info
              ? `${formatBytes(file.size)} · ${info.displayWidth} × ${info.displayHeight} · ${info.formatName}`
              : `${formatBytes(file.size)} · Reading metadata…`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onReplace}>
          Replace
        </Button>
      </div>
      {!!info?.kinds.length && (
        <ul aria-label="Kinds" className="flex flex-wrap gap-1.5">
          {info.kinds.map((kind) => (
            <li key={kind} className="rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-soft">
              {KIND_CHIPS[kind]}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 64 × 48, contained on sunken: the file itself where the browser shows it, else the decoded pixels. */
function Thumbnail({ source }: { source: Source }) {
  const [url, setUrl] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const shown = source.picture?.type === 'file'
  const pixels = source.picture?.type === 'pixels' ? (source.pixels ?? source.picture.pixels) : null

  useEffect(() => {
    if (!shown) return setUrl(null)
    const next = URL.createObjectURL(source.file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [shown, source.file])

  useEffect(() => {
    const el = canvas.current
    if (!el || !pixels) return
    el.width = pixels.width
    el.height = pixels.height
    el.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
  }, [pixels])

  return (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken">
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
      {pixels && <canvas ref={canvas} className="max-h-full max-w-full object-contain" />}
    </div>
  )
}
