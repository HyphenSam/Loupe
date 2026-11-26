import { describe, expect, it } from 'vitest'
import { adjust, NEUTRAL } from './adjust'
import {
  crop,
  downscale,
  edgeAfter,
  fitArea,
  flipHorizontal,
  flatten,
  flipVertical,
  hasAlpha,
  innerRect,
  orient,
  pixelAt,
  rgba,
  rotateLeft,
  rotateRight,
  scaleToFit,
  straighten,
  compose,
  transform,
} from './pixels'

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

describe('turns', () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8] as const

  it('composes two turns into the one that does both', () => {
    // Composing on the picture itself agrees with orient applied twice.
    for (const a of all)
      for (const b of all)
        expect(reds(orient(numbered(), compose(a, b)))).toEqual(reds(orient(orient(numbered(), a), b)))
  })

  it('turns and flips the picture as it stands', () => {
    expect(rotateRight(1)).toBe(6)
    expect(rotateLeft(1)).toBe(8)
    expect(rotateRight(rotateRight(1))).toBe(3)
    expect(rotateLeft(rotateRight(1))).toBe(1)
    expect(flipHorizontal(1)).toBe(2)
    expect(flipVertical(1)).toBe(4)
    // Turned right, then flipped left to right: the picture is mirrored across its main diagonal.
    expect(flipHorizontal(rotateRight(1))).toBe(5)
    expect(flipHorizontal(flipHorizontal(6))).toBe(6)
  })

  it('says where an edge ends up', () => {
    expect(edgeAfter('right', 1)).toBe('right')
    expect(edgeAfter('right', 2)).toBe('left')
    expect(edgeAfter('bottom', 6)).toBe('left')
    expect(edgeAfter('right', 6)).toBe('bottom')
    expect(edgeAfter('right', 8)).toBe('top')
    expect(edgeAfter('bottom', 5)).toBe('right')
  })
})

describe('crop', () => {
  it('keeps the pixels inside the rectangle exactly', () => {
    expect(reds(crop(numbered(), { x: 1, y: 0, width: 2, height: 2 }))).toEqual([
      [1, 2],
      [4, 5],
    ])
    expect(reds(crop(numbered(), { x: 0, y: 1, width: 1, height: 1 }))).toEqual([[3]])
  })
})

describe('straighten', () => {
  const gradient = rgba(40, 30, (x, y) => [x * 6, y * 8, 128, 255])

  it('leaves the picture alone at 0°', () => {
    expect(straighten(gradient, 0).data).toEqual(gradient.data)
  })

  it('turns about the centre with bicubic resampling, keeping the size', () => {
    const turned = straighten(gradient, 90)
    expect([turned.width, turned.height]).toEqual([40, 30])
    // Clockwise: what was left of the centre is now above it. A whole turn lands on whole pixels, which
    // bicubic weights copy exactly.
    expect(pixelAt(turned, 20, 10)).toEqual(pixelAt(gradient, 15, 14))
    // Between pixels, the weights sum to one, so a linear gradient comes through near its true value.
    const middle = pixelAt(straighten(gradient, 5), 20, 15)!
    expect(middle[0]).toBeGreaterThan(110)
    expect(middle[0]).toBeLessThan(125)
  })

  it('keeps colour under transparent pixels from bleeding', () => {
    const half = rgba(8, 8, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 255, 0, 0]))
    const turned = straighten(half, 3)
    const [r, g, , a] = pixelAt(turned, 3, 4)!
    expect(a).toBeGreaterThan(0)
    expect(r).toBeGreaterThan(200)
    expect(g).toBeLessThan(40)
  })
})

describe('innerRect', () => {
  it('is the whole picture at 0°', () => {
    expect(innerRect(4000, 3000, 0)).toEqual({ x: 0, y: 0, width: 4000, height: 3000 })
  })

  it('is the largest centred rectangle of the aspect inside the turned picture', () => {
    const r = innerRect(4000, 3000, 10)
    expect(r.width / r.height).toBeCloseTo(4 / 3, 2)
    // Its corners lie inside the picture turned 10° about its centre.
    const t = (10 * Math.PI) / 180
    for (const [dx, dy] of [
      [-r.width / 2, -r.height / 2],
      [r.width / 2, -r.height / 2],
      [r.width / 2, r.height / 2],
      [-r.width / 2, r.height / 2],
    ]) {
      expect(Math.abs(dx * Math.cos(t) + dy * Math.sin(t))).toBeLessThanOrEqual(2000)
      expect(Math.abs(-dx * Math.sin(t) + dy * Math.cos(t))).toBeLessThanOrEqual(1500)
    }
    expect(r.x).toBe(Math.floor((4000 - r.width) / 2))
    expect(r.width).toBeGreaterThan(3200)
    expect(innerRect(4000, 3000, -10)).toEqual(r)
    const square = innerRect(4000, 3000, 10, 1)
    expect(square.width).toBe(square.height)
  })
})

describe('transform', () => {
  it('turns, straightens and crops in that order', () => {
    const out = transform(numbered(), [
      { type: 'turn', orientation: 6 },
      { type: 'crop', rect: { x: 0, y: 1, width: 2, height: 2 } },
    ])
    expect(reds(out)).toEqual([
      [4, 1],
      [5, 2],
    ])
  })

  it('redacts boxes', () => {
    const out = transform(numbered(), [{ type: 'redact', boxes: [{ x: 1, y: 0, width: 1, height: 2 }], fill: 'black' }])
    expect(reds(out)).toEqual([
      [0, 0, 2],
      [3, 0, 5],
    ])
  })

  it('adjusts the picture', () => {
    const adjustments = { ...NEUTRAL, exposure: 1, saturation: -40 }
    const source = numbered()
    expect(transform(source, [{ type: 'adjust', adjustments }]).data).toEqual(adjust(source, adjustments).data)
  })
})

describe('flatten', () => {
  it('puts the picture over white, opaque (Bytesize’s)', () => {
    const pixels = [
      [0, 0, 0, 0],
      [200, 100, 0, 255],
      [0, 0, 0, 128],
    ]
    const image = rgba(3, 1, (x) => pixels[x])
    const out = flatten(image)
    expect(Array.from(out.data)).toEqual([255, 255, 255, 255, 200, 100, 0, 255, 127, 127, 127, 255])
    expect(hasAlpha(out)).toBe(false)
    expect(hasAlpha(image)).toBe(true)
    // The original is left alone.
    expect(image.data[3]).toBe(0)
  })
})
