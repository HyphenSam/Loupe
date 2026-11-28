import { describe, expect, it } from 'vitest'
import { bytesOf, concat } from './containers'
import { drawingsOf, rebuildDrawing, samsungTrailer, type Drawing } from './samsung'
import { samsungTrailerBytes } from './testing'

const PICTURE = bytesOf('picture bytes')
const PNG = concat([bytesOf('\x89PNG\r\n\x1a\n'), new Uint8Array(20)])
const EDIT = bytesOf('{"originalPath":"/data/sec/photoeditor/0/a.png"}')

describe('samsungTrailer', () => {
  it('lists each block’s type, name and where its data is', () => {
    const trailer = samsungTrailerBytes([
      { type: 0x0ba1, name: 'deco_doodle_bitmap', data: PNG },
      { type: 0x0ba1, name: 'PhotoEditor_Re_Edit_Data', data: EDIT },
    ])
    const found = samsungTrailer(concat([PICTURE, trailer]))
    expect(found).toEqual({
      offset: PICTURE.length,
      length: trailer.length,
      blocks: [
        { type: 0x0ba1, name: 'deco_doodle_bitmap', offset: PICTURE.length + 8 + 18, length: PNG.length },
        {
          type: 0x0ba1,
          name: 'PhotoEditor_Re_Edit_Data',
          offset: PICTURE.length + 8 + 18 + PNG.length + 8 + 24,
          length: EDIT.length,
        },
      ],
    })
  })

  it('finds nothing without SEFT at the end or SEFH where its length says', () => {
    const trailer = samsungTrailerBytes([{ type: 0x0ba1, name: 'x', data: EDIT }])
    expect(samsungTrailer(PICTURE)).toBe(null)
    expect(samsungTrailer(new Uint8Array(0))).toBe(null)
    expect(samsungTrailer(concat([PICTURE, trailer, bytesOf('after')]))).toBe(null)
    const moved = trailer.slice()
    moved[moved.length - 8] += 1
    expect(samsungTrailer(concat([PICTURE, moved]))).toBe(null)
  })

  it('stops at a block placed before the start of the file, as ExifTool does', () => {
    const trailer = samsungTrailerBytes([{ type: 0x0ba1, name: 'x', data: EDIT }])
    // The one entry's distance back, made larger than the file.
    const bad = trailer.slice()
    const entry = bad.length - 8 - 12 + 4
    bad.set([0xff, 0xff, 0xff, 0x7f], entry)
    expect(samsungTrailer(concat([PICTURE, bad]))).toBe(null)
  })

  it('stops at a name longer than its block', () => {
    const trailer = samsungTrailerBytes([{ type: 0x0ba1, name: 'x', data: EDIT }])
    const bad = trailer.slice()
    bad.set([0xff, 0xff, 0, 0], 4)
    expect(samsungTrailer(concat([PICTURE, bad]))).toBe(null)
  })
})

/** Samsung Gallery's edit data around one drawing, nested as it writes it: JSON holding JSON in strings. */
function editData(width: number, height: number, strokes: object[]) {
  const arrays = [{ rect: '0_0_4_4', bmpWidth: width, bmpHeight: height, strokeInfoList: JSON.stringify(strokes) }]
  return JSON.stringify({ doodleEditInfo: JSON.stringify({ arrays: JSON.stringify(arrays) }) })
}

const stroke = (left: number, top: number, start: number, blocks: string) => ({
  mLeft: left,
  mTop: top,
  startIndex: start,
  mSaveInfo: JSON.stringify({ mBlockSize: 2, mBlockInfo: blocks }),
})

describe('drawingsOf', () => {
  it('reads each drawing’s size and its strokes’ tiles', () => {
    const edit = editData(4, 4, [stroke(0, 0, 0, '0:0_1:1_'), stroke(2, 0, 4, '1:0_')])
    expect(drawingsOf(edit)).toEqual([
      {
        width: 4,
        height: 4,
        strokes: [
          { left: 0, top: 0, start: 0, size: 2, blocks: [[0, 0], [1, 1]] }, // prettier-ignore
          { left: 2, top: 0, start: 4, size: 2, blocks: [[1, 0]] },
        ],
      },
    ])
  })

  it('reads mSaveInfo given as an object too', () => {
    const edit = editData(4, 4, [{ ...stroke(0, 0, 0, '0:0'), mSaveInfo: { mBlockSize: 2, mBlockInfo: '0:0' } }])
    expect(drawingsOf(edit)[0].strokes[0].blocks).toEqual([[0, 0]])
  })

  it('finds no drawing in edit data without one, or that isn’t JSON', () => {
    expect(drawingsOf(JSON.stringify({ doodleEditInfo: JSON.stringify({ arrays: '[]' }) }))).toEqual([])
    expect(drawingsOf('{"originalPath":"a"}')).toEqual([])
    expect(drawingsOf('not json')).toEqual([])
    expect(drawingsOf('')).toEqual([])
    expect(drawingsOf(JSON.stringify({ doodleEditInfo: '{"arrays":"[{\\"bmpWidth\\":\\"wide\\"}]"}' }))).toEqual([])
  })
})

describe('rebuildDrawing', () => {
  // Tiles 2 px square, stacked down a strip 2 px wide: red, green, then half-transparent blue.
  const strip = { width: 2, height: 6, data: new Uint8ClampedArray(2 * 6 * 4) }
  const colours = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 128],
  ]
  for (let i = 0; i < 12; i++) strip.data.set(colours[Math.floor(i / 4)], i * 4)
  const at = (p: { width: number; data: Uint8ClampedArray }, x: number, y: number) => [
    ...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4),
  ]

  it('lays each stroke’s tiles on its block grid, later strokes over earlier ones', () => {
    const drawing: Drawing = {
      width: 4,
      height: 4,
      strokes: [
        { left: 0, top: 0, start: 0, size: 2, blocks: [[0, 0], [1, 1]] }, // prettier-ignore
        { left: 2, top: 0, start: 4, size: 2, blocks: [[1, 0]] },
      ],
    }
    const out = rebuildDrawing(strip, drawing)
    expect(out.width).toBe(4)
    expect(out.height).toBe(4)
    expect(at(out, 0, 0)).toEqual([255, 0, 0, 255])
    expect(at(out, 1, 1)).toEqual([255, 0, 0, 255])
    expect(at(out, 2, 0)).toEqual([0, 0, 0, 0])
    // Half-transparent blue over green.
    expect(at(out, 2, 2)).toEqual([0, 127, 128, 255])
    expect(at(out, 3, 3)).toEqual([0, 127, 128, 255])
  })

  it('leaves out tiles past the drawing’s edges or the strip’s end', () => {
    // Green, clipped to one pixel; blue, off the right edge; a third tile past the strip's end.
    const drawing: Drawing = {
      width: 3,
      height: 3,
      strokes: [{ left: 2, top: 2, start: 2, size: 2, blocks: [[0, 0], [0, 1], [0, 0]] }], // prettier-ignore
    }
    const out = rebuildDrawing(strip, drawing)
    const expected = new Uint8ClampedArray(3 * 3 * 4)
    expected.set([0, 255, 0, 255], (2 * 3 + 2) * 4)
    expect(out.data).toEqual(expected)
  })
})
