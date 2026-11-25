import { describe, expect, it } from 'vitest'
import { downscale, rgba, type Pixels } from '../pixels'
import { greyThumbnail, hashDistance, perceptualHash, sameness, thumbnailCheck, trimBars } from './phash'

/** A made-up scene with structure at several scales: a lit sky, a dark hill, a sun and some stripes. */
const scene = (width = 320, height = 240) =>
  rgba(width, height, (x, y) => {
    const u = x / width
    const v = y / height
    let grey = 200 - 120 * v
    if (v > 0.6 + 0.15 * Math.sin(u * 6)) grey = 60 + 30 * u
    if ((u - 0.7) ** 2 + (v - 0.25) ** 2 < 0.01) grey = 250
    if (u < 0.3 && v > 0.15 && v < 0.45 && Math.floor(u * 40) % 2 === 0) grey = 30
    return [grey, grey * 0.9, grey * 0.8, 255]
  })

/** Another scene, unrelated to the first. */
const other = (width = 320, height = 240) =>
  rgba(width, height, (x, y) => {
    const g = 128 + 100 * Math.sin(x / 23) * Math.cos(y / 31) + (x > width / 2 ? 20 : -20)
    return [g, g, g, 255]
  })

/** Deterministic noise of up to ±`amount`, as recompression adds. */
function noisy(p: Pixels, amount: number): Pixels {
  let seed = 12345
  const next = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  const data = p.data.map((v, i) => (i % 4 === 3 ? v : v + Math.round(next() * amount)))
  return { ...p, data: new Uint8ClampedArray(data) }
}

/** Each 8 × 8 block flattened to its mean: the worst of what heavy JPEG compression does. */
function blocky(p: Pixels): Pixels {
  const data = new Uint8ClampedArray(p.data)
  for (let by = 0; by < p.height; by += 8)
    for (let bx = 0; bx < p.width; bx += 8)
      for (let c = 0; c < 3; c++) {
        let sum = 0
        let n = 0
        for (let y = by; y < Math.min(by + 8, p.height); y++)
          for (let x = bx; x < Math.min(bx + 8, p.width); x++, n++) sum += p.data[(y * p.width + x) * 4 + c]
        for (let y = by; y < Math.min(by + 8, p.height); y++)
          for (let x = bx; x < Math.min(bx + 8, p.width); x++) data[(y * p.width + x) * 4 + c] = sum / n
      }
  return { ...p, data }
}

function crop(p: Pixels, left: number, top: number, width: number, height: number): Pixels {
  return rgba(width, height, (x, y) =>
    Array.from(p.data.subarray(((y + top) * p.width + x + left) * 4, ((y + top) * p.width + x + left) * 4 + 4)),
  )
}

const mirrored = (p: Pixels) =>
  rgba(p.width, p.height, (x, y) => {
    const i = (y * p.width + p.width - 1 - x) * 4
    return Array.from(p.data.subarray(i, i + 4))
  })

const distance = (a: Pixels, b: Pixels) => hashDistance(perceptualHash(a), perceptualHash(b))

