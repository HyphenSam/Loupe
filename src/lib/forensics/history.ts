/** The edit trail (SPEC.md 6.5): the software that wrote the file, Photoshop's XMP history, Lightroom and
 * Camera Raw settings in plain words, the count of ancestor documents, and dates that disagree. Pure: ExifTool's
 * entries (and, for the history, its `-struct` reading of `XMP-xmpMM:History`) in, plain data out.
 *
 * The history needs `-struct`: flattened, its lists don't line up, because steps leave out what they don't use
 * (a "converted" step has no time or software). */
import type { Dates, LocalTime } from '../info'
import type { Finding } from '../summary'
import { parseDate, type Entry } from '../tags'
import { dateWords, laterWords, MONTHS } from '../words'

export type HistoryStep = {
  action: string // 'Saved'
  when: LocalTime | null
  software: string | null
  detail: string | null // 'From PSD to JPEG', 'Metadata only'
}

export type EditTrail = {
  /** The software that wrote the file: Software, else the XMP creator tool. */
  software: string | null
  history: HistoryStep[]
  /** Lightroom or Camera Raw settings away from their defaults: 'Exposure +0.70', 'Crop'. */
  settings: string[]
  /** Which Camera Raw wrote them: 'Camera Raw 16.0'. */
  settingsBy: string | null
  /** How many documents this one was made from (Photoshop's DocumentAncestors). */
  ancestors: number
  /** Copies of a date that disagree, and modified long after taken. */
  mismatches: string[]
}

const text = (e: Entry | undefined) => (e && typeof e.val !== 'object' ? String(e.val).trim() || null : null)
const numberOf = (e: Entry) => Number(e.num ?? e.val)

const signed = (n: number, decimals = 0) => `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(decimals)}`

/** Camera Raw's sliders, in Lightroom's order, with their defaults: `[name, label, defaults, decimals]`.
 * Sharpening and colour noise reduction default to 40 and 25 for raw files and to 0 otherwise. */
const SLIDERS: [string, string, number[], number?][] = [
  ['Exposure2012', 'Exposure', [0], 2],
  ['Exposure', 'Exposure', [0], 2],
  ['Contrast2012', 'Contrast', [0]],
  ['Highlights2012', 'Highlights', [0]],
  ['Shadows2012', 'Shadows', [0]],
  ['Whites2012', 'Whites', [0]],
  ['Blacks2012', 'Blacks', [0]],
  ['Texture', 'Texture', [0]],
  ['Clarity2012', 'Clarity', [0]],
  ['Clarity', 'Clarity', [0]],
  ['Dehaze', 'Dehaze', [0]],
  ['Vibrance', 'Vibrance', [0]],
  ['Saturation', 'Saturation', [0]],
]
const DETAIL: [string, string, number[]][] = [
  ['Sharpness', 'Sharpening', [0, 40]],
  ['LuminanceSmoothing', 'Noise reduction', [0]],
  ['ColorNoiseReduction', 'Colour noise reduction', [0, 25]],
]
const EFFECTS: [string, string, number[]][] = [
  ['PostCropVignetteAmount', 'Vignette', [0]],
  ['GrainAmount', 'Grain', [0]],
]
const MIXER = /^(Hue|Saturation|Luminance)Adjustment/
const GRADING = /^(SplitToning(Shadow|Highlight)Saturation|ColorGrade(Midtone|Global|Shadow|Highlight)Sat)$/
const PERSPECTIVE = /^Perspective(Vertical|Horizontal|Rotate)$/
// ExifTool's flattened names for local adjustments and the healing brush's spots.
const MASKS = /^(GradientBasedCorr|CircGradBasedCorr|PaintCorrection|MaskGroupBasedCorr|DepthBasedCorr)/
const HEALING = /^RetouchArea/

