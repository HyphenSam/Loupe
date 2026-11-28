/** ExifTool's JSON into ImageInfo's fields (SPEC.md section 4). ExifTool runs with `-json -l -G0:1`, so each
 * tag comes keyed by both its groups with its description, its printed value and, where they differ, its
 * number: the sheet shows the printed value, and the derivations here take the number. */
import type { GeneratorFinding } from './ai/finding'
import { generatorsOf } from './ai/generators'
import { editTrail } from './forensics/history'
import { jpegInfo } from './forensics/quant'
import { findTrailer, looksLike, trailerExtension, unknownChunks } from './forensics/trailer'
import { extensionMismatch, formatName, formatOf, isLossless, type Sniffed } from './formats'
import { kindsOf } from './kinds'
import {
  turnsSideways,
  type Animation,
  type Camera,
  type Colour,
  type ColourSpace,
  type Dates,
  type Embedded,
  type Gps,
  type ImageInfo,
  type LocalTime,
  type Orientation,
  type Tag,
} from './info'
import { motionVideo, type MotionVideo } from './motion'
import { drawingsOf, samsungTrailer, type SamsungTrailer } from './samsung'

type Value = string | number | boolean | Value[] | { [key: string]: Value }

/** One tag of ExifTool's long JSON. */
export type Entry = { family: string; group: string; name: string; label: string; val: Value; num?: Value }

/** The first file's tags, in ExifTool's order. */
export function parseExifTool(json: string): Entry[] {
  const [object] = JSON.parse(json) as Record<string, { desc: string; val: Value; num?: Value }>[]
  const entries: Entry[] = []
  for (const [key, tag] of Object.entries(object ?? {})) {
    if (key === 'SourceFile' || typeof tag !== 'object') continue
    const parts = key.split(':')
    const name = parts.at(-1)!
    const [family, group] = parts.length === 3 ? parts : [parts[0], parts[0]]
    entries.push({ family, group, name, label: tag.desc, val: tag.val, ...('num' in tag ? { num: tag.num } : {}) })
  }
  return entries
}

/** Lookups over the entries. A name found in several groups gives the first ExifTool listed, unless the
 * caller names the groups (family 0 or 1) to look in, in order. */
export type Reader = ReturnType<typeof reader>

export function reader(entries: Entry[]) {
  const byName = new Map<string, Entry[]>()
  for (const entry of entries) byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry])

  /** Every entry with this name, in the groups' order when they're named. */
  function all(name: string, groups: string[]): Entry[] {
    const found = byName.get(name) ?? []
    if (!groups.length) return found
    return groups.flatMap((g) => found.filter((e) => e.group === g || e.family === g))
  }

  const find = (name: string, ...groups: string[]): Entry | undefined => all(name, groups)[0]

  /** The first printed value that isn't blank, as text, trimmed. */
  function text(name: string, ...groups: string[]): string | null {
    for (const { val } of all(name, groups)) {
      if (typeof val === 'object') continue
      const s = String(val).trim()
      if (s) return s
    }
    return null
  }

  /** The first number, from the unconverted value when there is one. */
  function number(name: string, ...groups: string[]): number | null {
    for (const entry of all(name, groups)) {
      const value = entry.num ?? entry.val
      const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN
      if (Number.isFinite(n)) return n
    }
    return null
  }

  /** The first of several names that has a value. */
  function first<T>(get: (name: string) => T | null, ...names: string[]): T | null {
    for (const name of names) {
      const value = get(name)
      if (value !== null) return value
    }
    return null
  }

  return { entries, find, text, number, first, has: (name: string, ...groups: string[]) => !!find(name, ...groups) }
}

/** A tag's printed value as one line of text. */
export function printed(value: Value): string {
  if (Array.isArray(value)) return value.map(printed).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** ImageInfo from ExifTool's JSON for a file, or null if it isn't a picture Loupe opens. With the file's `bytes`,
 * Loupe's own readers add the JPEG's tables, data after the picture and unknown PNG chunks. The picture's own
 * size is filled in again by the worker once it's decoded, where the decoder knows better (HEIC's crop). */
