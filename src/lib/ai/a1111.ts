/** AUTOMATIC1111's text, which Forge, SD.Next and many others write too (SPEC.md 6.3): the prompt, a
 * "Negative prompt:" line, and a last line of settings, `Steps: 20, Sampler: Euler, …`. In a PNG it's the
 * `parameters` text chunk; in a JPEG or WebP, EXIF UserComment. */
import { chunk, finding, type Lora, type Parser } from './finding'

export type Parameters = { prompt: string; negative: string | null; settings: [string, string][] }

// A1111's own pattern for one setting: a name, a colon, and a value up to the next comma, or a quoted value.
const SETTING = /\s*(\w[\w \-/]+):\s*("(?:\\.|[^\\"])+"|[^,]*)(?:,|$)/g

/** The text split into its parts, or null when its last line isn't a settings line. */
export function parseParameters(text: string): Parameters | null {
  const lines = text.trim().split('\n')
  const last = lines.at(-1)!
  if (lines.length < 2 || !/^Steps: /.test(last)) return null
  const settings: [string, string][] = []
  for (const [, name, value] of last.matchAll(SETTING))
    settings.push([name.trim(), value.startsWith('"') ? value.slice(1, -1).replace(/\\(.)/g, '$1') : value.trim()])
  const before = lines.slice(0, -1).join('\n')
  const at = before.search(/(^|\n)Negative prompt: /)
  if (at < 0) return { prompt: before.trim(), negative: null, settings }
  const negative = before
    .slice(at)
    .replace(/^\n?Negative prompt: /, '')
    .trim()
  return { prompt: before.slice(0, at).trim(), negative: negative || null, settings }
}

/** The `<lora:name:weight>` tags in a prompt. */
export function promptLoras(prompt: string): Lora[] {
  return [...prompt.matchAll(/<lora:([^:>]+)(?::([^:>]+))?[^>]*>/g)].map(([, name, weight]) => ({
    name,
    weight: weight ?? null,
  }))
}

/** Forge's versions start with an f ('f2.0.1v1.10.1-…') or are 'neo'; A1111's with a v. */
function frontEnd(settings: Map<string, string>): string {
  if (settings.get('App') === 'SD.Next') return 'SD.Next'
  const version = settings.get('Version') ?? ''
  if (/^f\d/.test(version) || /^neo/i.test(version)) return 'Forge'
  return 'AUTOMATIC1111'
}

const FIELDS = ['Steps', 'Sampler', 'CFG scale', 'Seed', 'Size', 'Model', 'Model hash', 'App']

/** The finding for A1111-style text found in `where`, named `name` (or after its front end). */
export function fromParameters(text: string, where: string, name?: string) {
  const p = parseParameters(text)
  if (!p) return null
  const s = new Map(p.settings)
  return finding(name ?? frontEnd(s), where, {
    prompt: p.prompt || null,
    negative: p.negative,
    model: s.get('Model') ?? null,
    modelHash: s.get('Model hash') ?? null,
    seed: s.get('Seed') ?? null,
    sampler: s.get('Sampler') ?? null,
    steps: s.get('Steps') ?? null,
    cfg: s.get('CFG scale') ?? null,
    size: s.get('Size')?.replace('x', ' × ') ?? null,
    loras: promptLoras(p.prompt),
    rest: p.settings.filter(([label]) => !FIELDS.includes(label)).map(([label, value]) => ({ label, value })),
  })
}

export const a1111: Parser = (t) =>
  (t['png:parameters'] && fromParameters(t['png:parameters'], chunk('parameters'))) ||
  (t['exif:usercomment'] && fromParameters(t['exif:usercomment'], 'EXIF UserComment')) ||
  null
