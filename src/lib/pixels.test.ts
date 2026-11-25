import { describe, expect, it } from 'vitest'
import { downscale, fitArea, orient, pixelAt, rgba, scaleToFit } from './pixels'

// A 3 × 2 picture whose pixels are numbered 0–5 in their red channel, row by row:
//   0 1 2
//   3 4 5
const numbered = () => rgba(3, 2, (x, y) => [y * 3 + x, 0, 0, 255])
const reds = (p: ReturnType<typeof numbered>) => {
  const rows: number[][] = []
  for (let y = 0; y < p.height; y++) rows.push(Array.from({ length: p.width }, (_, x) => p.data[(y * p.width + x) * 4]))
  return rows
}

describe('orient', () => {
  it('leaves an upright picture alone', () => {
    expect(reds(orient(numbered(), 1))).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ])
  })

  it('turns and mirrors for each EXIF orientation', () => {
    expect(reds(orient(numbered(), 2))).toEqual([
      [2, 1, 0],
      [5, 4, 3],
    ])
    expect(reds(orient(numbered(), 3))).toEqual([
      [5, 4, 3],
      [2, 1, 0],
    ])
    expect(reds(orient(numbered(), 4))).toEqual([
      [3, 4, 5],
      [0, 1, 2],
    ])
    expect(reds(orient(numbered(), 5))).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
    ])
    // Orientation 6: the stored picture is turned 90° clockwise to stand upright.
    expect(reds(orient(numbered(), 6))).toEqual([
      [3, 0],
      [4, 1],
      [5, 2],
    ])
    expect(reds(orient(numbered(), 7))).toEqual([
      [5, 2],
      [4, 1],
      [3, 0],
    ])
    expect(reds(orient(numbered(), 8))).toEqual([
      [2, 5],
      [1, 4],
      [0, 3],
    ])
  })
})

describe('pixelAt', () => {
  it('reads one pixel’s channels', () => {
    const p = rgba(2, 2, (x, y) => [x * 10, y * 10, 7, 200])
    expect(pixelAt(p, 1, 1)).toEqual([10, 10, 7, 200])
    expect(pixelAt(p, 2, 0)).toBe(null)
    expect(pixelAt(p, -1, 0)).toBe(null)
  })
})

describe('downscale', () => {
  it('averages each block of source pixels into one', () => {
    const p = rgba(4, 2, (x) => (x < 2 ? [0, 0, 0, 255] : [200, 100, 50, 255]))
    const small = downscale(p, 2)
    expect([small.width, small.height]).toEqual([2, 1])
    expect(pixelAt(small, 0, 0)).toEqual([0, 0, 0, 255])
    expect(pixelAt(small, 1, 0)).toEqual([200, 100, 50, 255])
  })

  it('handles sizes that don’t divide evenly', () => {
    const p = rgba(5, 3, () => [10, 20, 30, 255])
    const small = downscale(p, 2)
    expect([small.width, small.height]).toEqual([2, 1])
    expect(pixelAt(small, 1, 0)).toEqual([10, 20, 30, 255])
  })

  it('returns the picture itself when it already fits', () => {
    const p = rgba(4, 2, () => [1, 2, 3, 4])
    expect(downscale(p, 4)).toBe(p)
  })
})

describe('fitArea', () => {
  it('fits a picture within a number of pixels', () => {
    expect(fitArea(8000, 6000, 16_777_216)).toBe(4729)
    expect(fitArea(4000, 3000, 16_777_216)).toBe(4000)
  })
})

describe('scaleToFit', () => {
  it('fits the longer side within the limit, never enlarging', () => {
    expect(scaleToFit(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(scaleToFit(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 })
    expect(scaleToFit(640, 480, 2048)).toEqual({ width: 640, height: 480 })
  })

  it('keeps at least one pixel', () => {
    expect(scaleToFit(10_000, 1, 100)).toEqual({ width: 100, height: 1 })
  })
})