export function toImageInfo(
  json: string,
  file: { name: string; size: number; lastModified: number },
  sniffed: Sniffed | null,
  bytes: Uint8Array | null = null,
): ImageInfo | null {
  const t = reader(parseExifTool(json))
  const fileType = t.text('FileType', 'File')
  const format = formatOf(sniffed, fileType)
  if (!format) return null
  const type = fileType ?? format.toUpperCase()

  const [width, height] = imageSize(t)
  const orientation = orientationOf(t)
  const sideways = turnsSideways(orientation)
  const animation = animationOf(t)
  const tags = t.entries.map(({ family, group, name, label, val }) => ({
    family,
    group,
    name,
    label,
    value: printed(val),
  }))

  const dates = datesOf(t)
  const trailer = bytes ? findTrailer(bytes, format, tags) : null
  const generators = generatorsOf(tags) // the worker adds what stealth metadata in the pixels says
  const kinds = kindsOf(t, format, animation)
  const motion = bytes && kinds.includes('motion-photo') ? motionVideo(bytes, format) : null
  // In a HEIC file Samsung's trailer is inside its `sefd` box, which ExifTool reads and removes as a box.
  const samsung = bytes && (format === 'jpeg' || format === 'png' || format === 'webp') ? samsungTrailer(bytes) : null
  const embedded = [
    ...withMotion(embeddedOf(t), motion),
    ...generationItems(tags, generators),
    ...(samsung ? samsungItems(bytes!, samsung) : []),
  ]
  if (trailer)
    embedded.push({
      id: 'trailer',
      kind: 'trailer',
      label: 'Data after the end of the picture',
      size: trailer.length,
      extension: trailerExtension(trailer.looksLike),
      isImage: trailer.looksLike === 'jpeg' || trailer.looksLike === 'png',
    })

  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    format,
    formatName: formatName(format, type),
    lossless: bytes ? isLossless(format, bytes) : false,
    extension: extensionMismatch(file.name, format, type),
    width,
    height,
    orientation,
    displayWidth: sideways ? height : width,
    displayHeight: sideways ? width : height,
    bitDepth: bitDepthOf(t),
    alpha: alphaOf(t),
    colour: colourOf(t),
    animation,
    tags,
    json,
    camera: cameraOf(t),
    dates,
    gps: gpsOf(t),
    place: null, // the worker looks it up once it has the places data
    kinds,
    embedded,
    generators,
    sourceType: sourceTypeOf(t),
    edits: editTrail(t.entries, dates),
    jpeg: bytes && format === 'jpeg' ? jpegInfo(bytes) : null,
    trailer,
    unknownChunks: bytes && format === 'png' ? unknownChunks(bytes) : [],
    motion,
    samsung,
  }
}

/** IPTC's Digital Source Type as the file states it: its raw value, a URI or a bare term, not ExifTool's
 * printed label (src/lib/ai/source-type.ts words it). */
function sourceTypeOf(t: Reader): string | null {
  const entry = t.find('DigitalSourceType', 'XMP-iptcExt')
  const value = entry && String(entry.num ?? entry.val).trim()
  return value || null
}

function imageSize(t: Reader): [number, number] {
  const size = t.find('ImageSize', 'Composite')
  const [w, h] = String(size?.num ?? '')
    .split(' ')
    .map(Number)
  if (w > 0 && h > 0) return [w, h]
  return [t.number('ImageWidth') ?? 0, t.number('ImageHeight') ?? 0]
}

function orientationOf(t: Reader): Orientation {
  const n = t.number('Orientation', 'IFD0', 'EXIF', 'XMP-tiff')
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 8 ? (n as Orientation) : 1
}

function bitDepthOf(t: Reader): number | null {
  // BMP's is per pixel; a palette's 8 bits or fewer index 8-bit colours.
  const bmp = t.number('BitDepth', 'File')
  if (bmp !== null) return bmp >= 24 ? bmp / (bmp === 32 ? 4 : 3) : 8
  const depth = t.first((name) => t.number(name), 'BitsPerSample', 'BitDepth', 'BitDepthLuma', 'ImagePixelDepth')
  return depth
}

function alphaOf(t: Reader): boolean {
  const pngType = t.number('ColorType', 'PNG')
  if (pngType === 4 || pngType === 6 || t.has('Transparency', 'PNG')) return true
  if (t.number('AlphaIsUsed') === 1) return true
  return false
}

const PRIMARIES: Record<number, ColourSpace> = { 1: 'srgb', 9: 'rec2020', 11: 'display-p3', 12: 'display-p3' }

