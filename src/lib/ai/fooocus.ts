/** Fooocus (SPEC.md 6.3): its parameters in the PNG `parameters` text chunk, beside a `fooocus_scheme` chunk
 * saying how they're written: 'fooocus' (JSON) or 'a1111' (A1111's text). In a JPEG or WebP they're in EXIF
 * UserComment, with Software naming Fooocus. */
import { fromParameters } from './a1111'
import { finding, json, rows, text, type Parser } from './finding'

/** '(768, 1280)' as '768 × 1280'. */
const resolution = (value: unknown) =>
  text(value)
    ?.match(/(\d+)\D+(\d+)/)
    ?.slice(1)
    .join(' × ') ?? null

/** "['Fooocus V2', 'Fooocus Sharp']", or a list, as 'Fooocus V2, Fooocus Sharp'. */
const styles = (value: unknown) =>
  Array.isArray(value)
    ? value.join(', ')
    : text(value)
        ?.replace(/^\[|\]$/g, '')
        .replace(/'/g, '') || null

function fromJson(p: Record<string, unknown>, where: string) {
  const loras = Array.isArray(p.loras) ? (p.loras as unknown[][]) : []
  return finding('Fooocus', where, {
    prompt: text(p.prompt),
    negative: text(p.negative_prompt),
    model: text(p.base_model),
    modelHash: text(p.base_model_hash),
    seed: text(p.seed),
    sampler: text(p.sampler),
    steps: text(p.steps),
    cfg: text(p.guidance_scale),
    size: resolution(p.resolution),
    loras: loras.flatMap((l) => (Array.isArray(l) && text(l[0]) ? [{ name: text(l[0])!, weight: text(l[1]) }] : [])),
    rest: rows([
      ['Styles', styles(p.styles)],
      ['Performance', p.performance],
      ['Scheduler', p.scheduler],
      ['Sharpness', p.sharpness],
      ['Refiner', p.refiner_model === 'None' ? null : p.refiner_model],
      ['Version', p.version],
    ]),
  })
}

function read(raw: string | undefined, where: string) {
  if (!raw) return null
  const p = json(raw)
  return p ? fromJson(p, where) : fromParameters(raw, where, 'Fooocus')
}

export const fooocus: Parser = (t) => {
  if (t['png:fooocus_scheme']) return read(t['png:parameters'], 'the PNG text chunks “parameters” and “fooocus_scheme”')
  if (/^Fooocus/i.test(t['exif:software'] ?? '')) return read(t['exif:usercomment'], 'EXIF UserComment and Software')
  return null
}
