import { beforeAll, describe, expect, it } from 'vitest'
import { jpegSegments, view } from '@/lib/containers'
import { jpegtran } from './jpegtran'
import { fixture, useNodeJpegtran } from './node'

/** The frame's stored width and height. */
function size(b: Uint8Array): [number, number] {
  for (const { marker, data } of jpegSegments(b))
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return [view(data).getUint16(3), view(data).getUint16(1)]
  throw new Error('No frame header.')
}

const hasExif = (b: Uint8Array) =>
  [...jpegSegments(b)].some((s) => s.marker === 0xe1 && String.fromCharCode(...s.data.subarray(0, 4)) === 'Exif')

beforeAll(useNodeJpegtran)

describe('jpegtran', () => {
  it('turns a picture whose edges are whole blocks', async () => {
    expect(size(fixture('grid-420.jpg'))).toEqual([64, 48])
    expect(size(await jpegtran(fixture('grid-420.jpg'), { transform: 'rotate-90', perfect: true }))).toEqual([48, 64])
    expect(size(await jpegtran(fixture('grid-420.jpg'), { transform: 'flip-horizontal', perfect: true }))).toEqual([
      64, 48,
    ])
  })

  it('refuses an imperfect turn with perfect, and trims the partial blocks with trim', async () => {
    // 40 × 24 with 16 px blocks: a quarter turn clockwise moves the partial bottom row to the left.
    await expect(jpegtran(fixture('orient-6.jpg'), { transform: 'rotate-90', perfect: true })).rejects.toThrow(
      'not perfect',
    )
    expect(size(await jpegtran(fixture('orient-6.jpg'), { transform: 'rotate-90', trim: true }))).toEqual([16, 40])
    // Transposing keeps the partial edges at the right and bottom.
    expect(size(await jpegtran(fixture('orient-6.jpg'), { transform: 'transpose', perfect: true }))).toEqual([24, 40])
  })

  it('crops after the turn, in the turned picture', async () => {
    const out = await jpegtran(fixture('grid-444.jpg'), {
      transform: 'rotate-270',
      crop: { x: 8, y: 16, width: 24, height: 20 },
    })
    expect(size(out)).toEqual([24, 20])
  })

  it('copies every marker or none', async () => {
    expect(hasExif(fixture('orient-6.jpg'))).toBe(true)
    expect(hasExif(await jpegtran(fixture('orient-6.jpg'), { transform: 'none', copy: 'all' }))).toBe(true)
    expect(hasExif(await jpegtran(fixture('orient-6.jpg'), { transform: 'none' }))).toBe(false)
  })

  it('says what was wrong with bytes it can’t read, and carries on', async () => {
    await expect(jpegtran(new Uint8Array([1, 2, 3]), { transform: 'rotate-90' })).rejects.toThrow(
      /jpegtran couldn’t turn this picture: Not a JPEG file/,
    )
    expect(size(await jpegtran(fixture('grid-444.jpg'), { transform: 'rotate-180' }))).toEqual([64, 48])
  })
})
