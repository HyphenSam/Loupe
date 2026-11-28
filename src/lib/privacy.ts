/** What in a file could identify the person who made it or where they were (SPEC.md 6.4), and the ExifTool
 * arguments that remove each. Findings come from the tags ExifTool read, grouped into rows a person would
 * recognise: one GPS position rather than its eight tags, one date taken rather than its copies in EXIF and
 * XMP. Each row carries the arguments that delete every tag behind it. */
import type { Credentials } from './ai/c2pa'
import { formatBytes } from './format-bytes'
import { looksWords, trailerWords } from './forensics/trailer'
import type { Format } from './formats'
import type { ImageInfo, LocalTime, Tag } from './info'
import type { Range } from './motion'
import { PHOTO_EDITOR } from './samsung'
import { dateWords } from './words'

export type PrivacyGroup =
  'location' | 'device' | 'people' | 'software' | 'dates' | 'embedded' | 'generation' | 'credentials' | 'hidden'

/** The groups in the order the tool lists them, with their headings. */
export const PRIVACY_GROUPS: { id: PrivacyGroup; title: string }[] = [
  { id: 'location', title: 'Location' },
  { id: 'device', title: 'Device' },
  { id: 'people', title: 'People' },
  { id: 'software', title: 'Software and history' },
  { id: 'dates', title: 'Dates and times' },
  { id: 'embedded', title: 'Embedded pictures' },
  { id: 'generation', title: 'Generation settings' },
  { id: 'credentials', title: 'Content Credentials' },
  { id: 'hidden', title: 'Hidden data' },
]

/** One row: `value` shortened for the list, `full` for its tooltip, `note` saying why it matters when that
 * isn't plain, and the ExifTool arguments that remove it, or what Loupe does itself: the bytes it cuts out (hidden
 * data, which ExifTool's `-Trailer:all=` would remove along with known trailers), or the boxes it blanks inside a
 * Motion Photo's video (ExifTool doesn't write inside it). */
export type PrivacyFinding = {
  id: string
  group: PrivacyGroup
  label: string
  value: string
  full: string
  note?: string
  args: string[]
  cut?: Range
  blank?: Range[]
}

/** Removing "everything": every tag, then the colour profile and the orientation copied back from the original,
 * so the picture neither turns sideways nor shifts colour (CLAUDE.md). */
export const EVERYTHING_ARGS = ['-all=', '-tagsFromFile', '@', '-ICC_Profile', '-Orientation']

// Only these families hold what a person wrote or a device recorded; ExifTool's own, the file system's and
// the composite tags it works out are left alone.
const FAMILIES = new Set(['EXIF', 'XMP', 'IPTC', 'PNG', 'MakerNotes'])

const DATES: { id: string; label: string; names: string[] }[] = [
  {
    id: 'taken',
    label: 'Date taken',
    names: [
      'DateTimeOriginal',
      'OffsetTimeOriginal',
      'SubSecTimeOriginal',
      'DateCreated',
      'TimeCreated',
      'DateTimeCreated',
      'CreationTime',
    ],
  },
  {
    id: 'digitised',
    label: 'Date digitised',
    names: [
      'CreateDate',
      'OffsetTimeDigitized',
      'SubSecTimeDigitized',
      'DateTimeDigitized',
      'DigitalCreationDate',
      'DigitalCreationTime',
    ],
  },
  { id: 'modified', label: 'Date modified', names: ['ModifyDate', 'OffsetTime', 'SubSecTime', 'MetadataDate'] },
  { id: 'gps', label: 'GPS time', names: ['GPSDateStamp', 'GPSTimeStamp', 'GPSDateTime'] },
]
const DATE_NAMES = new Map(DATES.flatMap((d) => d.names.map((name) => [name, d] as const)))

const PLACE =
  /^(City|State|Province-State|Country|Country-PrimaryLocation(Name|Code)|CountryCode|Sub-?location|Location|LocationName)$|^Location(Shown|Created)/
