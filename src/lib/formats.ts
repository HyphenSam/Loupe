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

/** Whether the picture is stored losslessly: PNG, GIF and BMP always; WebP and JPEG XL when they say so. */
export function isLossless(format: Format, b: Uint8Array): boolean {
  if (format === 'png' || format === 'gif' || format === 'bmp') return true
  if (format === 'webp') return isLosslessWebp(b)
  if (format === 'jxl') return isLosslessJxl(b)
  return false
}

/** A JPEG XL whose image metadata says it isn't XYB-encoded: what libjxl writes for lossless pictures, and never
 * for lossy ones. False when the header can't be read this far (a preview in the way, say). */
export function isLosslessJxl(b: Uint8Array): boolean {
  const codestream = jxlCodestream(b)
  if (!codestream) return false
  try {
    return !xybEncoded(new Bits(codestream.subarray(2)))
  } catch {
    return false
  }
}

/** The codestream's first bytes: the file itself, or its container's `jxlc` or first `jxlp` box. */
function jxlCodestream(b: Uint8Array): Uint8Array | null {
  if (b[0] === 0xff && b[1] === 0x0a) return b
  if (sniff(b) !== 'jxl') return null
  for (let at = 0; at + 8 <= b.length;) {
    const size = ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const type = String.fromCharCode(...b.subarray(at + 4, at + 8))
    const end = size === 0 ? b.length : at + size
    if (type === 'jxlc') return b.subarray(at + 8, end)
    if (type === 'jxlp') return b.subarray(at + 12, end)
    if (size < 8) return null
    at = end
  }
  return null
}

/** JPEG XL's bit reader: least significant bit first. */
class Bits {
  at = 0
  constructor(private bytes: Uint8Array) {}
  u(n: number): number {
    let value = 0
    for (let i = 0; i < n; i++, this.at++) {
      const byte = this.bytes[this.at >> 3]
      if (byte === undefined) throw new Error('The header ends early.')
      value += ((byte >> (this.at & 7)) & 1) * 2 ** i
    }
    return value
  }
  bool = () => this.u(1) === 1
  /** U32: two bits choose one of four distributions, each a value or [bits, offset]. */
  u32(...d: (number | [number, number])[]): number {
    const pick = d[this.u(2)]
    return typeof pick === 'number' ? pick : this.u(pick[0]) + pick[1]
  }
}

function skipSize(r: Bits) {
  const small = r.bool()
  const dimension = () => (small ? r.u(5) : r.u32([9, 1], [13, 1], [18, 1], [30, 1]))
  dimension()
  if (r.u(3) === 0) dimension()
}

function skipBitDepth(r: Bits) {
  if (r.bool()) {
    r.u32(32, 16, 24, [6, 1])
    r.u(4)
  } else r.u32(8, 10, 12, [6, 1])
}

/** ImageMetadata up to xyb_encoded (the JPEG XL spec, A.6), after the SizeHeader. */
function xybEncoded(r: Bits): boolean {
  skipSize(r)
  if (r.bool()) return true // all_default
  if (r.bool()) {
    // extra_fields: orientation, an intrinsic size, a preview (not read here), an animation.
    r.u(3)
    if (r.bool()) skipSize(r)
    if (r.bool()) throw new Error('A preview header isn’t read here.')
    if (r.bool()) {
      r.u32(100, 1000, [10, 1], [30, 1])
      r.u32(1, 1001, [8, 1], [10, 1])
      r.u32(0, [3, 0], [16, 0], [32, 0])
      r.u(1)
    }
  }
  skipBitDepth(r)
  r.u(1) // modular_16bit_buffers
  const extra = r.u32(0, 1, [4, 2], [12, 1])
  for (let i = 0; i < extra; i++) {
    if (r.bool()) continue // d_alpha: a default alpha channel
    const type = r.u32(0, 1, [4, 2], [6, 18])
    skipBitDepth(r)
    r.u32(0, 3, 4, [3, 1]) // dim_shift
    r.u(8 * r.u32(0, [4, 0], [5, 16], [10, 48])) // name
    if (type === 0) r.u(1) // alpha_associated
    if (type === 2) r.u(64) // a spot colour's four F16s
    if (type === 5) r.u32(1, [2, 0], [4, 3], [8, 19]) // cfa_channel
  }
  return r.bool()
}
