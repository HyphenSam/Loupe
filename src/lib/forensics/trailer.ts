/** Data after the end of the picture (SPEC.md 6.5's Hidden data): where the picture's own bytes end, which
 * trailers are known (pictures MPF lists, the items Google's container directory and older Motion Photos put at
 * the end, Samsung's trailer), and what's left over. Pure: bytes and ExifTool's tags in, plain data out. */
import { formatBytes } from '../format-bytes'
import type { Format } from '../formats'
import type { Tag } from '../info'
import { ascii, pngChunks, view } from '../containers'

export type LooksLike = 'zip' | 'rar' | '7z' | 'pdf' | 'jpeg' | 'png' | 'text' | 'unknown'

/** Data after the end of the picture that isn't a known trailer: where it starts and how long it is. */
export type Trailer = { offset: number; length: number; looksLike: LooksLike }

/** Where a JPEG's first picture ends: after the EOI that closes its last scan. Between a progressive JPEG's
 * scans come more segments (Huffman tables, the next scan's header), which are stepped over. */
function jpegEnd(b: Uint8Array): number | null {
  const v = view(b)
  let at = 2
  let scanning = false
  while (at + 1 < b.length) {
    if (scanning && b[at] !== 0xff) {
      at++
      continue
    }
    if (b[at] !== 0xff) return null
    const marker = b[at + 1]
    // Stuffed zeros, restarts and fill bytes belong to the scan.
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    if (marker === 0xff) {
      at++
      continue
    }
    if (marker === 0xd9) return at + 2
    if (at + 4 > b.length) return null
    at += 2 + v.getUint16(at + 2)
    if (marker === 0xda) scanning = true
  }
  return null
}

function pngEnd(b: Uint8Array): number | null {
  for (const chunk of pngChunks(b))
    if (chunk.type === 'IEND') return chunk.raw.byteOffset - b.byteOffset + chunk.raw.length
  return null
}

function webpEnd(b: Uint8Array): number | null {
  if (b.length < 12 || ascii(b, 0, 4) !== 'RIFF') return null
  const size = view(b).getUint32(4, true)
  return 8 + size + (size % 2)
}

/** Where the picture's own bytes end, for the formats walked here; null when that can't be found. */
export function pictureEnd(b: Uint8Array, format: Format): number | null {
  if (format === 'jpeg') return b[0] === 0xff && b[1] === 0xd8 ? jpegEnd(b) : null
  if (format === 'png') return pngEnd(b)
  if (format === 'webp') return webpEnd(b)
  return null
}

/** The numbers in a tag's printed value: one, or a list joined with commas. */
const numbers = (t: Tag | undefined) => (t ? t.value.split(',').map(Number).filter(Number.isFinite) : [])
const sum = (list: number[]) => list.reduce((a, n) => a + n, 0)

/** Where Samsung's trailer starts: its `SEFH` directory sits before an 8-byte footer (its length, `SEFT`), and
 * its blocks before that, each placed by its distance back from the directory (ExifTool's Samsung.pm). */
function samsungStart(b: Uint8Array): number | null {
  const n = b.length
  if (n < 20 || ascii(b, n - 4, 4) !== 'SEFT') return null
  const v = view(b)
  const directory = n - 8 - v.getUint32(n - 8, true)
  if (directory < 0 || ascii(b, directory, 4) !== 'SEFH') return null
  const count = v.getUint32(directory + 8, true)
  let first = 0
  for (let i = 0; i < count && directory + 12 + i * 12 + 12 <= n; i++)
    first = Math.max(first, v.getUint32(directory + 12 + i * 12 + 4, true))
  return directory - first >= 0 ? directory - first : null
}

/** Where the known trailers that are placed from the end of the file begin, or the file's end without any. */
function knownTailStart(b: Uint8Array, tags: Tag[]): number {
  const find = (name: string) => tags.find((t) => t.name === name)
  const starts = [b.length]
  // Google's container directory: every item but the picture, laid end to end at the end of the file.
  const container = sum(numbers(find('DirectoryItemLength'))) + sum(numbers(find('DirectoryItemPadding')))
  if (container > 0) starts.push(b.length - container)
  const micro = numbers(find('MicroVideoOffset'))[0]
  if (micro > 0) starts.push(b.length - micro)
  const samsung = samsungStart(b)
  if (samsung !== null) starts.push(samsung)
  return Math.max(0, Math.min(...starts))
}

/** Where the pictures MPF lists end (ExifTool gives their starts from the start of the file). */
function mpfEnd(tags: Tag[]): number {
  let end = 0
  for (const start of tags.filter((t) => t.family === 'MPF' && t.name === 'MPImageStart')) {
    const length = tags.find((t) => t.group === start.group && t.name === 'MPImageLength')
    const [s, l] = [Number(start.value), Number(length?.value)]
    if (s > 0 && l > 0) end = Math.max(end, s + l)
  }
  return end
}

