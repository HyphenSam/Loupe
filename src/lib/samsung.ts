/** Samsung's trailer (`SEFH`…`SEFT`), which its phones and Gallery write after a JPEG's or PNG's picture: its blocks,
 * and the drawing Gallery's editor keeps there so its edits can be undone. Pure: bytes and text in, plain data out. */
import { ascii, view } from './containers'
import type { Pixels } from './pixels'

/** A block's type, its name, and where its data (after the name) is in the file. */
export type SamsungBlock = { type: number; name: string; offset: number; length: number }

export type SamsungTrailer = { offset: number; length: number; blocks: SamsungBlock[] }

/** Gallery's photo editor writes every block it keeps for undoing edits with this type: the edit data
 * (`PhotoEditor_Re_Edit_Data`), the drawing's tiles (`deco_doodle_bitmap`) and `Original_Path_Hash_Key`. */
export const PHOTO_EDITOR = 0x0ba1

/** Samsung's trailer at the end of the file, or null. Its `SEFH` directory sits before an 8-byte footer (its length,
 * `SEFT`) and places each block by its distance back from the directory; the trailer starts at the farthest. Read
 * as ExifTool's Samsung.pm does, stopping at the first entry that doesn't fit. */
export function samsungTrailer(b: Uint8Array): SamsungTrailer | null {
  const n = b.length
  if (n < 20 || ascii(b, n - 4, 4) !== 'SEFT') return null
  const v = view(b)
  const length = v.getUint32(n - 8, true)
  const directory = n - 8 - length
  if (length < 12 || directory < 0 || ascii(b, directory, 4) !== 'SEFH') return null
  const count = v.getUint32(directory + 8, true)
  if (12 + 12 * count > length) return null
  const blocks: SamsungBlock[] = []
  let start = directory
  for (let i = 0; i < count; i++) {
    const entry = directory + 12 + 12 * i
    const back = v.getUint32(entry + 4, true)
    const size = v.getUint32(entry + 8, true)
    if (back > directory || size > back || size < 8) return null
    const at = directory - back
    const nameLength = v.getUint32(at + 4, true)
    if (nameLength + 8 > size) return null
    blocks.push({
      type: v.getUint16(entry + 2, true),
      name: ascii(b, at + 8, nameLength),
      offset: at + 8 + nameLength,
      length: size - 8 - nameLength,
    })
    start = Math.min(start, at)
  }
  return { offset: start, length: n - start, blocks }
}

/** One stroke of a drawing: where its own grid sits in the drawing, its tiles' size, the strip row its first tile
 * starts at, and each tile's place on its grid (row, column), in the order the strip holds them. */
export type Stroke = { left: number; top: number; start: number; size: number; blocks: [number, number][] }

export type Drawing = { width: number; height: number; strokes: Stroke[] }

/** Gallery nests JSON in strings, a level deep at a time; a field may come either way. */
const nested = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value)
const list = (value: unknown): Record<string, unknown>[] => {
  const parsed = nested(value)
  return Array.isArray(parsed) ? parsed : []
}
const count = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Not a count.')
  return value
}

/** The drawings in Gallery's edit data (`PhotoEditor_Re_Edit_Data`), each with its strokes; none when it has none
 * or can't be read. */
export function drawingsOf(edit: string): Drawing[] {
  try {
    const doodles = nested((nested(edit) as Record<string, unknown>).doodleEditInfo) as Record<string, unknown>
    return list(doodles?.arrays).map((d) => ({
      width: count(d.bmpWidth),
      height: count(d.bmpHeight),
      strokes: list(d.strokeInfoList).map((s) => {
        const save = nested(s.mSaveInfo) as Record<string, unknown>
        const blocks = String(save.mBlockInfo)
          .split('_')
          .filter(Boolean)
          .map((pair) => pair.split(':').map(Number) as [number, number])
        return {
          left: count(s.mLeft),
          top: count(s.mTop),
          start: count(s.startIndex),
          size: count(save.mBlockSize),
          blocks,
        }
      }),
    }))
  } catch {
    return []
  }
}

/** A drawing put back together from the strip of tiles Gallery stores it as (`deco_doodle_bitmap`, one tile under
 * the next), each stroke's tiles laid over the earlier strokes. Tiles past the drawing's edges or the strip's end
 * are left out. */
export function rebuildDrawing(strip: Pixels, drawing: Drawing): Pixels {
  const { width, height } = drawing
  const data = new Uint8ClampedArray(width * height * 4)
  for (const { left, top, start, size, blocks } of drawing.strokes)
    blocks.forEach(([row, column], i) => {
      const from = start + i * size
      if (from + size > strip.height) return
      for (let y = 0; y < size; y++)
        for (let x = 0; x < Math.min(size, strip.width); x++) {
          const [tx, ty] = [left + column * size + x, top + row * size + y]
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
          over(data, (ty * width + tx) * 4, strip.data, ((from + y) * strip.width + x) * 4)
        }
    })
  return { width, height, data }
}

/** Source over destination, in straight (not premultiplied) alpha, as PNG stores it. */
function over(dst: Uint8ClampedArray, d: number, src: Uint8ClampedArray, s: number) {
  const sa = src[s + 3] / 255
  if (sa === 0) return
  const da = dst[d + 3] / 255
  const a = sa + da * (1 - sa)
  for (let c = 0; c < 3; c++) dst[d + c] = Math.round((src[s + c] * sa + dst[d + c] * da * (1 - sa)) / a)
  dst[d + 3] = Math.round(a * 255)
}
