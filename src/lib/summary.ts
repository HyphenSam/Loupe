/** What Info shows (SPEC.md 6.1), as plain data: the summary findings, then the Picture, Kinds, Camera and
 * Dates sections as rows, and the same as text for Copy summary. */
import type { Verdict } from './ai/verdict'
import { formatBytes } from './format-bytes'
import { editFinding } from './forensics/history'
import type { ImageInfo, LocalTime } from './info'
import { KIND_CHIPS, kindSentence } from './kinds'
import { placeWords, type Place } from './places'
import type { ToolId } from './tools'
import {
  animationWords,
  colourWords,
  dateWords,
  dimensionsWords,
  exposureWords,
  hdrWords,
  laterWords,
  orientationWords,
} from './words'

/** What a finding rests on (DESIGN.md's Finding): signed and verified, signed by someone Loupe doesn't
 * recognise, a signature that doesn't verify, stated in the file's metadata, or nothing found. */
export type Rests = 'signed' | 'unrecognised' | 'broken' | 'stated' | 'nothing' | 'pattern'

/** `restsWords`, when given, says what it rests on in place of the kind's usual words. */
export type Finding = {
  id: string
  verdict: string
  detail: string | null
  rests: Rests
  restsWords?: string
  tool: ToolId | null
}

export type Row = { label: string; value: string; note?: string }
export type Section = { title: string; rows: Row[] }

/** `offsetMinutes` is the browser's `Date.getTimezoneOffset()`, passed in so tests can pick a zone. */
export function fileDateWords(ms: number, offsetMinutes: number): string {
  const local = new Date(ms - offsetMinutes * 60_000).toISOString().slice(0, 19)
  const ahead = -offsetMinutes
  const sign = ahead < 0 ? '-' : '+'
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  return dateWords({ local, offset: `${sign}${pad(ahead / 60)}:${pad(ahead % 60)}` })
}

