import type { ReactNode } from 'react'
import type { ProvenanceState } from '@/hooks/useProvenance'
import { trustCaption } from '@/lib/ai/c2pa'
import type { Verdict } from '@/lib/ai/verdict'
import { actionRows, credentialRows, sourceTypeRows } from '@/lib/ai/view'
import type { ImageInfo } from '@/lib/info'
import { Finding } from './Finding'
import { KeyValueList } from './KeyValueList'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`ai-${id}`} className="flex flex-col gap-2.5">
      <h3 id={`ai-${id}`} className="text-[13px] font-medium text-ink-soft">
        {title}
      </h3>
      {children}
    </section>
  )
}

const Caption = ({ children }: { children: ReactNode }) => <p className="text-xs text-ink-soft">{children}</p>

/** The AI check (SPEC.md 6.3): the verdict, the Content Credentials and the Digital Source Type. Read-only.
 * Waits for the C2PA SDK with "Reading Content Credentials…". Generators and SynthID arrive in phase 6. */
export function AiCheckView({
  info,
  provenance,
  verdict,
}: {
  info: ImageInfo
  provenance: ProvenanceState & { bundledOn: string | null }
  verdict: Verdict | null
}) {
  if (!verdict) return <p className="text-[13px] text-ink-soft">Reading Content Credentials…</p>
  const credentials = provenance.status === 'read' ? provenance.credentials : null
  const thumbnails = provenance.status === 'read' ? provenance.thumbnails : {}
  const source = sourceTypeRows(info.sourceType)
  return (
    <div className="flex flex-col gap-7">
      <ul aria-label="Verdict">
        <Finding finding={{ id: 'ai', ...verdict, tool: null }} />
      </ul>

      <Section id="credentials" title="Content Credentials">
        {provenance.status === 'failed' ? (
          <p className="text-[13px]">{provenance.message}</p>
        ) : credentials ? (
          <>
            <KeyValueList rows={credentialRows(credentials)} />
            {provenance.bundledOn && <Caption>{trustCaption(provenance.bundledOn, credentials.list)}</Caption>}
          </>
        ) : (
          <p className="text-[13px]">None in this file.</p>
        )}
      </Section>

      {credentials && credentials.actions.length > 0 && (
        <Section id="actions" title="Actions">
          <KeyValueList rows={actionRows(credentials)} />
        </Section>
      )}

      {credentials && credentials.ingredients.length > 0 && (
        <Section id="ingredients" title="Ingredients">
          <ul className="flex flex-col gap-2">
            {credentials.ingredients.map((ingredient, i) => {
              const url = ingredient.thumbnail ? thumbnails[ingredient.thumbnail] : undefined
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex h-[30px] w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken">
                    {url && <img src={url} alt={ingredient.title} className="size-full object-contain" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium">{ingredient.title}</span>
                    <span className="text-xs text-ink-soft">
                      {ingredient.relationship}
                      {ingredient.signed && ', with Content Credentials of its own'}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {source.length > 0 && (
        <Section id="source-type" title="Digital Source Type">
          <KeyValueList rows={source} />
          <Caption>Stated in the file’s XMP metadata; anyone can add or remove it.</Caption>
        </Section>
      )}
    </div>
  )
}
