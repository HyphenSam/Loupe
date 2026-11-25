import { Search, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useMemo, useState } from 'react'
import type { ImageInfo, Tag } from '@/lib/info'
import { CopyButton } from './ui/CopyButton'

/** Friendlier names for ExifTool's family 0 groups; the rest show as ExifTool names them. */
const GROUP_NAMES: Record<string, string> = {
  ExifTool: 'ExifTool',
  File: 'File',
  MakerNotes: 'Maker notes',
  ICC_Profile: 'ICC profile',
  Composite: 'Worked out by ExifTool',
}

/** `Group: Tag: value` lines, for Copy as text. */
export const tagsText = (tags: Tag[]) => tags.map((t) => `${t.group}: ${t.name}: ${t.value}`).join('\n')

/** Every tag ExifTool reported (DESIGN.md's Sheet), over the stage: grouped, searchable, copyable. Esc
 * closes it and returns focus to the button that opened it. */
export function AllTagsSheet({ info, container }: { info: ImageInfo; container: HTMLElement | null }) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q
      ? info.tags.filter((t) => `${t.label} ${t.name} ${t.value}`.toLowerCase().includes(q))
      : info.tags
  }, [info.tags, query])
  const groups = useMemo(() => {
    const byFamily = new Map<string, Tag[]>()
    for (const tag of shown) byFamily.set(tag.family, [...(byFamily.get(tag.family) ?? []), tag])
    return [...byFamily]
  }, [shown])

  return (
    <Dialog.Root onOpenChange={(open) => !open && setQuery('')}>
      <Dialog.Trigger className="inline-flex h-9 items-center justify-center gap-2 rounded-control bg-panel px-3.5 text-sm font-medium text-ink shadow-[0_0_0_1px_var(--color-line-strong)] transition-colors duration-150 hover:bg-sunken">
        All tags
      </Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="absolute inset-0 z-30 bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="absolute inset-2 z-40 flex flex-col overflow-hidden rounded-panel bg-panel text-ink shadow-float outline-none"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Dialog.Title className="mr-auto text-sm font-semibold">All tags</Dialog.Title>
            <CopyButton label="Copy as text" text={() => tagsText(info.tags)} />
            <CopyButton label="Copy as JSON" text={() => info.json} />
            <Dialog.Close aria-label="Close" className="rounded-control p-1.5 text-ink-soft hover:bg-sunken hover:text-ink">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="border-b border-line px-4 py-2.5">
            <label className="flex h-9 items-center gap-2 rounded-control bg-sunken px-3 focus-within:outline-2 focus-within:outline-focus">
              <Search aria-hidden="true" className="size-4 text-ink-soft" strokeWidth={1.75} />
              <input
                type="search"
                aria-label="Search tags"
                placeholder="Search tags and values"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {groups.length === 0 && <p className="py-6 text-center text-[13px] text-ink-soft">No tags match.</p>}
            {groups.map(([family, tags]) => (
              <section key={family} aria-labelledby={`tags-${family}`} className="pt-5">
                <h3 id={`tags-${family}`} className="text-[13px] font-semibold text-ink-soft">
                  {GROUP_NAMES[family] ?? family}
                </h3>
                <table className="mt-1.5 w-full border-collapse text-left">
                  <tbody>
                    {tags.map((tag, i) => (
                      <tr key={i} className="border-b border-line last:border-0 align-top">
                        <th scope="row" className="w-2/5 py-1.5 pr-3 text-[13px] font-medium" title={`${tag.group}:${tag.name}`}>
                          {tag.label}
                        </th>
                        <td className="py-1.5 font-mono text-xs break-all whitespace-pre-wrap">{tag.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