function colourOf(t: Reader): Colour {
  const profile = t.text('ProfileDescription', 'ICC_Profile')
  const data = t.text('ColorSpaceData')
  let space: ColourSpace | null = null
  if (profile) space = spaceOfProfile(profile, data)
  else if (t.number('ColorPrimaries') !== null) space = PRIMARIES[t.number('ColorPrimaries')!] ?? null
  else if (t.number('ColorSpace', 'ExifIFD') === 1) space = 'srgb'
  else if (t.number('ColorComponents', 'File') === 1) space = 'grey'

  const transfer = t.number('TransferCharacteristics')
  const gainMap =
    t.has('Version', 'XMP-hdrgm') ||
    t.text('UniformResourceName')?.startsWith('urn:iso:std:iso:ts:21496') ||
    t.has('GainMapImage') ||
    semantics(t).includes('GainMap')
  const hdr = gainMap ? 'gain-map' : transfer === 16 ? 'pq' : transfer === 18 ? 'hlg' : null
  return { profile, space, hdr }
}

function spaceOfProfile(profile: string, data: string | null): ColourSpace {
  const p = profile.toLowerCase()
  if (data === 'GRAY' || /\b(gr[ae]y|gamma 2\.2 gr|dot gain)/.test(p)) return 'grey'
  if (data === 'CMYK') return 'cmyk'
  if (p.includes('p3')) return 'display-p3'
  if (p.includes('adobe rgb') || p.includes('adobergb') || p.includes('compatible with adobe')) return 'adobe-rgb'
  if (p.includes('prophoto') || p.includes('romm')) return 'prophoto'
  if (p.includes('2020') || p.includes('2100')) return 'rec2020'
  if (p.includes('srgb') || p.includes('61966')) return 'srgb'
  return 'other'
}

/** The items of Google's container directory (Motion Photos, depth maps, gain maps). */
export function semantics(t: Reader): string[] {
  const value = t.find('DirectoryItemSemantic')?.val
  return value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(String)
}

function animationOf(all: Reader): Animation | null {
  // A Pixel's maker notes count the frames its HDR+ burst merged into one picture.
  const t = reader(all.entries.filter((e) => e.family !== 'MakerNotes'))
  const frames = t.first((name) => t.number(name), 'FrameCount', 'AnimationFrames')
  if (frames === null || frames < 2) return null
  const loops = t.first((name) => t.number(name), 'AnimationIterations', 'AnimationPlays', 'AnimationLoopCount')
  return { frames, duration: t.number('Duration') ?? 0, loops: !loops ? 'forever' : loops }
}

function cameraOf(t: Reader): Camera | null {
  const text = (...names: string[]) => t.first((n) => t.text(n), ...names)
  const number = (...names: string[]) => t.first((n) => t.number(n), ...names)
  const identified = t.text('LensID', 'Composite')
  const lens =
    (identified && !identified.startsWith('Unknown') ? identified : null) ?? text('LensModel', 'Lens') ?? identified
  const make = text('Make')
  const camera: Camera = {
    make,
    model: text('Model'),
    lens,
    exposure: {
      time: text('ExposureTime'),
      aperture: number('FNumber', 'ApertureValue'),
      iso: number('ISO'),
      bias: number('ExposureCompensation'),
    },
    focalLength: number('FocalLength'),
    focal35: t.number('FocalLengthIn35mmFormat') ?? t.number('FocalLength35efl', 'Composite'),
    flash: text('Flash'),
    bodySerial: text('SerialNumber', 'BodySerialNumber', 'CameraSerialNumber'),
    lensSerial: text('LensSerialNumber'),
    internalSerial: text('InternalSerialNumber'),
    owner: text('OwnerName', 'CameraOwnerName', 'Owner'),
    // Fujifilm's ImageCount counts shutter actuations; Nikon's counts pictures saved.
    shutterCount: t.number('ShutterCount') ?? t.number('ImageCount', 'FujiFilm'),
    software: text('Software'),
  }
  const { exposure, ...rest } = camera
  const empty = Object.values(rest).every((v) => v === null) && Object.values(exposure).every((v) => v === null)
  return empty ? null : camera
}

