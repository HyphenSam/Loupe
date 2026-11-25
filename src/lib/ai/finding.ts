/** What a generator's parser finds (SPEC.md 6.3), and the small helpers the parsers share. Each parser takes
 * the file's text fields and returns a finding, or null when its marker isn't there. */
import type { Row } from '../summary'

export type Lora = { name: string; weight: string | null }

export type GeneratorFinding = {
  name: string
  /** Where it was found, in words: 'the PNG text chunk “parameters”', 'EXIF UserComment'. */
  where: string[]
  prompt: string | null
  negative: string | null
  model: string | null
  modelHash: string | null
  seed: string | null
  sampler: string | null
  steps: string | null
  cfg: string | null
  size: string | null
  loras: Lora[]
  /** Everything else, labelled as the generator labels it. */
  rest: Row[]
  /** ComfyUI's graph, for Save workflow: the JSON as stored and how many nodes it holds. */
  workflow: { json: string; nodes: number } | null
}

/** The file's text fields by `family:name` in lower case, as ExifTool names them: 'png:parameters',
 * 'exif:usercomment', 'xmp:creatortool'. Stealth metadata is read into the same shape. */
export type Texts = Record<string, string>

export type Parser = (t: Texts) => GeneratorFinding | null

export const finding = (name: string, where: string, over: Partial<GeneratorFinding> = {}): GeneratorFinding => ({
  name,
  where: [where],
  prompt: null,
  negative: null,
  model: null,
  modelHash: null,
  seed: null,
  sampler: null,
  steps: null,
  cfg: null,
  size: null,
  loras: [],
  rest: [],
  workflow: null,
  ...over,
})

/** A JSON object, or null for anything else. Integers past 2^53 (ComfyUI's seeds) keep their digits. */
export function json(text: string | undefined): Record<string, unknown> | null {
  if (!text || !/^\s*\{/.test(text)) return null
  try {
    const value: unknown = JSON.parse(text, (_key, value, context?: { source?: string }) =>
      typeof value === 'number' && !Number.isSafeInteger(value) && context?.source && /^-?\d+$/.test(context.source)
        ? context.source
        : value,
    )
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A value as text, or null when it's missing, blank or not a plain value. */
export function text(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'string') return value.trim() || null
  return null
}

export function size(width: unknown, height: unknown): string | null {
  const w = text(width)
  const h = text(height)
  return w && h ? `${w} × ${h}` : null
}

/** Rows for the values that are there. */
export const rows = (pairs: [label: string, value: unknown][]): Row[] =>
  pairs.flatMap(([label, value]) => {
    const v = text(value)
    return v ? [{ label, value: v }] : []
  })

export const chunk = (name: string) => `the PNG text chunk “${name}”`
