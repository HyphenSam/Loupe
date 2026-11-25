/** Edit metadata's planner (SPEC.md 6.7): the common fields as the file holds them, which the user changed,
 * and ExifTool's arguments that write only those, through the MWG composite tags so EXIF, IPTC and XMP agree.
 *
 * What ExifTool does with them (checked in Node, `src/media/edit-metadata.test.ts`): MWG writes EXIF and XMP,
 * and IPTC only when the file already has IPTC. GIF and Canon's CRW have no EXIF, so they get XMP alone, and
 * a CRW's own date is in its CanonRaw block, which is written too. IPTC is marked UTF-8 when written, or
 * ExifTool leaves non-ASCII text empty. */
import type { LatLon } from '../geo'
import type { ImageInfo, Tag } from '../info'
import { outputName } from '../names'
import { privacyFindings } from '../privacy'
import { extensionOf, typeOf, unwritable } from './metadata'
import type { Planned } from './plan'

export type FieldId = 'date' | 'title' | 'caption' | 'creator' | 'copyright' | 'keywords' | 'location'

/** The form as the user sees it. `date` is a `datetime-local` value ('2025-03-12T14:32:05', seconds optional),
 * '' for not set, or anything else when the browser says the input is incomplete. `offset` is '+13:00', or ''
 * when the time zone isn't known. `keywords` is comma-separated. `lat` and `lon` are typed text, used when
 * `location` is 'set'. */
export type MetadataFields = {
  date: string
  offset: string
  title: string
  caption: string
  creator: string
  copyright: string
  keywords: string
  location: 'keep' | 'remove' | 'set'
  lat: string
  lon: string
}

export const FIELD_LABELS: Record<FieldId, string> = {
  date: 'Date taken',
  title: 'Title',
  caption: 'Caption',
  creator: 'Creator',
  copyright: 'Copyright',
  keywords: 'Keywords',
  location: 'Location',
}

/** UTC offsets in use somewhere, from −12:00 to +14:00. */
export const OFFSETS = (
  '-12:00 -11:00 -10:00 -09:30 -09:00 -08:00 -07:00 -06:00 -05:00 -04:00 -03:30 -03:00 -02:00 -01:00 ' +
  '+00:00 +01:00 +02:00 +03:00 +03:30 +04:00 +04:30 +05:00 +05:30 +05:45 +06:00 +06:30 +07:00 +08:00 ' +
  '+08:45 +09:00 +09:30 +10:00 +10:30 +11:00 +12:00 +12:45 +13:00 +14:00'
).split(' ')

const CAPTION = 'Only the metadata changes; the picture’s bytes are copied as they are.'

/** Where each text field is read from, in the order MWG reads them: EXIF, then IPTC, then XMP. */
const SOURCES: Record<'title' | 'caption' | 'creator' | 'copyright' | 'keywords', [string, string][]> = {
  title: [
    ['IPTC', 'ObjectName'],
    ['XMP-dc', 'Title'],
  ],
  caption: [
    ['IFD0', 'ImageDescription'],
    ['IPTC', 'Caption-Abstract'],
    ['XMP-dc', 'Description'],
  ],
  creator: [
    ['IFD0', 'Artist'],
    ['IPTC', 'By-line'],
    ['XMP-dc', 'Creator'],
  ],
  copyright: [
    ['IFD0', 'Copyright'],
    ['IPTC', 'CopyrightNotice'],
    ['XMP-dc', 'Rights'],
  ],
  keywords: [
    ['IPTC', 'Keywords'],
    ['XMP-dc', 'Subject'],
  ],
}

const text = (info: ImageInfo, sources: [string, string][]) =>
  sources
    .map(([group, name]) => info.tags.find((t) => t.group === group && t.name === name)?.value.trim())
    .find(Boolean) ?? ''

const coordinate = (n: number) => n.toFixed(6)