const degrees = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(6)}° ${value < 0 ? negative : positive}`

/** 'Arrowtown, Otago, New Zealand', or 'at sea' and 'in New Zealand, far from any town' mid-sentence. */
const placeAfterColon = (place: Place) => {
  const words = placeWords(place)
  return place.type === 'town' ? words : words[0].toLowerCase() + words.slice(1)
}

/** `ai`: the AI check's verdict, and `privacy`: how many things Privacy found, each once the Content
 * Credentials have been read. */
export function findings(
  info: ImageInfo,
  offsetMinutes: number,
  ai: Verdict | null = null,
  privacy: number | null = null,
): Finding[] {
  const { taken } = info.dates
  const list: Finding[] = [
    taken
      ? { id: 'taken', verdict: `Taken on ${dateWords(taken)}`, detail: null, rests: 'stated', tool: null }
      : {
          id: 'taken',
          verdict: 'No date taken recorded.',
          detail: `The file itself is dated ${fileDateWords(info.lastModified, offsetMinutes)}.`,
          rests: 'nothing',
          tool: null,
        },
    info.gps
      ? {
          id: 'location',
          verdict: info.place ? `Location recorded: ${placeAfterColon(info.place)}` : 'Location recorded',
          detail: `At ${degrees(info.gps.lat, 'N', 'S')}, ${degrees(info.gps.lon, 'E', 'W')}.`,
          rests: 'stated',
          tool: 'location',
        }
      : { id: 'location', verdict: 'No location recorded.', detail: null, rests: 'nothing', tool: null },
  ]
  if (ai) list.push({ id: 'ai', ...ai, tool: 'ai' })
  if (privacy !== null)
    list.push(
      privacy
        ? {
            id: 'privacy',
            verdict: `${privacy} thing${privacy === 1 ? '' : 's'} in this file could identify you.`,
            detail: null,
            rests: 'stated',
            tool: 'privacy',
          }
        : { id: 'privacy', verdict: 'Nothing identifying found.', detail: null, rests: 'nothing', tool: null },
    )
  // Only when the trail names editing software: "no editing software" alone says little.
  const edits = editFinding(info.edits, info.dates)
  if (edits.tool) list.push(edits)
  return list
}

const formatNames: Record<string, string> = {
  jpg: 'JPEG',
  jpeg: 'JPEG',
  tif: 'TIFF',
  tiff: 'TIFF',
  jxl: 'JPEG XL',
  webp: 'WebP',
}
const named = (extension: string) => formatNames[extension.toLowerCase()] ?? extension.toUpperCase()

/** 'Canon EOS R5' rather than 'Canon Canon EOS R5'. */
function cameraName(make: string | null, model: string | null): string | null {
  if (make && model)
    return model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0]) ? model : `${make} ${model}`
  return model ?? make
}

const present = (rows: (Row | null | false)[]) => rows.filter((row): row is Row => !!row)

function picture(info: ImageInfo): Row[] {
  const { extension, orientation } = info
  const turn = orientationWords(orientation)
  return present([
    extension
      ? {
          label: 'Format',
          value: info.formatName,
          note: `Its extension says ${named(extension.given)}, but it’s a${/^[AEIOU]/.test(info.formatName) ? 'n' : ''} ${info.formatName}.`,
        }
      : { label: 'Format', value: info.formatName },
    { label: 'Dimensions', value: dimensionsWords(info.width, info.height) },
    !!turn && { label: 'Upright', value: `${info.displayWidth} × ${info.displayHeight}, ${turn}` },
    info.bitDepth !== null && { label: 'Bit depth', value: `${info.bitDepth} bits per channel` },
    { label: 'Transparency', value: info.alpha ? 'Yes' : 'None' },
    { label: 'Colour profile', value: colourWords(info.colour) },
    !!info.colour.hdr && { label: 'HDR', value: hdrWords(info.colour.hdr, info.kinds.includes('ultra-hdr'))! },
    !!info.animation && { label: 'Animation', value: animationWords(info.animation) },
    { label: 'File size', value: formatBytes(info.size) },
  ])
}

function camera(info: ImageInfo): Row[] {
  const c = info.camera!
  const identifies = 'Identifies this camera.'
  const text = (label: string, value: string | null, note?: string): Row | null =>
    value ? { label, value, ...(note ? { note } : {}) } : null
  return present([
    text('Camera', cameraName(c.make, c.model)),
    text('Lens', c.lens),
    text('Exposure', exposureWords(c.exposure, c.focalLength, c.focal35)),
    text('Flash', c.flash),
    c.shutterCount !== null && {
      label: 'Shutter count',
      value: c.shutterCount.toLocaleString('en-GB'),
      note: 'From the camera’s maker notes.',
    },
    text('Body serial number', c.bodySerial, identifies),
    text('Lens serial number', c.lensSerial, 'Identifies this lens.'),
    text('Internal serial number', c.internalSerial, identifies),
    text('Owner', c.owner),
    text('Software', c.software),
  ])
}

function dates(info: ImageInfo, offsetMinutes: number): Row[] {
  const { taken, digitised, modified, gpsUtc } = info.dates
  const row = (label: string, time: LocalTime | null) => time && { label, value: dateWords(time) }
  const later = laterWords(taken, modified)
  const gps = gpsUtc ? { local: gpsUtc.slice(0, 19), offset: '+00:00' } : null
  return present([
    row('Taken', taken),
    // Digitised is the same as taken for nearly every camera; it's only news when it isn't.
    digitised?.local !== taken?.local && row('Digitised', digitised),
    modified && (later ? { label: 'Modified', value: dateWords(modified), note: later } : row('Modified', modified)),
    row('GPS time', gps),
    { label: 'File date', value: fileDateWords(info.lastModified, offsetMinutes) },
  ])
}

export function infoSections(info: ImageInfo, offsetMinutes: number): Section[] {
  const kinds = info.kinds.flatMap((kind) => {
    const sentence = kindSentence(kind, info.motion?.duration ?? null)
    return sentence ? [{ label: KIND_CHIPS[kind], value: sentence }] : []
  })
  const sections: (Section | null)[] = [
    { title: 'Picture', rows: picture(info) },
    kinds.length ? { title: 'Kinds', rows: kinds } : null,
    info.camera ? { title: 'Camera', rows: camera(info) } : null,
    { title: 'Dates', rows: dates(info, offsetMinutes) },
  ]
  return sections.filter((s): s is Section => !!s)
}

const LABELS: Record<string, string> = {
  taken: 'Taken',
  location: 'Location',
  ai: 'AI check',
  privacy: 'Privacy',
  edits: 'Edit trail',
}

/** Copy summary's text: the findings and every section as `Key: value` lines, a blank line between groups. */
export function summaryText(
  info: ImageInfo,
  offsetMinutes: number,
  ai: Verdict | null = null,
  privacy: number | null = null,
): string {
  const head = [
    `File: ${info.name}`,
    ...findings(info, offsetMinutes, ai, privacy).map(
      (f) => `${LABELS[f.id]}: ${f.detail ? `${f.verdict.replace(/\.?$/, '.')} ${f.detail}` : f.verdict}`,
    ),
  ]
  const groups = infoSections(info, offsetMinutes).map((s) =>
    s.rows.map((r) => `${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}`).join('\n'),
  )
  return [head.join('\n'), ...groups].join('\n\n')
}