describe('greyThumbnail', () => {
  it('averages each part of the picture into a 32 × 32 grey copy, by luma', () => {
    const half = rgba(64, 64, (x) => (x < 32 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    const grey = greyThumbnail(half)
    expect(grey.length).toBe(32 * 32)
    expect(grey[0]).toBeCloseTo(255)
    expect(grey[15]).toBeCloseTo(255)
    expect(grey[16]).toBeCloseTo(0)
    expect(grey[31 * 32 + 31]).toBeCloseTo(0)
    // Green weighs most: 0.299 R + 0.587 G + 0.114 B.
    expect(greyThumbnail(rgba(32, 32, () => [0, 255, 0, 255]))[0]).toBeCloseTo(149.685)
  })

  it('shares out pixels that straddle two cells, so any size works, smaller ones too', () => {
    const stripes = rgba(48, 3, (x) => (x % 3 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    const grey = greyThumbnail(stripes)
    // Each cell covers one and a half pixels; every cell's mean lies between black and white.
    for (const v of grey) expect(v).toBeGreaterThanOrEqual(0)
    expect(grey.reduce((a, b) => a + b, 0) / grey.length).toBeCloseTo(85, 0)
    const tiny = greyThumbnail(rgba(2, 2, (x, y) => [x * 255, x * 255, x * 255, y * 0 + 255]))
    expect(tiny[0]).toBeCloseTo(0)
    expect(tiny[31]).toBeCloseTo(255)
  })
})

describe('perceptualHash', () => {
  it('is 64 bits as 16 hexadecimal digits, the same for the same picture', () => {
    const hash = perceptualHash(scene())
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(perceptualHash(scene())).toBe(hash)
  })

  it('is the same, or nearly, for the picture resized', () => {
    expect(distance(scene(), downscale(scene(), 160))).toBeLessThanOrEqual(2)
    expect(distance(scene(), downscale(scene(), 64))).toBeLessThanOrEqual(4)
    expect(distance(scene(), scene(640, 480))).toBeLessThanOrEqual(2)
  })

  it('is nearly the same for the picture recompressed', () => {
    expect(distance(scene(), noisy(scene(), 8))).toBeLessThanOrEqual(4)
    expect(distance(scene(), blocky(scene()))).toBeLessThanOrEqual(4)
  })

  it('stays within 10 bits for a light crop and moves past it for a heavy one', () => {
    expect(distance(scene(), crop(scene(), 6, 4, 308, 232))).toBeLessThanOrEqual(10)
    expect(distance(scene(), crop(scene(), 120, 0, 200, 240))).toBeGreaterThan(10)
  })

  it('is far apart for different pictures, and for the picture mirrored', () => {
    expect(distance(scene(), other())).toBeGreaterThan(20)
    expect(distance(scene(), mirrored(scene()))).toBeGreaterThan(20)
  })

  it('gives a flat picture a hash all the same', () => {
    expect(perceptualHash(rgba(10, 10, () => [90, 90, 90, 255]))).toMatch(/^(0{16}|f{16})$/)
  })
})

describe('hashDistance', () => {
  it('counts the bits that differ', () => {
    expect(hashDistance('0000000000000000', '0000000000000000')).toBe(0)
    expect(hashDistance('0000000000000000', 'ffffffffffffffff')).toBe(64)
    expect(hashDistance('8000000000000001', '0000000000000000')).toBe(2)
    expect(hashDistance('00000000000000f0', '000000000000000f')).toBe(8)
  })
})

describe('sameness', () => {
  it('is the same picture up to 10 bits, similar up to 20, different past that', () => {
    expect(sameness(0)).toBe('same')
    expect(sameness(10)).toBe('same')
    expect(sameness(11)).toBe('similar')
    expect(sameness(20)).toBe('similar')
    expect(sameness(21)).toBe('different')
  })
})

describe('trimBars', () => {
  it('trims black bars along any edge', () => {
    const letterboxed = rgba(40, 30, (_x, y) => (y < 5 || y >= 25 ? [0, 0, 0, 255] : [120, 130, 140, 255]))
    expect(trimBars(letterboxed)).toMatchObject({ width: 40, height: 20 })
    const pillarboxed = rgba(40, 30, (x) => (x < 3 || x >= 38 ? [8, 8, 8, 255] : [120, 130, 140, 255]))
    expect(trimBars(pillarboxed)).toMatchObject({ width: 35, height: 30 })
  })

  it('leaves a picture without bars, and an all-black one, as it is', () => {
    const p = scene(40, 30)
    expect(trimBars(p)).toBe(p)
    const black = rgba(10, 10, () => [0, 0, 0, 255])
    expect(trimBars(black)).toBe(black)
  })
})

describe('thumbnailCheck', () => {
  it('matches a thumbnail made from the picture', () => {
    const check = thumbnailCheck(scene(), downscale(scene(), 160))
    expect(check.matches).toBe(true)
    expect(check.distance).toBeLessThanOrEqual(2)
  })

  it('matches a thumbnail padded with black bars to another shape', () => {
    const wide = scene(320, 180)
    const small = downscale(wide, 160)
    const padded = rgba(160, 120, (x, y) => {
      const sy = y - 15
      if (sy < 0 || sy >= small.height) return [0, 0, 0, 255]
      const i = (sy * small.width + x) * 4
      return Array.from(small.data.subarray(i, i + 4))
    })
    expect(thumbnailCheck(wide, padded).matches).toBe(true)
  })

  it('doesn’t match a thumbnail of a different shape, as a cropped picture keeps', () => {
    const whole = scene(320, 240)
    const cropped = crop(whole, 40, 0, 240, 240)
    const check = thumbnailCheck(cropped, downscale(whole, 160))
    expect(check.matches).toBe(false)
    expect(check.aspectDiffers).toBe(true)
  })

  it('doesn’t match a thumbnail of the same shape showing something else', () => {
    const check = thumbnailCheck(scene(), downscale(other(), 160))
    expect(check).toMatchObject({ matches: false, aspectDiffers: false })
    expect(check.distance).toBeGreaterThan(10)
  })

  it('allows a 1% difference in shape, as rounding a thumbnail’s size gives', () => {
    expect(thumbnailCheck(scene(400, 300), downscale(scene(400, 300), 159)).aspectDiffers).toBe(false)
    expect(thumbnailCheck(scene(400, 300), scene(160, 118)).aspectDiffers).toBe(true)
  })
})
