import { Download } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { editFinding } from '@/lib/forensics/history'
import { trailerExtension } from '@/lib/forensics/trailer'
import { compressionRows, editRows, hiddenWords, stepWords } from '@/lib/forensics/view'
import type { ImageInfo } from '@/lib/info'
import { stem } from '@/lib/names'
import { Finding } from './Finding'
import { KeyValueList } from './KeyValueList'
import { saveBlob } from './save'
import { Button } from './ui/Button'

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

/** Forensics (SPEC.md 6.5): the edit trail, a JPEG's compression, and data hidden after the picture with "Save
 * it". Read-only. `extract` asks the worker for an embedded item's bytes. Phase 10 adds the other sections. */
export function ForensicsView({ info, extract }: { info: ImageInfo; extract: (item: string) => Promise<Blob> }) {
  const { edits, jpeg, trailer } = info
  const rows = editRows(edits)
  const [failed, setFailed] = useState<string | null>(null)

  const save = async () => {
    if (!trailer) return
    setFailed(null)
    try {
      saveBlob(await extract('trailer'), `${stem(info.name)} hidden.${trailerExtension(trailer.looksLike)}`)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    }
  }

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
        {failed && (
          <p role="alert" className="text-xs text-danger">
            {failed}
          </p>
        )}
        {info.unknownChunks.length > 0 && (
          <Caption>PNG chunks Loupe doesn’t know: {info.unknownChunks.join(', ')}.</Caption>
        )}
      </Section>
    </div>
  )
}
