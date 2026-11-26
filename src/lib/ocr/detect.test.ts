import { describe, expect, it } from 'vitest'
import { rgba } from '../pixels'
import { detectorInput, findLines, type ProbabilityMap } from './detect'

const SETTINGS = { threshold: 0.3, boxThreshold: 0.6, unclipRatio: 1.5 }

/** A map `width` × `height` of zeros, with `value` in each [x0, y0, x1, y1) block. */
function map(width: number, height: number, blocks: [number, number, number, number, number][]): ProbabilityMap {
  const data = new Float32Array(width * height)
  for (const [x0, y0, x1, y1, value] of blocks)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = value
  return { width, height, data }
}

describe('detectorInput', () => {
  it('scales the long side to 960 at most and rounds each side to a multiple of 32', () => {
    expect(
      detectorInput(
        rgba(2000, 1000, () => [0, 0, 0, 255]),
        960,
      ),
    ).toMatchObject({ width: 960, height: 480 })
    expect(
      detectorInput(
        rgba(100, 50, () => [0, 0, 0, 255]),
        960,
      ),
    ).toMatchObject({ width: 96, height: 64 })
    expect(
      detectorInput(
        rgba(4, 3, () => [0, 0, 0, 255]),
        960,
      ),
    ).toMatchObject({ width: 32, height: 32 })
  })

  it('normalises each channel by ImageNet’s mean and spread, in PaddleOCR’s blue, green, red order', () => {
    const { data, width, height } = detectorInput(
      rgba(32, 32, () => [255, 0, 0, 255]),
      960,
    )
    const plane = width * height
    expect(data[0]).toBeCloseTo((0 - 0.485) / 0.229) // blue
    expect(data[plane]).toBeCloseTo((0 - 0.456) / 0.224) // green
    expect(data[2 * plane]).toBeCloseTo((1 - 0.406) / 0.225) // red
  })

  it('reads transparent pixels as white, so text on a transparent PNG shows', () => {
    const { data, width, height } = detectorInput(
      rgba(32, 32, () => [0, 0, 0, 0]),
      960,
    )
    expect(data[2 * width * height]).toBeCloseTo((1 - 0.406) / 0.225)
  })
})

describe('findLines', () => {
  it('turns a region above the threshold into its box, grown by the unclip ratio', () => {
    // 20 × 4 pixels: their centres span 19 × 3; 57 × 1.5 ÷ 44 = 1.94 more on each side.
    const quads = findLines(map(40, 20, [[5, 8, 25, 12, 0.9]]), SETTINGS, { width: 40, height: 20 })
    expect(quads).toEqual([
      [
        { x: 3, y: 6 },
        { x: 26, y: 6 },
        { x: 26, y: 13 },
        { x: 3, y: 13 },
      ],
    ])
  })

  it('gives the box in the picture’s pixels', () => {
    const [quad] = findLines(map(40, 20, [[5, 8, 25, 12, 0.9]]), SETTINGS, { width: 400, height: 200 })
    expect(quad[0]).toEqual({ x: 31, y: 61 })
    expect(quad[2]).toEqual({ x: 259, y: 129 })
  })

  it('finds each line apart, and drops faint and tiny regions', () => {
    const quads = findLines(
      map(60, 40, [
        [5, 4, 50, 9, 0.9], // a line
        [5, 20, 30, 25, 0.95], // another
        [5, 30, 30, 35, 0.4], // above the threshold, but its mean is under the box threshold
        [40, 30, 42, 32, 0.9], // too small
      ]),
      SETTINGS,
      { width: 60, height: 40 },
    )
    expect(quads.map((q) => q[0].y)).toEqual([1, 17])
  })

  it('joins pixels that touch only at a corner into one region', () => {
    const quads = findLines(
      map(60, 20, [
        [5, 5, 20, 10, 0.9],
        [20, 10, 40, 15, 0.9],
      ]),
      // The two blocks fill only half their box, so its threshold is lowered here.
      { ...SETTINGS, boxThreshold: 0.1 },
      { width: 60, height: 20 },
    )
    expect(quads).toHaveLength(1)
  })
})