function settingsOf(crs: Entry[]): string[] {
  const byName = new Map(crs.map((e) => [e.name, e]))
  const away = (name: string, defaults: number[]) => {
    const e = byName.get(name)
    const n = e ? numberOf(e) : NaN
    return Number.isFinite(n) && !defaults.includes(n) ? n : null
  }
  const on = (name: string) => /^(true|1)$/i.test(text(byName.get(name)) ?? '')
  const any = (pattern: RegExp) =>
    crs.some((e) => pattern.test(e.name) && Number.isFinite(numberOf(e)) && numberOf(e) !== 0)
  const has = (pattern: RegExp) => crs.some((e) => pattern.test(e.name))

  const out: string[] = []
  const balance = text(byName.get('WhiteBalance'))
  if (balance && balance !== 'As Shot') out.push(`White balance ${balance.toLowerCase()}`)
  for (const [name, label, defaults, decimals] of SLIDERS) {
    const n = away(name, defaults)
    if (n !== null) out.push(`${label} ${signed(n, decimals)}`)
  }
  if (text(byName.get('ToneCurveName2012')) === 'Custom') out.push('Tone curve')
  if (any(MIXER)) out.push('Colour mixer')
  if (any(GRADING)) out.push('Colour grading')
  if (on('ConvertToGrayscale')) out.push('Black and white')
  for (const [name, label, defaults] of DETAIL) {
    const n = away(name, defaults)
    if (n !== null) out.push(`${label} ${n}`)
  }
  if (on('LensProfileEnable')) out.push('Lens corrections')
  if (on('AutoLateralCA')) out.push('Chromatic aberration removed')
  if (any(PERSPECTIVE)) out.push('Perspective')
  if (on('HasCrop')) out.push('Crop')
  const angle = away('CropAngle', [0])
  if (angle !== null) out.push(`Straightened ${Math.abs(angle).toFixed(1)}°`)
  if (has(HEALING)) out.push('Healing')
  if (has(MASKS)) out.push('Masks')
  for (const [name, label, defaults] of EFFECTS) {
    const n = away(name, defaults)
    if (n !== null) out.push(`${label} ${signed(n)}`)
  }
  return out
}

const withoutSeconds = (time: LocalTime) => ({ local: time.local.slice(0, 16), offset: null })

/** EXIF's date against XMP's copies of it: the first copy that differs to the minute. */
function mismatchesOf(entries: Entry[]): string[] {
  const date = (family: string, group: string, name: string) =>
    parseDate(text(entries.find((e) => e.family === family && e.group === group && e.name === name)))
  const pairs: [string, LocalTime | null, (LocalTime | null)[]][] = [
    [
      'date taken',
      date('EXIF', 'ExifIFD', 'DateTimeOriginal'),
      [date('XMP', 'XMP-exif', 'DateTimeOriginal'), date('XMP', 'XMP-photoshop', 'DateCreated')],
    ],
    ['date modified', date('EXIF', 'IFD0', 'ModifyDate'), [date('XMP', 'XMP-xmp', 'ModifyDate')]],
  ]
  const out: string[] = []
  for (const [label, exif, copies] of pairs) {
    const other = copies.find((c) => exif && c && c.local.slice(0, 16) !== exif.local.slice(0, 16))
    if (exif && other)
      out.push(
        `The ${label} differs: ${dateWords(withoutSeconds(exif))} in EXIF, ${dateWords(withoutSeconds(other))} in XMP.`,
      )
  }
  return out
}

/** Everything but the history, which the worker reads apart (`historySteps`). */
export function editTrail(entries: Entry[], dates: Dates): EditTrail {
  const named = (name: string, ...groups: string[]) =>
    text(entries.find((e) => e.name === name && (!groups.length || groups.includes(e.group))))
  const crs = entries.filter((e) => e.group === 'XMP-crs')
  const ancestors = entries.find((e) => e.name === 'DocumentAncestors')?.val
  // ExifTool reads Adobe's '16.0' as the number 16.
  const raw = entries.find((e) => e.group === 'XMP-crs' && e.name === 'Version')?.val
  const version = typeof raw === 'number' && Number.isInteger(raw) ? raw.toFixed(1) : named('Version', 'XMP-crs')
  const later = laterWords(dates.taken, dates.modified)
  return {
    software: named('Software') ?? named('CreatorTool'),
    history: [],
    settings: settingsOf(crs),
    settingsBy: version ? `Camera Raw ${version}` : null,
    ancestors: ancestors === undefined ? 0 : Array.isArray(ancestors) ? ancestors.length : 1,
    mismatches: [...mismatchesOf(entries), ...(later ? [later] : [])],
  }
}

