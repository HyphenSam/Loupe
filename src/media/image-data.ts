/** For tests only: the bytes of a file's picture without its metadata, so a test can check that a lossless
 * job copied the picture as it was (SPEC.md 6.0). Never imported by the app.
 *
 * - JPEG: every segment but APPn and COM, then the scans up to the first EOI (the primary picture).
 * - PNG: IHDR, PLTE, tRNS, IDAT and APNG's fdAT chunks' data.
 * - WebP: the VP8, VP8L, ALPH, ANIM and ANMF chunks.
 * - GIF: the global colour table, graphic control blocks and image blocks.
 * - JPEG XL: the codestream, bare or in its container's jxlc or jxlp boxes.
 * - HEIF and AVIF: each coded item's data (iloc's extents), leaving out Exif and XMP items.
 * - TIFF: IFD0's strips or tiles.
 *
 * Raw files give null: their picture data sits in maker-specific places. */
import { ascii, concat, pngChunks, riffChunks, view } from '@/lib/containers'
import { sniff } from '@/lib/formats'

export function imageData(b: Uint8Array): Uint8Array | null {
  switch (sniff(b)) {
    case 'jpeg':
      return jpeg(b)
    case 'png':
      return concat(
        [...pngChunks(b)].filter((c) => ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'fdAT'].includes(c.type)).map((c) => c.data),
      )
    case 'webp':
      return concat(
        [...riffChunks(b)]
          .filter((c) => ['VP8 ', 'VP8L', 'ALPH', 'ANIM', 'ANMF'].includes(c.fourcc))
          .map((c) => c.data),
      )
    case 'gif':
      return gif(b)
    case 'jxl':
      return jxl(b)
    case 'heic':
    case 'avif':
      return heif(b)
    case 'tiff':
      // Raw files built on TIFF can point outside what they hold; those give nothing to compare.
      try {
        return tiff(b)
      } catch {
        return null
      }
    default:
      return null
  }
}

function jpeg(b: Uint8Array): Uint8Array {
  const v = view(b)
  const parts: Uint8Array[] = []
  let at = 2
  while (at + 4 <= b.length && b[at] === 0xff) {
    const marker = b[at + 1]
    if (marker === 0xff) {
      at++
      continue
    }
    if (marker === 0xda) {
      // Entropy-coded data stuffs every 0xFF with a zero or a restart marker, so the first FFD9 ends it.
      let end = at + 2
      while (end + 1 < b.length && !(b[end] === 0xff && b[end + 1] === 0xd9)) end++
      parts.push(b.subarray(at, end + 2))
      break
    }
    const end = at + 2 + v.getUint16(at + 2)
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) parts.push(b.subarray(at, end))
    at = end
  }
  return concat(parts)
}

function gif(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = []
  const table = (flags: number) => (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0)
  const blocks = (at: number) => {
    while (at < b.length && b[at] !== 0) at += b[at] + 1
    return at + 1
  }
  let at = 13 + table(b[10])
  parts.push(b.subarray(13, at))
  while (at < b.length && b[at] !== 0x3b) {
    const start = at
    if (b[at] === 0x2c) {
      at = blocks(at + 10 + table(b[at + 9]) + 1)
      parts.push(b.subarray(start, at))
    } else if (b[at] === 0x21) {
      const label = b[at + 1]
      at = blocks(at + 2)
      if (label === 0xf9) parts.push(b.subarray(start, at))
    } else return null
  }
  return concat(parts)
}

/** ISO BMFF boxes from `start` to `end`: their type and their content. */
function* boxes(b: Uint8Array, start = 0, end = b.length): Generator<{ type: string; data: Uint8Array }> {
  const v = view(b)
  let at = start
  while (at + 8 <= end) {
    let size = v.getUint32(at)
    let header = 8
    if (size === 1) {
      size = Number(v.getBigUint64(at + 8))
      header = 16
    } else if (size === 0) size = end - at
    if (size < header || at + size > end) return
    yield { type: ascii(b, at + 4, 4), data: b.subarray(at + header, at + size) }
    at += size
  }
}