/** '2025:03:12 14:32:05', with seconds' fractions or an offset, into local time and offset. */
export function parseDate(value: string | null, offset: string | null = null): LocalTime | null {
  const m = value?.match(
    /^(\d{4})[:-](\d\d)[:-](\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?(?:\.\d+)?)?\s*(Z|[+-]\d\d:?\d\d)?$/,
  )
  if (!m || m[1] === '0000' || m[2] === '00') return null
  const [, y, mo, d, h = '00', mi = '00', s = '00', zone] = m
  const own = zone === 'Z' ? '+00:00' : zone ? `${zone.slice(0, 3)}:${zone.slice(-2)}` : null
  return { local: `${y}-${mo}-${d}T${h}:${mi}:${s}`, offset: own ?? offset }
}

function datesOf(t: Reader): Dates {
  // The first copy found, with its zone from another copy of the same moment when it has none of its own (a
  // CRW's own date has none; XMP's copy does).
  const date = (names: [string, ...string[]][], offsetName: string): LocalTime | null => {
    const found = names
      .map(([name, ...groups]) => parseDate(t.text(name, ...groups), t.text(offsetName)))
      .filter((d) => d !== null)
    const [first] = found
    if (!first || first.offset) return first ?? null
    return { ...first, offset: found.find((d) => d.local === first.local && d.offset)?.offset ?? null }
  }
  const gps = t.text('GPSDateTime', 'Composite')?.match(/^(\d{4}):(\d\d):(\d\d) (\d\d:\d\d:\d\d(?:\.\d+)?)Z$/)
  return {
    taken: date(
      [
        ['DateTimeOriginal', 'ExifIFD', 'IFD0', 'XMP-exif', 'MakerNotes', 'SigmaRaw', 'CanonRaw', 'PhaseOne'],
        ['DateCreated', 'XMP-photoshop', 'IPTC'],
        ['CreateDate', 'QuickTime', 'XMP-xmp'],
      ],
      'OffsetTimeOriginal',
    ),
    digitised: date(
      [
        ['CreateDate', 'ExifIFD'],
        ['DateTimeDigitized', 'XMP-exif'],
      ],
      'OffsetTimeDigitized',
    ),
    modified: date([['ModifyDate', 'IFD0', 'XMP-xmp', 'QuickTime']], 'OffsetTime'),
    gpsUtc: gps ? `${gps[1]}-${gps[2]}-${gps[3]}T${gps[4]}Z` : null,
  }
}

const SPEED_TO_KMH: Record<string, number> = { K: 1, M: 1.609344, N: 1.852 }

function gpsOf(t: Reader): Gps | null {
  const lat = t.number('GPSLatitude', 'Composite') ?? t.number('GPSLatitude', 'XMP-exif')
  const lon = t.number('GPSLongitude', 'Composite') ?? t.number('GPSLongitude', 'XMP-exif')
  if (lat === null || lon === null) return null
  const degrees = t.number('GPSImgDirection')
  const speed = t.number('GPSSpeed')
  const speedRef = String(t.find('GPSSpeedRef')?.num ?? 'K')
  return {
    lat,
    lon,
    altitude: t.number('GPSAltitude', 'Composite') ?? t.number('GPSAltitude'),
    direction:
      degrees === null
        ? null
        : { degrees, ref: String(t.find('GPSImgDirectionRef')?.num ?? 'T') === 'M' ? 'magnetic' : 'true' },
    speed: speed === null ? null : speed * (SPEED_TO_KMH[speedRef] ?? 1),
    accuracy: t.number('GPSHPositioningError'),
  }
}

