import type { Source } from '@/hooks/useSource'
import { findings, infoSections, summaryText } from '@/lib/summary'
import type { ToolId } from '@/lib/tools'
import { AllTagsSheet } from './AllTagsSheet'
import { Finding } from './Finding'
import { HistogramChart } from './HistogramChart'
import { CopyButton } from './ui/CopyButton'

/** Info (SPEC.md 6.1): the summary findings, the Picture, Kinds, Camera and Dates sections, the histogram,
 * All tags and Copy summary. Read-only. */
export function InfoView({
  source,
  sheetContainer,
  onTool,
}: {
  source: Source
  sheetContainer: HTMLElement | null
  onTool: (tool: ToolId) => void
}) {
  const { info, pixels } = source
  if (!info) return <p className="text-[13px] text-ink-soft">Reading metadata…</p>
  const offset = new Date(info.lastModified).getTimezoneOffset()
  return (
    <div className="flex flex-col gap-7">
      <ul aria-label="Summary" className="flex flex-col gap-2">
        {findings(info, offset).map((f) => (
          <Finding key={f.id} finding={f} onOpen={f.tool ? () => onTool(f.tool!) : undefined} />
        ))}
      </ul>

      {infoSections(info, offset).map((section) => (
        <section key={section.title} aria-labelledby={`info-${section.title}`} className="flex flex-col gap-2.5">
          <h3 id={`info-${section.title}`} className="text-[13px] font-medium text-ink-soft">
            {section.title}
          </h3>
          <dl className="flex flex-col gap-2">
            {section.rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
                <dt className="text-[13px] text-ink-soft">{row.label}</dt>
                <dd className="text-[13px] break-words">
                  {row.value}
                  {row.note && <span className="mt-0.5 block text-xs text-ink-soft">{row.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
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
        <CopyButton variant="secondary" size="md" label="Copy summary" text={() => summaryText(info, offset)} />
      </div>
    </div>
  )
}
