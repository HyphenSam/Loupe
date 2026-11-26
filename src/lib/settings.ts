/** Settings the page remembers between visits (`localStorage`), parsed defensively: anything missing or
 * unknown takes its default. */

export type Background = 'dark' | 'light' | 'checker'

/** Compare's modes (Bytesize's): the result over the original split by a slider, flipped in place, or beside it. */
export type CompareMode = 'slider' | 'toggle' | 'side'
const COMPARE_MODES: CompareMode[] = ['slider', 'toggle', 'side']

export type StageSettings = {
  background: Background
  magnifier: boolean
  /** The magnifier's zoom: image pixels to CSS pixels, 2× to 32×. */
  magnification: number
  compare: CompareMode
}

export const DEFAULT_STAGE: StageSettings = {
  background: 'dark',
  magnifier: false,
  magnification: 8,
  compare: 'slider',
}
export const STAGE_KEY = 'loupe.stage'

const MAGNIFICATIONS = [2, 4, 8, 16, 32]

export function parseStageSettings(saved: string | null): StageSettings {
  let value: Partial<Record<keyof StageSettings, unknown>> = {}
  try {
    value = JSON.parse(saved ?? '{}') ?? {}
  } catch {
    // Unreadable: the defaults.
  }
  return {
    background: ['dark', 'light', 'checker'].includes(value.background as string)
      ? (value.background as Background)
      : DEFAULT_STAGE.background,
    magnifier: typeof value.magnifier === 'boolean' ? value.magnifier : DEFAULT_STAGE.magnifier,
    magnification: MAGNIFICATIONS.includes(value.magnification as number)
      ? (value.magnification as number)
      : DEFAULT_STAGE.magnification,
    compare: COMPARE_MODES.includes(value.compare as CompareMode)
      ? (value.compare as CompareMode)
      : DEFAULT_STAGE.compare,
  }
}

/** The next magnification up (`step` 1) or down (−1), within 2× to 32×. */
export function magnifierZoom(current: number, step: 1 | -1): number {
  const i = MAGNIFICATIONS.indexOf(current)
  return MAGNIFICATIONS[Math.min(MAGNIFICATIONS.length - 1, Math.max(0, (i < 0 ? 2 : i) + step))]
}

/** Export's settings (SPEC.md 6.11), carried over to the next file and kept between visits. */
export type ExportFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl'
export type LossyFormat = Exclude<ExportFormat, 'png'>

export type ExportSettings = {
  /** `same`: the source's own format (GIF and BMP become PNG, HEIC becomes JPEG). */
  format: 'same' | ExportFormat
  /** Each lossy format's quality, 1–100. The scales differ: AVIF's 50 looks about like JPEG's 75. */
  quality: Record<LossyFormat, number>
  webpLossless: boolean
  jxlLossless: boolean
  /** Inside `maxWidth` × `maxHeight`, never larger. */
  resize: boolean
  maxWidth: number
  maxHeight: number
  /** Searches for the highest quality, up to the slider's, whose file fits under the target. */
  target: boolean
  targetSize: number
  targetUnit: 'kB' | 'MB'
  /** Off removes everything but the colour profile. */
  keepMetadata: boolean
}

// libjpeg's, libwebp's, libavif's and libjxl's own defaults (Bytesize's).
export const DEFAULT_EXPORT: ExportSettings = {
  format: 'same',
  quality: { jpeg: 75, webp: 75, avif: 50, jxl: 75 },
  webpLossless: false,
  jxlLossless: false,
  resize: false,
  maxWidth: 1920,
  maxHeight: 1920,
  target: false,
  targetSize: 500,
  targetUnit: 'kB',
  keepMetadata: false,
}
export const EXPORT_KEY = 'loupe.export'

/** libwebp's limit on either side, the smallest of the encoders'. */
export const MAX_SIDE = 16383

/** Saved settings, each field checked; anything invalid takes its default. */
export function parseExportSettings(saved: string | null): ExportSettings {
  let value: unknown = {}
  try {
    value = JSON.parse(saved ?? '{}')
  } catch {
    // Unreadable: the defaults.
  }
  const s = record(value)
  const q = record(s.quality)
  const d = DEFAULT_EXPORT
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const int = (v: unknown, lo: number, hi: number, fallback: number) =>
    Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : fallback
  const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T) =>
    options.includes(v as T) ? (v as T) : fallback
  return {
    format: oneOf(s.format, ['same', 'jpeg', 'png', 'webp', 'avif', 'jxl'], d.format),
    quality: {
      jpeg: int(q.jpeg, 1, 100, d.quality.jpeg),
      webp: int(q.webp, 1, 100, d.quality.webp),
      avif: int(q.avif, 1, 100, d.quality.avif),
      jxl: int(q.jxl, 1, 100, d.quality.jxl),
    },
    webpLossless: bool(s.webpLossless, d.webpLossless),
    jxlLossless: bool(s.jxlLossless, d.jxlLossless),
    resize: bool(s.resize, d.resize),
    maxWidth: int(s.maxWidth, 1, MAX_SIDE, d.maxWidth),
    maxHeight: int(s.maxHeight, 1, MAX_SIDE, d.maxHeight),
    target: bool(s.target, d.target),
    targetSize:
      typeof s.targetSize === 'number' && s.targetSize > 0 && s.targetSize <= 1_000_000 ? s.targetSize : d.targetSize,
    targetUnit: oneOf(s.targetUnit, ['kB', 'MB'], d.targetUnit),
    keepMetadata: bool(s.keepMetadata, d.keepMetadata),
  }
}

const record = (v: unknown) => (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>

/** The target in bytes: kB and MB of 1000, as file managers and browsers show sizes. */
export const targetBytes = (s: ExportSettings) => Math.round(s.targetSize * (s.targetUnit === 'MB' ? 1e6 : 1e3))