/** "(Binary data 1218 bytes, use -b option to extract)" → 1218. */
const binarySize = (value: Value | undefined) => {
  const m = typeof value === 'string' ? value.match(/^\(Binary data (\d+) bytes/) : null
  return m ? Number(m[1]) : null
}

const PICTURES: { name: string; kind: Embedded['kind']; label: string }[] = [
  { name: 'ThumbnailImage', kind: 'thumbnail', label: 'EXIF thumbnail' },
  { name: 'PreviewImage', kind: 'preview', label: 'Preview' },
  { name: 'OtherImage', kind: 'preview', label: 'Preview' },
  { name: 'JpgFromRaw', kind: 'preview', label: 'Full-size preview' },
  { name: 'GainMapImage', kind: 'gain-map', label: 'HDR gain map' },
  { name: 'DepthImage', kind: 'depth-map', label: 'Depth map' },
  { name: 'DepthMapImage', kind: 'depth-map', label: 'Depth map' },
]

/** The text fields generators keep their settings in, by `family:name` in lower case, with the name as the
 * generator writes it (ExifTool capitalises PNG keywords). */
const GENERATION_FIELDS: [key: string, words: string][] = [
  ['png:parameters', 'the PNG text chunk “parameters”'],
  ['png:invokeai_metadata', 'the PNG text chunk “invokeai_metadata”'],
  ['png:sd-metadata', 'the PNG text chunk “sd-metadata”'],
  ['png:dream', 'the PNG text chunk “Dream”'],
  ['png:generation_data', 'the PNG text chunk “generation_data”'],
  ['png:comment', 'the PNG text chunk “Comment”'],
  ['png:description', 'the PNG text chunk “Description”'],
  ['exif:usercomment', 'EXIF UserComment'],
  ['xmp:usercomment', 'XMP UserComment'],
]

/** The text a generator's settings were read from, and where it was; null when no generator was found. */
export function generationText(tags: Tag[], generators: GeneratorFinding[]): { text: string; where: string } | null {
  if (!generators.length) return null
  for (const [key, where] of GENERATION_FIELDS) {
    const tag = tags.find((t) => `${t.family}:${t.name}`.toLowerCase() === key)
    if (tag) return { text: tag.value, where }
  }
  return null
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length

/** A ComfyUI workflow and a generator's settings, saved as they're stored (SPEC.md 6.6). */
function generationItems(tags: Tag[], generators: GeneratorFinding[]): Embedded[] {
  const out: Embedded[] = []
  const workflow = generators.find((g) => g.workflow)?.workflow
  if (workflow)
    out.push({
      id: 'comfyui-workflow',
      kind: 'comfyui-workflow',
      label: 'ComfyUI workflow',
      size: utf8Length(workflow.json),
      extension: 'json',
      isImage: false,
    })
  const settings = generationText(tags, generators)
  if (settings)
    out.push({
      id: 'generation-parameters',
      kind: 'generation-parameters',
      label: `Generation settings, from ${settings.where}`,
      size: utf8Length(settings.text),
      extension: 'txt',
      isImage: false,
    })
  return out
}

/** A Motion Photo's video once, as the MP4 Loupe found, in place of ExifTool's tags for it: Samsung's trailer and
 * Google's container directory each name it, Google's running on over Samsung's trailer, and a HEIC's Samsung
 * tag names a 12-byte pointer. Without the MP4, ExifTool's tags stay. */
function withMotion(items: Embedded[], motion: MotionVideo | null): Embedded[] {
  if (!motion) return items
  const at = items.findIndex((e) => e.kind === 'motion-video')
  const video: Embedded = {
    id: 'motion-video',
    kind: 'motion-video',
    label: 'Motion Photo video',
    size: motion.length,
    extension: 'mp4',
    isImage: false,
  }
  const rest = items.filter((e) => e.kind !== 'motion-video')
  return at < 0 ? [...rest, video] : [...rest.slice(0, at), video, ...rest.slice(at)]
}

/** What Samsung's trailer holds that can be saved (SPEC.md 6.6): pictures, by their first bytes; Samsung Gallery's
 * edit data; the tiles it keeps a drawing in, and each drawing put back together from them (the worker rebuilds
 * it when asked). A Motion Photo's video is listed with `withMotion`'s. */
function samsungItems(b: Uint8Array, samsung: SamsungTrailer): Embedded[] {
  const out: Embedded[] = []
  for (const [i, block] of samsung.blocks.entries()) {
    const { name, offset, length } = block
    const place = { offset, length }
    const looks = looksLike(b.subarray(offset, offset + length))
    const picture = looks === 'jpeg' || looks === 'png'
    if (name === 'deco_doodle_bitmap' && looks === 'png')
      out.push({
        id: 'drawing-tiles',
        kind: 'drawing-tiles',
        label: 'Drawing, in Samsung Gallery’s tiles',
        size: length,
        extension: 'png',
        isImage: true,
        place,
      })
    else if (picture)
      out.push({
        id: `samsung:${i}`,
        kind: 'samsung-picture',
        label: `Samsung’s extra picture “${name}”`,
        size: length,
        extension: trailerExtension(looks),
        isImage: true,
        place,
      })
    else if (name === 'PhotoEditor_Re_Edit_Data')
      out.push({
        id: 'samsung-edits',
        kind: 'samsung-edits',
        label: 'Samsung Gallery edit data',
        size: length,
        extension: 'json',
        isImage: false,
        place,
      })
  }
  const edit = samsung.blocks.find((x) => x.name === 'PhotoEditor_Re_Edit_Data')
  if (!edit || !out.some((e) => e.kind === 'drawing-tiles')) return out
  const drawings = drawingsOf(new TextDecoder().decode(b.subarray(edit.offset, edit.offset + edit.length)))
  for (const i of drawings.keys())
    out.push({
      id: `drawing:${i}`,
      kind: 'drawing',
      label: drawings.length > 1 ? `Drawing ${i + 1} of ${drawings.length}` : 'Drawing',
      size: null,
      extension: 'png',
      isImage: true,
    })
  return out
}

/** The gain map's length as Google's container directory gives it, or null. */
function gainMapLength(t: Reader): number | null {
  const at = semantics(t).indexOf('GainMap')
  const value = t.find('DirectoryItemLength')?.val
  const lengths = value === undefined ? [] : Array.isArray(value) ? value : [value]
  const length = at < 0 ? NaN : Number(lengths[at])
  return length > 0 ? length : null
}

function embeddedOf(t: Reader): Embedded[] {
  const out: Embedded[] = []
  // ExifTool (13.42) can give the trailer's gain map another item's bytes (a Pixel 9 Motion Photo's video, whose
  // gain map is in MPF), so Google's directory has the last word on its length.
  const length = gainMapLength(t)
  const found = t.find('GainMapImage')
  const gainMap = found && (length === null || binarySize(found.val) === length) ? found : undefined
  const gainMapSize = gainMap ? binarySize(gainMap.val) : length
  for (const entry of t.entries) {
    const size = binarySize(entry.val)
    if (size === null) continue
    const tag = { family: entry.family, group: entry.group, name: entry.name }
    const id = `${entry.family}:${entry.group}:${entry.name}`
    if (entry.name === 'GainMapImage' && entry !== gainMap) continue
    const picture = PICTURES.find((p) => p.name === entry.name)
    // GDepth says what its depth map is; Google's container trailer holds only JPEGs.
    const extension = entry.group === 'XMP-GDepth' && t.text('Mime', 'XMP-GDepth') === 'image/png' ? 'png' : 'jpg'
    if (picture) out.push({ id, kind: picture.kind, label: picture.label, size, extension, isImage: true, tag })
    else if (/^MPImage\d+$/.test(entry.name)) {
      // MPF lists the gain map too, which Google's tag may already name.
      if (size === gainMapSize) {
        if (!gainMap) out.push({ id, kind: 'gain-map', label: 'HDR gain map', size, extension: 'jpg', isImage: true })
        continue
      }
      out.push({
        id,
        kind: 'mpf-image',
        label: `Multi-picture image ${entry.name.slice(7)}`,
        size,
        extension: 'jpg',
        isImage: true,
      })
    } else if (entry.name === 'MotionPhotoVideo' || entry.name === 'EmbeddedVideoFile' || entry.name === 'MicroVideo')
      out.push({ id, kind: 'motion-video', label: 'Motion Photo video', size, extension: 'mp4', isImage: false })
  }
  const profile = t.text('ProfileDescription', 'ICC_Profile')
  if (t.entries.some((e) => e.family === 'ICC_Profile'))
    out.push({
      id: 'icc-profile',
      kind: 'icc-profile',
      label: profile ? `Colour profile: ${profile}` : 'Colour profile',
      size: null,
      extension: 'icc',
      isImage: false,
    })
  if (t.entries.some((e) => e.family === 'XMP'))
    out.push({ id: 'xmp', kind: 'xmp', label: 'XMP metadata', size: null, extension: 'xmp', isImage: false })
  if (t.entries.some((e) => e.family === 'JUMBF' || e.family === 'C2PA'))
    out.push({
      id: 'c2pa-manifest',
      kind: 'c2pa-manifest',
      label: 'Content Credentials',
      size: null,
      extension: 'json',
      isImage: false,
    })
  return out
}
