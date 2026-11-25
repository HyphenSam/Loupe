/** SwarmUI (SPEC.md 6.3, and its docs' "Image Metadata Format"): JSON whose `sui_image_params` holds every
 * parameter by its id, in the PNG `parameters` text chunk or a JPEG's EXIF UserComment. `sui_models` gives
 * the models' hashes, `sui_extra_data` the generation time. */
import { chunk, finding, json, rows, size, text, type Parser } from './finding'

const FIELDS = ['prompt', 'negativeprompt', 'model', 'seed', 'steps', 'cfgscale', 'width', 'height', 'sampler']
const LABELS: Record<string, string> = { scheduler: 'Scheduler', aspectratio: 'Aspect ratio' }

/** A list, or SwarmUI's comma-separated string of one. */
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === 'string' && value ? value.split(',') : []

function read(raw: string | undefined, where: string) {
  const data = json(raw)
  const p = data?.sui_image_params as Record<string, unknown> | undefined
  if (!p || typeof p !== 'object') return null
  const models = Array.isArray(data!.sui_models) ? (data!.sui_models as { param?: string; hash?: string }[]) : []
  const weights = list(p.loraweights)
  const known = new Set([...FIELDS, 'loras', 'loraweights', 'swarm_version'])
  // Named settings first, then the rest by their ids, as SwarmUI names them.
  const others = Object.entries(p).filter(([key]) => !known.has(key))
  const rank = (key: string) => (key in LABELS ? Object.keys(LABELS).indexOf(key) : 99)
  others.sort(([a], [b]) => rank(a) - rank(b))
  const extra = (data!.sui_extra_data ?? {}) as Record<string, unknown>
  return finding('SwarmUI', where, {
    prompt: text(p.prompt),
    negative: text(p.negativeprompt),
    model: text(p.model),
    modelHash: text(models.find((m) => m.param === 'model')?.hash),
    seed: text(p.seed),
    sampler: text(p.sampler),
    steps: text(p.steps),
    cfg: text(p.cfgscale),
    size: size(p.width, p.height),
    loras: list(p.loras).map((name, i) => ({ name: name.trim(), weight: weights[i]?.trim() ?? null })),
    rest: rows([
      ...others.map(
        ([key, value]) => [LABELS[key] ?? key, typeof value === 'boolean' ? String(value) : value] as [string, unknown],
      ),
      ['Version', p.swarm_version],
      ['Generation time', extra.generation_time],
    ]),
  })
}

export const swarmui: Parser = (t) =>
  read(t['png:parameters'], chunk('parameters')) ?? read(t['exif:usercomment'], 'EXIF UserComment')
