/** Plain words for what the metadata records (SPEC.md 6.1): sizes, orientation, colour, HDR, animation,
 * exposure and dates, in one place so Info and Copy summary say the same thing. */
import type { Animation, Camera, Colour, ColourSpace, LocalTime, Orientation } from './info'

const RATIOS: [number, number][] = [
  [1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9], [3, 1], [65, 24],
] // prettier-ignore

/** The aspect ratio as a common ratio when one is within 1%, else as a decimal against 1. */
export function aspect(width: number, height: number): string {
  const wide = width >= height
  const r = wide ? width / height : height / width
  const near = RATIOS.find(([a, b]) => Math.abs(a / b - r) / r < 0.01)
  if (near) return wide ? `${near[0]}:${near[1]}` : `${near[1]}:${near[0]}`
  const decimal = String(Math.round(r * 100) / 100)
  return wide ? `${decimal}:1` : `1:${decimal}`
}

/** Megapixels to three significant figures (three decimals under one), without trailing zeros. */
function megapixels(width: number, height: number): string {
  const mp = (width * height) / 1e6
  return String(Number(mp >= 1 ? mp.toPrecision(3) : mp.toFixed(3)))
}

/** '4032 × 3024, 12.2 MP, 4:3'. */
export function dimensionsWords(width: number, height: number): string {
  return `${width} × ${height}, ${megapixels(width, height)} MP, ${aspect(width, height)}`
}

const ORIENTATIONS: Record<Orientation, string | null> = {
  1: null,
  2: 'mirrored',
  3: 'turned 180°',
  4: 'mirrored top to bottom',
  5: 'mirrored and turned 90° clockwise',
  6: 'turned 90° clockwise',
  7: 'mirrored and turned 90° anticlockwise',
  8: 'turned 90° anticlockwise',
}

/** How Orientation turns the stored picture to stand upright; null when it doesn't. */
export const orientationWords = (orientation: Orientation) => ORIENTATIONS[orientation]

const SPACES: Record<ColourSpace, string> = {
  srgb: 'sRGB',
  'display-p3': 'Display P3, wide gamut',
  'adobe-rgb': 'Adobe RGB, wide gamut',
  prophoto: 'ProPhoto RGB, wide gamut',
  rec2020: 'Rec. 2020, wide gamut',
  grey: 'Greyscale',
  cmyk: 'CMYK',
  other: '',
}

/** 'Display P3, wide gamut'; a profile Loupe doesn't know by its own name. */
export function colourWords({ profile, space }: Colour): string {
  if (!space) return profile ?? 'No colour profile, so shown as sRGB'
  if (space === 'other') return profile ?? 'An unknown colour space'
  if (!profile) return `${SPACES[space]} (no profile embedded)`
  if (space === 'grey' || space === 'cmyk') return `${SPACES[space]} (${profile})`
  return SPACES[space]
}

export function hdrWords(hdr: Colour['hdr'], ultraHdr: boolean): string | null {
  if (hdr === 'gain-map') return ultraHdr ? 'Ultra HDR: has a gain map' : 'HDR: has a gain map'
  if (hdr === 'pq') return 'HDR, PQ transfer'
  if (hdr === 'hlg') return 'HDR, HLG transfer'
  return null
}

/** Seconds to one decimal, without a trailing zero. */
const seconds = (s: number) => `${Math.round(s * 10) / 10} s`

/** '24 frames, 2.4 s, loops forever'. */
export function animationWords({ frames, duration, loops }: Animation): string {
  const plays = loops === 'forever' ? 'loops forever' : loops === 1 ? 'plays once' : `plays ${loops} times`
  return [`${frames} frames`, duration > 0 ? seconds(duration) : null, plays].filter(Boolean).join(', ')
}

const mm = (n: number) => `${Math.round(n)} mm`
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n * 10) / 10)}`

/** '1/250 s · f/2.8 · ISO 400 · 35 mm (52 mm equivalent)'; null when nothing is recorded. */
export function exposureWords(
  exposure: Camera['exposure'],
  focal: number | null,
  focal35: number | null,
): string | null {
  const { time, aperture, iso, bias } = exposure
  const lens =
    focal === null
      ? null
      : focal35 !== null && Math.round(focal35) !== Math.round(focal)
        ? `${mm(focal)} (${mm(focal35)} equivalent)`
        : mm(focal)
  const parts = [
    time ? `${time} s` : null,
    aperture ? `f/${Math.round(aperture * 10) / 10}` : null,
    iso ? `ISO ${iso}` : null,
    bias ? `${signed(bias)} EV` : null,
    lens,
  ]
  const line = parts.filter(Boolean).join(' · ')
  return line || null
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] // prettier-ignore

/** 'UTC+13:00', or 'UTC' at no offset. */
export function zoneWords(offset: string): string {
  if (/^[+-]00:00$/.test(offset)) return 'UTC'
  return `UTC${offset.replace('-', '−')}`
}

/** '12 March 2025 at 14:32 (UTC+13:00)'. */
export function dateWords({ local, offset }: LocalTime): string {
  const [date, time] = local.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const words = `${d} ${MONTHS[m - 1]} ${y} at ${time.slice(0, 5)}`
  return offset ? `${words} (${zoneWords(offset)})` : words
}

/** Milliseconds since the epoch: in UTC when the offset is known, otherwise as if local time were UTC. */
export function instant({ local, offset }: LocalTime): number {
  return Date.parse(`${local}${offset ?? 'Z'}`)
}

const UNITS: [number, string][] = [
  [365.25 * 86400_000, 'year'],
  [86400_000, 'day'],
  [3600_000, 'hour'],
  [60_000, 'minute'],
]

/** 'Modified 3 days after it was taken.', when it was at least a minute later. Offsets count only when
 * both dates have one; otherwise the local times are compared. */
export function laterWords(taken: LocalTime | null, modified: LocalTime | null): string | null {
  if (!taken || !modified) return null
  const both = taken.offset && modified.offset
  const gap = both
    ? instant(modified) - instant(taken)
    : instant({ ...modified, offset: null }) - instant({ ...taken, offset: null })
  for (const [size, unit] of UNITS) {
    const n = Math.floor(gap / size)
    if (n >= 1) return `Modified ${n} ${unit}${n === 1 ? '' : 's'} after it was taken.`
  }
  return null
}

const hex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase()

/** The stage's status line for the pixel under the pointer, in the upright picture's coordinates. */
export function readoutWords(
  x: number,
  y: number,
  [r, g, b, a]: [number, number, number, number],
  alpha: boolean,
): string {
  const parts = [`x ${x}, y ${y}`, `#${hex(r)}${hex(g)}${hex(b)}`, `${r} ${g} ${b}`]
  if (alpha) parts.push(`alpha ${a}`)
  return parts.join(' · ')
}
