import type { Source } from '@/hooks/useSource'
import type { Verdict } from '@/lib/ai/verdict'
import { findings, infoSections, summaryText } from '@/lib/summary'
import type { ToolId } from '@/lib/tools'
import { AllTagsSheet } from './AllTagsSheet'
import { Finding } from './Finding'
import { HistogramChart } from './HistogramChart'
import { KeyValueList } from './KeyValueList'
import { CopyButton } from './ui/CopyButton'

/** Info (SPEC.md 6.1): the summary findings, the Picture, Kinds, Camera and Dates sections, the histogram,
 * All tags and Copy summary. Read-only. `ai`: the AI check's verdict, null while the Content Credentials are
 * read. */
export function InfoView({
  source,
  ai,
  privacy,
  sheetContainer,
  onTool,
}: {
  source: Source
  ai: Verdict | null
  /** How many things Privacy found; null while the Content Credentials are read. */
  privacy: number | null
  sheetContainer: HTMLElement | null
  onTool: (tool: ToolId) => void
}) {
  const { info, pixels } = source
  if (!info) return <p className="text-[13px] text-ink-soft">Reading metadata…</p>
  const offset = new Date(info.lastModified).getTimezoneOffset()
  return (
    <div className="flex flex-col gap-7">
      <ul aria-label="Summary" className="flex flex-col gap-2">
        {findings(info, offset, ai, privacy).map((f) => (
          <Finding key={f.id} finding={f} onOpen={f.tool ? () => onTool(f.tool!) : undefined} />
        ))}
        {!ai && <li className="px-3 py-1 text-[13px] text-ink-soft">Reading Content Credentials…</li>}
      </ul>

      {infoSections(info, offset).map((section) => (
        <section key={section.title} aria-labelledby={`info-${section.title}`} className="flex flex-col gap-2.5">
          <h3 id={`info-${section.title}`} className="text-[13px] font-medium text-ink-soft">
            {section.title}
          </h3>
          <KeyValueList rows={section.rows} />
        </section>
      ))}

      {pixels && (
        <section aria-labelledby="info-histogram" className="flex flex-col gap-2.5">
          <h3 id="info-histogram" className="text-[13px] font-medium text-ink-soft">
            Histogram
          </h3>
          <HistogramChart pixels={pixels} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <AllTagsSheet info={info} container={sheetContainer} />
        <CopyButton
          variant="secondary"
          size="md"
          label="Copy summary"
          text={() => summaryText(info, offset, ai, privacy)}
        />
      </div>
    </div>
  )
}