const UNIQUE_IDS = new Set(['ImageUniqueID', 'ContentIdentifier', 'MediaGroupUUID', 'BurstUUID'])
const PEOPLE = new Set([
  'Artist',
  'Creator',
  'By-line',
  'Author',
  'XPAuthor',
  'Copyright',
  'Rights',
  'CopyrightNotice',
  'Credit',
  'OwnerName',
  'CameraOwnerName',
  'CaptionWriter',
  'Writer-Editor',
  'Contact',
  'PersonInImage',
  'PersonInImageName',
  'RegionName',
  'RegionPersonDisplayName',
  'CreatorAddress',
  'CreatorCity',
  'CreatorCountry',
  'CreatorPostalCode',
  'CreatorRegion',
  'CreatorWorkEmail',
  'CreatorWorkTelephone',
  'CreatorWorkURL',
])
const SOFTWARE = new Set([
  'Software',
  'CreatorTool',
  'ProcessingSoftware',
  'DocumentAncestors',
  'PreservedFileName',
  'RawFileName',
])
/** The text fields generators write their settings to (src/lib/ai/), by `family:name` in lower case. */
const GENERATION = new Set(
  [
    'parameters',
    'prompt',
    'workflow',
    'generation_data',
    'sd-metadata',
    'invokeai_metadata',
    'invokeai_graph',
    'dream',
    'fooocus_scheme',
    'comment',
    'description',
    'generation_time',
    'source',
  ]
    .map((name) => `png:${name}`)
    .concat(['exif:usercomment', 'xmp:usercomment']),
)
/** A path with a user's folder in it: Windows' `C:\Users\sam\` or macOS's and Linux's `/Users/sam/`. */
const USER_PATH = /[A-Za-z]:\\(Users|Documents and Settings)\\[^\\]+\\|\/(Users|home)\/[^/]+\//

const STEALTH = 'the lowest bits'
const fromStealth = (where: string) => where.startsWith(STEALTH)
const MAKER_NOTES = '-MakerNotes:all='

/** The argument that deletes one tag. A maker note can't lose one tag, only all of them. */
const deleteArg = (t: Tag) => (t.family === 'MakerNotes' ? MAKER_NOTES : `-${t.group}:${t.name}=`)