/** The fields as the file holds them; Location starts on Keep. */
export function fieldsOf(info: ImageInfo): MetadataFields {
  const taken = info.dates.taken
  return {
    date: taken?.local ?? '',
    offset: taken?.offset ?? '',
    title: text(info, SOURCES.title),
    caption: text(info, SOURCES.caption),
    creator: text(info, SOURCES.creator),
    copyright: text(info, SOURCES.copyright),
    keywords: text(info, SOURCES.keywords),
    location: 'keep',
    lat: info.gps ? coordinate(info.gps.lat) : '',
    lon: info.gps ? coordinate(info.gps.lon) : '',
  }
}

/** A `datetime-local` value with its seconds, or null when it isn't a real date and time. */
function wholeDate(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s = '00'] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  if (date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d || +h > 23 || +mi > 59 || +s > 59) return null
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`
}

const keywordList = (keywords: string) =>
  keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

/** A typed coordinate as a number, accepting the minus sign as well as the hyphen. */
const parseCoordinate = (value: string) => {
  const trimmed = value.trim().replace('−', '-')
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN
}

/** Where the map's pin goes: the typed coordinates while Location is Set and they're on the globe. */
export function pinOf(fields: MetadataFields): LatLon | null {
  if (fields.location !== 'set') return null
  const lat = parseCoordinate(fields.lat)
  const lon = parseCoordinate(fields.lon)
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

/** The location findings Privacy would remove: the position and the place names. */
const locationArgs = (info: ImageInfo) => [
  ...new Set(
    privacyFindings(info, null)
      .filter((f) => f.group === 'location')
      .flatMap((f) => f.args),
  ),
]

const TEXT_FIELDS = ['title', 'caption', 'creator', 'copyright'] as const

/** Which fields differ from the file's, in the form's order. */
export function changedFields(info: ImageInfo, fields: MetadataFields): FieldId[] {
  const was = fieldsOf(info)
  const changed: FieldId[] = []
  const date = wholeDate(fields.date) ?? fields.date
  if (date !== was.date || (date && fields.offset !== was.offset)) changed.push('date')
  for (const id of TEXT_FIELDS) if (fields[id].trim() !== was[id]) changed.push(id)
  if (keywordList(fields.keywords).join(',') !== keywordList(was.keywords).join(',')) changed.push('keywords')
  if (fields.location === 'set' || (fields.location === 'remove' && locationArgs(info).length)) changed.push('location')
  return changed
}

/** Whether the file can take EXIF: GIF can't, nor can Canon's CRW, whose blocks are its own. */
const takesExif = (info: ImageInfo) => info.format !== 'gif' && extensionOf(info) !== 'crw'
const hasIptc = (info: ImageInfo) => info.tags.some((t) => t.family === 'IPTC')

const listed = (names: (string | false)[]) => {
  const kept = names.filter(Boolean) as string[]
  return kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : kept[0]
}

/** Each field's caption: where it's written in this file. */
export function destinations(info: ImageInfo): Record<FieldId, string> {
  const exif = takesExif(info) && 'EXIF'
  const iptc = hasIptc(info) && 'IPTC'
  const everywhere = `Written to ${listed([exif, iptc, 'XMP'])}.`
  const notExif = `Written to ${listed([iptc, 'XMP'])}.`
  return {
    date: everywhere,
    title: notExif,
    caption: everywhere,
    creator: everywhere,
    copyright: everywhere,
    keywords: notExif,
    location: `Written to ${exif || 'XMP'}.`,
  }
}

/** A raw file's own date tags (CanonRaw's, SigmaRaw's), which Loupe reads before XMP's. */
const ownDates = (info: ImageInfo): Tag[] =>
  info.tags.filter((t) => t.name === 'DateTimeOriginal' && !['EXIF', 'XMP', 'IPTC'].includes(t.family))

function args(info: ImageInfo, fields: MetadataFields, changed: FieldId[]): string[] {
  const out = ['-use', 'MWG']
  if (hasIptc(info) && changed.some((id) => id !== 'location')) out.push('-IPTC:CodedCharacterSet=UTF8')
  for (const id of changed) {
    if (id === 'date') {
      const date = wholeDate(fields.date)
      const exif = date ? date.replace(/^(\d{4})-(\d\d)-(\d\d)T/, '$1:$2:$3 ') : ''
      out.push(`-MWG:DateTimeOriginal=${exif}${exif ? fields.offset : ''}`)
      for (const t of ownDates(info)) out.push(`-${t.group}:DateTimeOriginal=${exif}`)
    } else if (id === 'title') {
      const value = fields.title.trim()
      out.push(`-XMP-dc:Title=${value}`)
      if (hasIptc(info)) out.push(`-IPTC:ObjectName=${value}`)
    } else if (id === 'caption') out.push(`-MWG:Description=${fields.caption.trim()}`)
    else if (id === 'creator') out.push(`-MWG:Creator=${fields.creator.trim()}`)
    else if (id === 'copyright') out.push(`-MWG:Copyright=${fields.copyright.trim()}`)
    else if (id === 'keywords') {
      const list = keywordList(fields.keywords)
      out.push(...(list.length ? list.map((k) => `-MWG:Keywords=${k}`) : ['-MWG:Keywords=']))
    } else {
      out.push(...locationArgs(info))
      if (fields.location === 'set')
        out.push(`-GPSPosition=${parseCoordinate(fields.lat)}, ${parseCoordinate(fields.lon)}`)
    }
  }
  return out
}

function problemsOf(fields: MetadataFields): string[] {
  const problems: string[] = []
  if (fields.date && !wholeDate(fields.date)) problems.push('Date taken isn’t a whole date and time.')
  if (fields.location === 'set') {
    if (!fields.lat.trim() && !fields.lon.trim())
      return [...problems, 'Place the pin on the map, or type a latitude and longitude.']
    const lat = parseCoordinate(fields.lat)
    const lon = parseCoordinate(fields.lon)
    if (!(Math.abs(lat) <= 90)) problems.push('Latitude must be a number from −90 to 90.')
    if (!(Math.abs(lon) <= 180)) problems.push('Longitude must be a number from −180 to 180.')
  }
  return problems
}

export function planEditMetadata(info: ImageInfo, fields: MetadataFields): Planned {
  const cannot = unwritable(info)
  if (cannot) return { plan: null, problems: [cannot], caption: null }
  const problems = problemsOf(fields)
  if (problems.length) return { plan: null, problems, caption: CAPTION }
  const changed = changedFields(info, fields)
  if (!changed.length) return { plan: null, problems: ['Change a field to save.'], caption: CAPTION }
  const extension = extensionOf(info)
  return {
    plan: {
      kind: 'metadata',
      name: outputName(info.name, ' (edited)', extension),
      type: typeOf(extension),
      exifName: `image.${extension}`,
      args: args(info, fields, changed),
      readBack: true,
    },
    problems: [],
    caption: CAPTION,
  }
}

/** Within a hundredth of a second of arc, as EXIF stores it. */
const near = (a: number, b: number) => Math.abs(a - b) < 1e-5

/** What the result doesn't hold of what was asked, read from its own tags: nothing when every change took. */
export function notWritten(before: ImageInfo, asked: MetadataFields, after: ImageInfo): string[] {
  const got = fieldsOf(after)
  const cannot = (id: FieldId) => `${FIELD_LABELS[id]}: ExifTool couldn’t write it to this ${before.formatName} file.`
  const notes: string[] = []
  for (const id of changedFields(before, asked)) {
    if (id === 'date') {
      const date = wholeDate(asked.date) ?? ''
      if (got.date !== date) notes.push(cannot(id))
      else if (date && got.offset !== asked.offset)
        notes.push(`Date taken: the time zone couldn’t be written to this ${before.formatName} file.`)
    } else if (id === 'keywords') {
      if (keywordList(got.keywords).join(',') !== keywordList(asked.keywords).join(',')) notes.push(cannot(id))
    } else if (id === 'location') {
      const gps = after.gps
      const set = asked.location === 'set'
      const right = set
        ? !!gps && near(gps.lat, parseCoordinate(asked.lat)) && near(gps.lon, parseCoordinate(asked.lon))
        : !gps && !locationArgs(after).length
      if (!right) notes.push(cannot(id))
    } else if (got[id] !== asked[id].trim()) notes.push(cannot(id))
  }
  return notes
}