/** 'from application/vnd.adobe.photoshop to image/jpeg' → 'From PSD to JPEG'. */
function parametersWords(parameters: string): string {
  const words = parameters
    .replace(/application\/vnd\.adobe\.photoshop/g, 'PSD')
    .replace(/image\/x-[\w-]+?-(\w+)\b/g, (_, raw: string) => raw.toUpperCase())
    .replace(/image\/(\w+)/g, (_, type: string) => (type === 'jpeg' ? 'JPEG' : type.toUpperCase()))
  return words[0].toUpperCase() + words.slice(1)
}

/** ExifTool's `-struct` reading of XMP-xmpMM:History as steps. */
export function historySteps(value: unknown): HistoryStep[] {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []
  return list
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => {
      const field = (key: string) => (typeof s[key] === 'string' && s[key].trim() ? s[key].trim() : null)
      const action = (field('Action') ?? 'changed').replace(/_/g, ' ')
      const parameters = field('Parameters')
      return {
        action: action[0].toUpperCase() + action.slice(1),
        when: parseDate(field('When')),
        software: field('SoftwareAgent'),
        detail: parameters ? parametersWords(parameters) : field('Changed') === '/metadata' ? 'Metadata only' : null,
      }
    })
}

/** Software that edits pictures, as it names itself in Software, CreatorTool and the history. Cameras and
 * phones write their firmware there ('Ver.1.00', '17.4'), which isn't editing. Grows from real samples. */
const EDITORS =
  /photoshop|lightroom|camera raw|gimp|affinity|capture one|snapseed|pixelmator|paint\.net|darktable|rawtherapee|dxo|luminar|acdsee|picasa|photopea|krita|paintshop|paint shop|corel|on1 photo|canva|fotor|photoscape|polarr|vsco|picsart/i

/** 'Adobe Photoshop 25.0 (Windows)' → 'Adobe Photoshop 25.0'. */
const withoutPlatform = (software: string) =>
  software.replace(/\s*\((Windows|Macintosh|Mac OS X?|Mac|Win(dows)?\s?\d*|iOS|Android|64-bit)\)$/i, '')

/** The editing software the trail names and when it last worked on the file, or null. The file's own software
 * counts whatever it's called when the trail shows it edited something (history or develop settings). */
export function editedIn(trail: EditTrail, dates: Dates): { software: string; when: LocalTime | null } | null {
  const candidates = [trail.software, ...trail.history.map((s) => s.software).reverse()].filter((s): s is string => !!s)
  const editor =
    candidates.find((s) => EDITORS.test(s)) ?? (trail.history.length || trail.settings.length ? candidates[0] : null)
  if (!editor) return null
  const last = trail.history.findLast((s) => s.when)?.when ?? dates.modified
  return { software: withoutPlatform(editor), when: last }
}

/** '3 April 2025'. */
const dayWords = ({ local }: LocalTime) => {
  const [y, m, d] = local.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** The edit trail's finding, for Forensics and Info's summary. */
export function editFinding(trail: EditTrail, dates: Dates): Finding {
  const edited = editedIn(trail, dates)
  if (!edited)
    return {
      id: 'edits',
      verdict: 'No editing software recorded.',
      detail: 'That doesn’t mean it wasn’t edited.',
      rests: 'nothing',
      tool: null,
    }
  return {
    id: 'edits',
    verdict: `Edited in ${edited.software}${edited.when ? ` on ${dayWords(edited.when)}` : ''}`,
    detail: null,
    rests: 'stated',
    tool: 'forensics',
  }
}