function jxl(b: Uint8Array): Uint8Array {
  if (b[0] === 0xff && b[1] === 0x0a) return b
  const parts: Uint8Array[] = []
  for (const box of boxes(b)) {
    if (box.type === 'jxlc') parts.push(box.data)
    if (box.type === 'jxlp') parts.push(box.data.subarray(4)) // after its index
  }
  return concat(parts)
}

function heif(b: Uint8Array): Uint8Array | null {
  const meta = [...boxes(b)].find((box) => box.type === 'meta')?.data
  if (!meta) return null
  const children = [...boxes(meta, 4)] // after the full box's version and flags
  const types = itemTypes(children.find((c) => c.type === 'iinf')?.data)
  const idat = children.find((c) => c.type === 'idat')?.data
  const iloc = children.find((c) => c.type === 'iloc')?.data
  if (!iloc) return null
  const parts: Uint8Array[] = []
  for (const item of locations(iloc)) {
    if (['Exif', 'mime', 'uri '].includes(types.get(item.id) ?? '')) continue
    for (const [offset, length] of item.extents) {
      const source = item.method === 1 ? idat! : b
      parts.push(source.subarray(item.base + offset, item.base + offset + length))
    }
  }
  return concat(parts)
}

/** Each item's type, from `iinf`'s `infe` boxes (version 2 and 3). */
function itemTypes(iinf: Uint8Array | undefined): Map<number, string> {
  const types = new Map<number, string>()
  if (!iinf) return types
  for (const infe of boxes(iinf, iinf[0] === 0 ? 6 : 8)) {
    const v = view(infe.data)
    const version = infe.data[0]
    if (version < 2) continue
    const id = version === 2 ? v.getUint16(4) : v.getUint32(4)
    types.set(id, ascii(infe.data, version === 2 ? 8 : 10, 4))
  }
  return types
}

type Location = { id: number; method: number; base: number; extents: [number, number][] }

/** `iloc`'s items, each with its construction method, base offset and extents. */
function locations(iloc: Uint8Array): Location[] {
  const v = view(iloc)
  const version = iloc[0]
  const [offsetSize, lengthSize] = [iloc[4] >> 4, iloc[4] & 15]
  const [baseSize, indexSize] = [iloc[5] >> 4, version ? iloc[5] & 15 : 0]
  let at = 6
  const read = (n: number) => {
    const value = n === 8 ? Number(v.getBigUint64(at)) : n === 4 ? v.getUint32(at) : n === 2 ? v.getUint16(at) : 0
    at += n
    return value
  }
  const count = read(version < 2 ? 2 : 4)
  const items: Location[] = []
  for (let i = 0; i < count; i++) {
    const id = read(version < 2 ? 2 : 4)
    const method = version ? read(2) & 15 : 0
    read(2) // data reference index
    const base = read(baseSize)
    const extents: [number, number][] = []
    for (let n = read(2); n > 0; n--) {
      read(indexSize)
      extents.push([read(offsetSize), read(lengthSize)])
    }
    items.push({ id, method, base, extents })
  }
  return items
}

function tiff(b: Uint8Array): Uint8Array | null {
  const v = view(b)
  const little = b[0] === 0x49
  const u16 = (at: number) => v.getUint16(at, little)
  const u32 = (at: number) => v.getUint32(at, little)
  const ifd = u32(4)
  const values = new Map<number, number[]>()
  for (let i = 0; i < u16(ifd); i++) {
    const at = ifd + 2 + i * 12
    const [tag, type, count] = [u16(at), u16(at + 2), u32(at + 4)]
    // Only the strips' and tiles' offsets and lengths are numbers this reads; XMP and IPTC are long byte runs.
    if (![273, 279, 324, 325].includes(tag)) continue
    const size = type === 3 ? 2 : 4
    const from = count * size > 4 ? u32(at + 8) : at + 8
    values.set(
      tag,
      Array.from({ length: count }, (_, k) => (size === 2 ? u16(from + k * 2) : u32(from + k * 4))),
    )
  }
  const offsets = values.get(273) ?? values.get(324)
  const lengths = values.get(279) ?? values.get(325)
  if (!offsets || !lengths) return null
  return concat(offsets.map((offset, i) => b.subarray(offset, offset + lengths[i])))
}
