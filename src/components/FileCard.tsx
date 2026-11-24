import { formatBytes } from '@/lib/format-bytes'
import { Button } from './ui/Button'

/** The open file at the top of the settings column: its name and size, and a way to open another. The
 * thumbnail, dimensions, format and kind chips join it once the file is read (DESIGN.md's File card). */
export function FileCard({ file, onReplace }: { file: File; onReplace: () => void }) {
  return (
    <section aria-label="Open file" className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-ink-soft">{formatBytes(file.size)}</p>
      </div>
      <Button size="sm" variant="ghost" onClick={onReplace}>
        Replace
      </Button>
    </section>
  )
}
