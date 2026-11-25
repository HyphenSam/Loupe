import { Download, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCopyAndOpen } from '@/hooks/useCopyAndOpen'
import type { ProvenanceState } from '@/hooks/useProvenance'
import { trustCaption } from '@/lib/ai/c2pa'
import type { GeneratorFinding } from '@/lib/ai/finding'
import type { Verdict } from '@/lib/ai/verdict'
import { actionRows, credentialRows, generatorCaption, generatorRows, sourceTypeRows } from '@/lib/ai/view'
import type { Capabilities } from '@/lib/capabilities'
import type { ImageInfo } from '@/lib/info'
import { stem } from '@/lib/names'
import { Finding } from './Finding'
import { KeyValueList } from './KeyValueList'
import { PromptText } from './PromptText'
import { saveBlob } from './save'
import { Button } from './ui/Button'

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

const SYNTHID = 'https://synthid.com/'
const COPIES =
  'Opens synthid.com in a new tab with the picture copied, ready to paste. Google sees the picture there; it asks you to sign in and limits checks a day.'
const SAVES =
  'Saves a PNG copy and opens synthid.com in a new tab, to upload it there. Google sees the picture there; it asks you to sign in and limits checks a day.'
const COPY_FAILED = 'Copying didn’t work here. Save a PNG copy and upload it there instead.'

/** One generator's prompts, settings and where they were found; ComfyUI's workflow to save. */
function Generator({ g, name, index }: { g: GeneratorFinding; name: string; index: number }) {
  const rows = generatorRows(g)
  const workflow = g.workflow
  return (
    <Section id={`generator-${index}`} title={g.name}>
      {g.prompt && <PromptText label="Prompt" text={g.prompt} copyLabel="Copy prompt" />}
      {g.negative && (
        <PromptText label="Negative prompt" text={g.negative} copyLabel="Copy" copyName="Copy negative prompt" />
      )}
      {rows.length > 0 && <KeyValueList rows={rows} />}
      {workflow && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Button
            size="sm"
            onClick={() =>
              saveBlob(new Blob([workflow.json], { type: 'application/json' }), `${stem(name)} workflow.json`)
            }
          >
            <Download aria-hidden="true" strokeWidth={1.75} />
            Save workflow
          </Button>
          <Caption>
            Its workflow holds {workflow.nodes} {workflow.nodes === 1 ? 'node' : 'nodes'}.
          </Caption>
        </div>
      )}
      <Caption>{generatorCaption(g)}</Caption>
    </Section>
  )
}

/** Check on SynthID: copies the picture and opens the site, with SPEC.md 6.3's fallbacks. */
function Watermark({ info, png, canCopy }: { info: ImageInfo; png: () => Promise<Blob>; canCopy: boolean }) {
  const { go, save, problem, copyFailed } = useCopyAndOpen({
    make: png,
    source: info,
    url: SYNTHID,
    name: `${stem(info.name)}.png`,
    canCopy,
  })
  return (
    <Section id="watermark" title="Check for a watermark">
      <div>
        <Button disabled={!!problem} onClick={go}>
          <ExternalLink aria-hidden="true" strokeWidth={1.75} />
          Check on SynthID
        </Button>
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

/** The AI check (SPEC.md 6.3): the verdict, the Content Credentials, the Digital Source Type, each
 * generator's settings, and Check on SynthID. Read-only. Waits for the C2PA SDK with "Reading Content
 * Credentials…". `png` makes the PNG copy, as soon as the tool opens. */
export function AiCheckView({
  info,
  provenance,
  verdict,
  png,
  capabilities,
}: {
  info: ImageInfo
  provenance: ProvenanceState & { bundledOn: string | null }
  verdict: Verdict | null
  png: () => Promise<Blob>
  capabilities: Capabilities
}) {
  // Check on SynthID stays put while the credentials are read, so its PNG is made once.
  return (
    <div className="flex flex-col gap-7">
      {verdict ? (
        <Findings info={info} provenance={provenance} verdict={verdict} />
      ) : (
        <p className="text-[13px] text-ink-soft">Reading Content Credentials…</p>
      )}
      <Watermark info={info} png={png} canCopy={capabilities.clipboardImage} />
    </div>
  )
}

function Findings({
  info,
  provenance,
  verdict,
}: {
  info: ImageInfo
  provenance: ProvenanceState & { bundledOn: string | null }
  verdict: Verdict
}) {
  const credentials = provenance.status === 'read' ? provenance.credentials : null
  const thumbnails = provenance.status === 'read' ? provenance.thumbnails : {}
  const source = sourceTypeRows(info.sourceType)
  return (
    <>
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

      {info.generators.map((g, i) => (
        <Generator key={i} g={g} name={info.name} index={i} />
      ))}
    </>
  )
}
