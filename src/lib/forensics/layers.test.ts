import { describe, expect, it } from 'vitest'
import { rgba } from '../pixels'
import { errorLevels } from './ela'
import { amplify, LAYER_LIMITS, DEFAULT_LAYERS } from './layer'
import { noiseResidual } from './noise'

const grey = (width: number, height: number, values: number[]) => ({ width, height, data: Uint8Array.from(values) })

describe('errorLevels', () => {
  it('is zero where the resaved picture is the same', () => {
    const p = rgba(3, 2, (x, y) => [x * 50, y * 70, 90, 255])
    expect(Array.from(errorLevels(p, p).data)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('is each pixel’s change in brightness (luma), whichever way', () => {
    const before = rgba(2, 2, () => [100, 100, 100, 255])
    const after = rgba(2, 2, (x, y) =>
      x === 1 && y === 0
        ? [110, 110, 110, 255]
        : x === 0 && y === 1
          ? [200, 100, 100, 255]
          : x === 1 && y === 1
            ? [100, 50, 100, 255]
            : [100, 100, 100, 255],
    )
    // Rec. 601: 0.299 R + 0.587 G + 0.114 B.
    expect(errorLevels(before, after)).toEqual(grey(2, 2, [0, 10, 30, 29]))
  })

  it('ignores alpha, which JPEG doesn’t keep', () => {
    const before = rgba(1, 1, () => [5, 5, 5, 0])
    const after = rgba(1, 1, () => [5, 5, 5, 255])
    expect(errorLevels(before, after).data[0]).toBe(0)
  })

  it('refuses pictures of different sizes', () => {
    expect(() =>
      errorLevels(
        rgba(2, 2, () => [0, 0, 0, 255]),
        rgba(2, 3, () => [0, 0, 0, 255]),
      ),
    ).toThrow()
  })
})

describe('noiseResidual', () => {
  it('is zero on a flat picture', () => {
    expect(noiseResidual(rgba(4, 4, () => [80, 80, 80, 255])).data.every((v) => v === 0)).toBe(true)
  })

  it('is a lone dot’s difference from its neighbours’ median, and zero around it', () => {
    const dotted = rgba(5, 5, (x, y) => (x === 2 && y === 2 ? [200, 200, 200, 255] : [50, 50, 50, 255]))
    const residual = noiseResidual(dotted)
    expect(residual.data[2 * 5 + 2]).toBe(150)
    expect(Array.from(residual.data).filter((v) => v > 0)).toEqual([150])
  })

  it('is zero along a smooth ramp and a clean edge, edges of the picture included', () => {
    expect(noiseResidual(rgba(6, 4, (x) => [x * 20, x * 20, x * 20, 255])).data.every((v) => v === 0)).toBe(true)
    expect(
      noiseResidual(rgba(6, 4, (x) => (x < 3 ? [0, 0, 0, 255] : [100, 100, 100, 255]))).data.every((v) => v === 0),
    ).toBe(true)
  })

  it('works on luma: a red dot counts for its brightness', () => {
    const red = rgba(3, 3, (x, y) => (x === 1 && y === 1 ? [255, 0, 0, 255] : [0, 0, 0, 255]))
    expect(noiseResidual(red).data[4]).toBe(76)
  })

  it('agrees with sorting each neighbourhood, on noise', () => {
    let seed = 7
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256
    const p = rgba(23, 17, () => {
      const v = random()
      return [v, v, v, 255]
    })
    const at = (x: number, y: number) => p.data[(Math.min(16, Math.max(0, y)) * 23 + Math.min(22, Math.max(0, x))) * 4]
    const expected: number[] = []
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < 23; x++) {
        const around = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => at(x + dx, y + dy))).sort((a, b) => a - b)
        expected.push(Math.abs(at(x, y) - around[4]))
      }
    expect(Array.from(noiseResidual(p).data)).toEqual(expected)
  })

  it('takes pictures one or two pixels across', () => {
    expect(noiseResidual(rgba(1, 1, () => [9, 9, 9, 255]))).toEqual(grey(1, 1, [0]))
    expect(noiseResidual(rgba(2, 1, (x) => [x * 90, x * 90, x * 90, 255])).data).toHaveLength(2)
  })
})

describe('amplify', () => {
  it('multiplies each value into an opaque grey picture, stopping at white', () => {
    const out = amplify(grey(3, 1, [0, 4, 20]), 20)
    expect(out.width).toBe(3)
    expect(Array.from(out.data)).toEqual([0, 0, 0, 255, 80, 80, 80, 255, 255, 255, 255, 255])
  })
})

describe('the layers’ sliders', () => {
  it('start where SPEC.md says, inside their ranges', () => {
    expect(DEFAULT_LAYERS).toEqual({ quality: 90, brightness: 20, noise: 10 })
    expect(LAYER_LIMITS.quality).toEqual({ min: 70, max: 95 })
    for (const key of ['quality', 'brightness', 'noise'] as const) {
      expect(DEFAULT_LAYERS[key]).toBeGreaterThanOrEqual(LAYER_LIMITS[key].min)
      expect(DEFAULT_LAYERS[key]).toBeLessThanOrEqual(LAYER_LIMITS[key].max)
    }
  })
})
