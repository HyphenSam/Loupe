/** What a file is: sniffed from its first bytes (Bytesize's `sniff`, plus HEIC, TIFF and JPEG XL in its
 * container), then settled with ExifTool's FileType, which is the only thing that tells raw formats apart. */
import { riffChunks } from './containers'

export type Format = 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'jxl' | 'gif' | 'bmp' | 'tiff' | 'raw'
export type Sniffed = Exclude<Format, 'raw'>

const HEIC_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx']
const AVIF_BRANDS = ['avif', 'avis']

/** What a file is, by its first bytes rather than its name. Raw files built on TIFF sniff as TIFF; the rest
 * sniff as nothing, and ExifTool names them (`formatOf`). */
export function sniff(b: Uint8Array): Sniffed | null {
  const is = (at: number, bytes: number[]) => bytes.every((v, i) => b[at + i] === v)
  const text = (at: number, s: string) =>
    is(
      at,
      Array.from(s, (c) => c.charCodeAt(0)),
    )
  if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (is(0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (text(0, 'RIFF') && text(8, 'WEBP')) return 'webp'
  if (text(4, 'ftyp')) return isoBrand(b)
  // A bare codestream, or one in its container.
  if (is(0, [0xff, 0x0a]) || is(0, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) return 'jxl'
  if (text(0, 'GIF8')) return 'gif'
  if (text(0, 'BM')) return 'bmp'
  if (is(0, [0x49, 0x49, 42, 0]) || is(0, [0x4d, 0x4d, 0, 42])) return 'tiff'
  return null
}

/** An ISO BMFF file's major brand, or failing that its compatible brands (a plain `mif1` file says what it
 * holds there). */
function isoBrand(b: Uint8Array): Sniffed | null {
  const brand = (at: number) => String.fromCharCode(...b.subarray(at, at + 4))
  const size = Math.min(b.length, (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3])
  const brands = [brand(8)]
  for (let at = 16; at + 4 <= size; at += 4) brands.push(brand(at))
  if (HEIC_BRANDS.includes(brands[0])) return 'heic'
  if (brands.some((x) => AVIF_BRANDS.includes(x))) return 'avif'
  if (brands.some((x) => HEIC_BRANDS.includes(x))) return 'heic'
  return null
}

/** ExifTool's FileType for every camera raw format Loupe opens (SPEC.md section 3), and a few relatives. */
const RAW_TYPES = new Set([
  'DNG', 'CR2', 'CR3', 'CRW', 'NEF', 'NRW', 'ARW', 'SR2', 'SRF', 'RAF', 'ORF', 'ORI', 'RW2', 'RWL', 'PEF', 'SRW',
  '3FR', 'IIQ', 'X3F', 'ERF', 'MEF', 'MOS', 'MRW', 'DCR', 'KDC',
]) // prettier-ignore

/** The format Loupe treats a file as: raw when ExifTool says so, else what the bytes say. Null for anything
 * that isn't a picture Loupe opens. */
export function formatOf(sniffed: Sniffed | null, fileType: string | null): Format | null {
  if (fileType && RAW_TYPES.has(fileType.toUpperCase())) return 'raw'
  return sniffed
}

const EXTENSIONS: Record<Sniffed, string[]> = {
  jpeg: ['jpg', 'jpeg', 'jpe', 'jfif'],
  png: ['png'],
  webp: ['webp'],
  avif: ['avif'],
  heic: ['heic', 'heif', 'hif'],
  jxl: ['jxl'],
  gif: ['gif'],
  bmp: ['bmp', 'dib'],
  tiff: ['tif', 'tiff'],
}

const NAMES: Partial<Record<Format, string>> = { webp: 'WebP', jxl: 'JPEG XL' }

/** The format's name for display: ExifTool's FileType ('HEIC', 'NEF'…), tidied where it adds detail. */
export function formatName(format: Format, fileType: string): string {
  return NAMES[format] ?? (format === 'raw' || format === 'heic' ? fileType : format.toUpperCase())
}

/** The extension a file of this format usually has; a raw file's is its type's. */
export function expectedExtension(format: Format, fileType: string): string {
  return format === 'raw' ? fileType.toLowerCase() : EXTENSIONS[format][0]
}

/** The name's extension and the one expected, when the name's doesn't fit the bytes. */
export function extensionMismatch(
  name: string,
  format: Format,
  fileType: string,
): { given: string; expected: string } | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  const given = name.slice(dot + 1)
  const fits = format === 'raw' ? [fileType.toLowerCase()] : EXTENSIONS[format]
  if (fits.includes(given.toLowerCase())) return null
  return { given, expected: expectedExtension(format, fileType) }
}

/** A WebP whose image is lossless (VP8L), alone or after VP8X and its chunks. */
export function isLosslessWebp(b: Uint8Array): boolean {
  if (sniff(b) !== 'webp') return false
  for (const { fourcc } of riffChunks(b)) {
    if (fourcc === 'VP8L') return true
    if (fourcc === 'VP8 ' || fourcc === 'ANMF') return false
  }
  return false
}
