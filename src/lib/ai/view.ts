/** The AI check's rows (SPEC.md 6.3) as plain data: Content Credentials' signer, time, claim generator and
 * result, their actions, the Digital Source Type, and each generator's settings. */
import type { Row } from '../summary'
import { dateWords } from '../words'
import type { Credentials } from './c2pa'
import type { GeneratorFinding } from './finding'
import { sourceType } from './source-type'

const RESULTS = {
  trusted: 'Verified',
  untrusted: 'Valid, but its signer isn’t on the trust list',
  invalid: 'Doesn’t verify',
}

/** '2026-11-20T10:00:00+00:00' or '…:00.678Z' as the date words Info uses. */
function signedOn(time: string): string {
  const [, local, zone] = time.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:\d\d)?$/) ?? []
  if (!local) return time
  return dateWords({ local, offset: !zone || zone === 'Z' ? '+00:00' : zone })
}

export function credentialRows(c: Credentials): Row[] {
  const rows: Row[] = []
  const name = c.signer ?? c.certificate
  if (name)
    rows.push(
      c.signer && c.certificate
        ? { label: 'Signed by', value: c.signer, note: `Certificate “${c.certificate}”.` }
        : { label: 'Signed by', value: name },
    )
  if (c.time) rows.push({ label: 'Signed on', value: signedOn(c.time) })
  if (c.generator) rows.push({ label: 'Claim generator', value: c.generator })
  const problems = c.problems.join(' ')
  rows.push(
    c.state === 'invalid' && problems
      ? { label: 'Result', value: RESULTS.invalid, note: problems }
      : { label: 'Result', value: RESULTS[c.state] },
  )
  return rows
}

export function actionRows(c: Credentials): Row[] {
  return c.actions.map((a) => {
    const note = [a.source && a.description, a.software && `By ${a.software}.`].filter(Boolean).join(' ')
    return { label: a.words, value: a.source ?? a.description ?? '—', ...(note ? { note } : {}) }
  })
}

export function sourceTypeRows(value: string | null): Row[] {
  const s = sourceType(value)
  return s ? [{ label: 'Stated', value: s.words, note: value! }] : []
}

/** A generator's model, settings, LoRAs and the rest; the prompts show on their own. */
export function generatorRows(g: GeneratorFinding): Row[] {
  const rows: Row[] = []
  if (g.model)
    rows.push(
      g.modelHash
        ? { label: 'Model', value: g.model, note: `Hash ${g.modelHash}.` }
        : { label: 'Model', value: g.model },
    )
  const settings: [string, string | null][] = [
    ['Seed', g.seed],
    ['Sampler', g.sampler],
    ['Steps', g.steps],
    ['CFG scale', g.cfg],
    ['Size', g.size],
  ]
  for (const [label, value] of settings) if (value) rows.push({ label, value })
  for (const lora of g.loras)
    rows.push(
      lora.weight
        ? { label: 'LoRA', value: lora.name, note: `Weight ${lora.weight}.` }
        : { label: 'LoRA', value: lora.name },
    )
  return [...rows, ...g.rest]
}

const HIDDEN = 'the lowest bits'

/** Where the settings were found and what that's worth. */
export function generatorCaption(g: GeneratorFinding): string {
  const where = g.where.join(', and in ')
  return g.where.some((w) => w.startsWith(HIDDEN))
    ? `Found in ${where}, which removing metadata doesn’t clear. Anyone can add or remove it.`
    : `Found in ${where}. Stated in the file’s metadata; anyone can add or remove it.`
}