const MAGIC: [LooksLike, string][] = [
  ['zip', 'PK\x03\x04'],
  ['zip', 'PK\x05\x06'],
  ['rar', 'Rar!\x1a\x07'],
  ['7z', '7z\xbc\xaf\x27\x1c'],
  ['pdf', '%PDF-'],
  ['jpeg', '\xff\xd8\xff'],
  ['png', '\x89PNG\r\n\x1a\n'],
]

/** What data looks like from its first bytes: a known file's signature, text (no control characters other than
 * tabs and line breaks; UTF-8 allowed), or unknown. */
function looksLike(data: Uint8Array): LooksLike {
  const found = MAGIC.find(([, magic]) => ascii(data, 0, magic.length) === magic)
  if (found) return found[0]
  const head = data.subarray(0, 256)
  const text = head.every((c) => c === 9 || c === 10 || c === 13 || (c >= 0x20 && c !== 0x7f))
  return text ? 'text' : 'unknown'
}

/** Data after the end of the picture that isn't a known trailer, or null. Padding (all zeros or all 0xFF) isn't
 * counted. Known trailers placed from the end (a Motion Photo's video) with something between them and the
 * picture leave that something as the trailer. */
export function findTrailer(b: Uint8Array, format: Format, tags: Tag[]): Trailer | null {
  const end = pictureEnd(b, format)
  if (end === null) return null
  const offset = format === 'jpeg' ? Math.max(end, mpfEnd(tags)) : end
  const length = (format === 'jpeg' ? knownTailStart(b, tags) : b.length) - offset
  if (length <= 0) return null
  const data = b.subarray(offset, offset + length)
  if (data.every((c) => c === 0) || data.every((c) => c === 0xff)) return null
  return { offset, length, looksLike: looksLike(data) }
}

/** PNG's chunk types: the spec's (third edition) and extensions in common use: APNG, ImageMagick's `vpAg` and
 * `orNT`, Apple's `iDOT` and `CgBI`, Android's nine-patch chunks, and Content Credentials' `caBX`. */
const PNG_CHUNKS = new Set(
  (
    'IHDR PLTE IDAT IEND tRNS cHRM gAMA iCCP sBIT sRGB cICP mDCV mDCv cLLI cLLi tEXt zTXt iTXt bKGD hIST pHYs sPLT ' +
    'eXIf tIME acTL fcTL fdAT oFFs pCAL sCAL sTER gIFg gIFx gIFt fRAc dSIG vpAg orNT iDOT CgBI npTc npLb npOl caBX'
  ).split(' '),
)

/** A PNG's chunk types outside the spec and known extensions, once each, in file order. */
export function unknownChunks(b: Uint8Array): string[] {
  if (ascii(b, 1, 3) !== 'PNG') return []
  const found = new Set<string>()
  for (const { type } of pngChunks(b)) if (!PNG_CHUNKS.has(type)) found.add(type)
  return [...found]
}

const WORDS: Record<LooksLike, string> = {
  zip: 'It starts like a ZIP archive.',
  rar: 'It starts like a RAR archive.',
  '7z': 'It starts like a 7-Zip archive.',
  pdf: 'It starts like a PDF document.',
  jpeg: 'It starts like a JPEG picture.',
  png: 'It starts like a PNG picture.',
  text: 'It starts like text.',
  unknown: 'Loupe doesn’t recognise what it starts like.',
}

/** 'It starts like a ZIP archive.' */
export const looksWords = (looks: LooksLike) => WORDS[looks]

/** '4.2 MB of data after the end of the picture. It starts like a ZIP archive.' */
export const trailerWords = (t: Trailer) =>
  `${formatBytes(t.length)} of data after the end of the picture. ${WORDS[t.looksLike]}`

const FILES: Record<LooksLike, [extension: string, type: string]> = {
  zip: ['zip', 'application/zip'],
  rar: ['rar', 'application/vnd.rar'],
  '7z': ['7z', 'application/x-7z-compressed'],
  pdf: ['pdf', 'application/pdf'],
  jpeg: ['jpg', 'image/jpeg'],
  png: ['png', 'image/png'],
  text: ['txt', 'text/plain'],
  unknown: ['bin', 'application/octet-stream'],
}

/** The extension hidden data is saved with, and its type. */
export const trailerExtension = (looks: LooksLike) => FILES[looks][0]
export const trailerType = (looks: LooksLike) => FILES[looks][1]