const short = (value: string) => {
  const line = value.replace(/\s+/g, ' ').trim()
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

const timeWords = (time: LocalTime | null) => (time ? dateWords(time) : null)

function dateValue(info: ImageInfo, id: string): string | null {
  const { taken, digitised, modified, gpsUtc } = info.dates
  if (id === 'taken') return timeWords(taken)
  if (id === 'digitised') return timeWords(digitised)
  if (id === 'modified') return timeWords(modified)
  return gpsUtc ? dateWords({ local: gpsUtc.slice(0, 19), offset: '+00:00' }) : null
}

/** Where a tag goes: its row's id, group and label, or null when it says nothing about anyone. */
function classify(t: Tag, generated: boolean): { id: string; group: PrivacyGroup; label: string } | null {
  const key = `${t.family}:${t.name}`.toLowerCase()
  // ComfyUI's WebP keeps its graphs in EXIF Make and Model, prefixed (SPEC.md 6.3).
  const graph = (t.name === 'Make' || t.name === 'Model') && /^(prompt|workflow):/.test(t.value)
  if (generated && (GENERATION.has(key) || graph)) return { id: 'generation', group: 'generation', label: '' }
  if (t.family === 'MakerNotes')
    return /SerialNumber$/.test(t.name) ? { id: `tag:${t.name}`, group: 'device', label: t.label } : null
  const date = DATE_NAMES.get(t.name)
  if (date) return { id: `date:${date.id}`, group: 'dates', label: date.label }
  if ((t.family === 'EXIF' && t.group === 'GPS') || (t.family === 'XMP' && t.name.startsWith('GPS')))
    return { id: 'gps', group: 'location', label: 'GPS position' }
  if (PLACE.test(t.name)) return { id: `tag:${t.name}`, group: 'location', label: t.label }
  if (/SerialNumber$/.test(t.name) || UNIQUE_IDS.has(t.name))
    return { id: `tag:${t.name}`, group: 'device', label: t.label }
  if (PEOPLE.has(t.name)) return { id: `tag:${t.name}`, group: 'people', label: t.label }
  if (t.group === 'XMP-xmpMM') return { id: 'history', group: 'software', label: 'Document IDs and edit history' }
  if (SOFTWARE.has(t.name) || (t.family === 'XMP' && USER_PATH.test(t.value)))
    return { id: `tag:${t.name}`, group: 'software', label: t.label }
  return null
}

type Row = { id: string; group: PrivacyGroup; label: string; tags: Tag[] }

/** Everything in the file that could identify someone, in PRIVACY_GROUPS' order. `credentials`: the Content
 * Credentials the C2PA SDK read, for who signed them. Stealth metadata isn't listed: it lives in the pixels,
 * which removing metadata leaves alone (`leftAfter` says so). Raw and TIFF files' embedded previews are part
 * of what makes them work, so they aren't offered either. */
export function privacyFindings(info: ImageInfo, credentials: Credentials | null): PrivacyFinding[] {
  const generator = info.generators.find((g) => !g.where.every(fromStealth))
  const rows = new Map<string, Row>()
  let signed = false
  for (const t of info.tags) {
    if (t.family === 'JUMBF' || t.family === 'C2PA') signed = true
    if (!FAMILIES.has(t.family)) continue
    const where = classify(t, !!generator)
    if (!where) continue
    const row = rows.get(where.id) ?? { ...where, tags: [] }
    row.tags.push(t)
    rows.set(where.id, row)
  }

  const list: PrivacyFinding[] = []
  for (const row of rows.values()) {
    const args = [...new Set(row.tags.map(deleteArg))]
    if (row.id === 'gps') {
      // A GPS block's version and fields left unset say nothing of where (a Pixel 9 writes only those), but go with
      // a position that's removed.
      const said = row.tags.filter(
        (t) => t.name !== 'GPSVersionID' && !/^(undef|Unknown \(.*\))?$/.test(t.value.trim()),
      )
      if (!said.length) continue
      const value = info.gps ? `${info.gps.lat.toFixed(5)}, ${info.gps.lon.toFixed(5)}` : said[0].value
      list.push({ id: row.id, group: row.group, label: row.label, value, full: value, args })
      continue
    }
    if (row.id === 'generation') {
      const full = generator!.prompt ?? row.tags[0].value
      list.push({ id: row.id, group: row.group, label: generator!.name, value: short(full), full, args })
      continue
    }
    if (row.id === 'history') {
      const full = row.tags.find((t) => t.name === 'DocumentID')?.value ?? row.tags[0].value
      list.push({ id: row.id, group: row.group, label: row.label, value: short(full), full, args: ['-XMP-xmpMM:all='] })
      continue
    }
    const full = (row.id.startsWith('date:') && dateValue(info, row.id.slice(5))) || row.tags[0].value
    const path = row.tags.map((t) => t.value.match(USER_PATH)?.[0]).find(Boolean)
    list.push({
      id: row.id,
      group: row.group,
      label: row.label,
      value: short(full),
      full,
      ...(path ? { note: `Contains the path ${path}…` } : {}),
      args,
    })
  }

  const video = info.motion?.location
  if (video) {
    const value = `${video.lat.toFixed(5)}, ${video.lon.toFixed(5)}`
    list.push({
      id: 'motion-location',
      group: 'location',
      label: 'Motion Photo video’s location',
      value,
      full: value,
      note: 'Removing it blanks the location inside the video, which plays as before.',
      args: [],
      blank: video.boxes,
    })
  }

  if (info.format !== 'raw' && info.format !== 'tiff')
    for (const e of info.embedded) {
      if (e.kind !== 'thumbnail' && e.kind !== 'preview') continue
      const { family, group, name } = e.tag
      const size = e.size === null ? e.label : formatBytes(e.size)
      list.push({
        id: `embedded:${e.id}`,
        group: 'embedded',
        label: e.label,
        value: size,
        full: size,
        note: 'May show the picture before it was cropped.',
        args: [family === 'MakerNotes' ? MAKER_NOTES : group === 'IFD1' ? '-IFD1:all=' : `-${group}:${name}=`],
      })
    }

  if (signed || credentials) {
    const value = credentials?.signer ? `Signed by ${credentials.signer}` : 'A signed manifest'
    list.push({
      id: 'credentials',
      group: 'credentials',
      label: 'Content Credentials',
      value,
      full: value,
      note: 'Can name a person or an account.',
      args: ['-JUMBF:all='],
    })
  }

  // Samsung Gallery's edit data goes with the rest of Samsung's trailer, unless a Motion Photo's video is in it too.
  const { samsung, motion } = info
  const holdsVideo = motion && samsung && motion.offset >= samsung.offset
  if (samsung && !holdsVideo && samsung.blocks.some((b) => b.type === PHOTO_EDITOR))
    list.push({
      id: 'samsung-edits',
      group: 'software',
      label: 'Samsung Gallery edit data',
      value: formatBytes(samsung.length),
      full: `${formatBytes(samsung.length)} that lets Samsung Gallery undo its edits.`,
      note: 'Holds the edits, any drawing, and where the unedited picture is kept on the phone.',
      args: [],
      cut: { offset: samsung.offset, length: samsung.length },
    })

  const { trailer } = info
  if (trailer)
    list.push({
      id: 'hidden',
      group: 'hidden',
      label: 'Data after the end of the picture',
      value: formatBytes(trailer.length),
      full: trailerWords(trailer),
      note: looksWords(trailer.looksLike),
      args: [],
      cut: { offset: trailer.offset, length: trailer.length },
    })

  // By group, and dates in the order they happen, whatever order the file holds them in.
  const group = (f: PrivacyFinding) => PRIVACY_GROUPS.findIndex((g) => g.id === f.group)
  const date = (f: PrivacyFinding) => DATES.findIndex((d) => f.id === `date:${d.id}`)
  return list.sort((a, b) => group(a) - group(b) || date(a) - date(b))
}

const wipesSafely = (format: Format) => format !== 'raw' && format !== 'tiff'

/** ExifTool's arguments for the ticked findings. With every metadata finding ticked, everything goes but the
 * colour profile and the orientation, except in raw and TIFF files, whose maker notes and structure are needed to
 * develop them: there only what's listed goes, and maker notes stay. Hidden data and a Motion Photo video's
 * location aren't ExifTool's: Loupe cuts and blanks them. */
export function removalArgs(findings: PrivacyFinding[], ticked: string[], format: Format): string[] {
  const metadata = findings.filter((f) => !f.cut && !f.blank)
  const chosen = metadata.filter((f) => ticked.includes(f.id))
  if (chosen.length && chosen.length === metadata.length && wipesSafely(format)) return EVERYTHING_ARGS
  const args = chosen.flatMap((f) => f.args).filter((a) => wipesSafely(format) || a !== MAKER_NOTES)
  return [...new Set(args)]
}

/** What the result still holds of what was ticked, each with why, read from the result's own tags: nothing
 * when it's all gone. Stealth metadata always stays, since it's in the pixels. */
export function leftAfter(ticked: string[], before: ImageInfo, after: ImageInfo): string[] {
  const left = privacyFindings(after, null)
    .filter((f) => ticked.includes(f.id))
    .map((f) =>
      f.cut
        ? `${f.label}: it’s still in the result.`
        : !wipesSafely(before.format) && f.args.every((a) => a === MAKER_NOTES)
          ? `${f.label}: kept in the camera’s maker notes, which a raw file needs to be developed.`
          : `${f.label}: ExifTool couldn’t remove it from this ${before.formatName} file.`,
    )
  const stealth = before.generators
    .filter((g) => g.where.some(fromStealth))
    .map((g) => `${g.name}’s settings in the picture’s pixels: removing them would change the picture.`)
  return [...left, ...stealth]
}
