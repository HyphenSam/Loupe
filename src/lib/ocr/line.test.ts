import { describe, expect, it } from 'vitest'
import { rgba, type Pixels } from '../pixels'
import { resize } from './image'
import { cutLine, recogniserInput, turnTall } from './line'

const reds = (p: Pixels) => {
  const rows: number[][] = []
  for (let y = 0; y < p.height; y++) rows.push(Array.from({ length: p.width }, (_, x) => p.data[(y * p.width + x) * 4]))
  return rows
}

// 6 × 4, each pixel's red its number: 10 × y + x.
const numbered = () => rgba(6, 4, (x, y) => [10 * y + x, 0, 0, 255])

describe('cutLine', () => {
  it('cuts an upright box as it is', () => {
    const line = cutLine(numbered(), [
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
      { x: 1, y: 3 },
    ])
    expect(reds(line)).toEqual([
      [11, 12, 13],
      [21, 22, 23],
    ])
  })

  it('straightens a box by its corners: one whose top runs down the picture comes out level', () => {
    // The line's top left is the picture's (2, 0), its top right (2, 3): text running downwards.
    const line = cutLine(numbered(), [
      { x: 2, y: 0 },
      { x: 2, y: 3 },
      { x: 0, y: 3 },
      { x: 0, y: 0 },
    ])
    expect(reds(line)).toEqual([
      [2, 12, 22],
      [1, 11, 21],
    ])
  })
})

describe('turnTall', () => {
  it('turns a line a quarter anticlockwise when it’s at least 1.5 times taller than wide', () => {
    const tall = rgba(2, 3, (x, y) => [10 * y + x, 0, 0, 255])
    expect(reds(turnTall(tall)!)).toEqual([
      [1, 11, 21],
      [0, 10, 20],
    ])
    expect(turnTall(rgba(2, 2, () => [0, 0, 0, 255]))).toBeNull()
  })
})

describe('resize', () => {
  it('averages the pixels each one covers when shrinking, and blends neighbours when enlarging', () => {
    const p = rgba(4, 1, (x) => [[0, 100, 200, 100][x], 0, 0, 255])
    expect(reds(resize(p, 2, 1))).toEqual([[50, 150]])
    expect(
      reds(
        resize(
          rgba(2, 1, (x) => [x * 100, 0, 0, 255]),
          4,
          1,
        ),
      ),
    ).toEqual([[0, 25, 75, 100]])
  })
})

describe('recogniserInput', () => {
  it('scales the line to 48 px high and pads it to at least 320 wide', () => {
    const input = recogniserInput(rgba(100, 24, () => [255, 255, 255, 255]))
    expect(input.width).toBe(320)
    const plane = 48 * 320
    expect(input.data).toHaveLength(3 * plane)
    // White is 1 after (v ÷ 255 − 0.5) ÷ 0.5; the padding is 0. 100 × 2 = 200 columns hold the line.
    expect(input.data[199]).toBeCloseTo(1)
    expect(input.data[200]).toBe(0)
    expect(input.data[2 * plane + 199]).toBeCloseTo(1)
  })

  it('keeps a long line’s whole width', () => {
    expect(recogniserInput(rgba(960, 48, () => [0, 0, 0, 255])).width).toBe(960)
  })

  it('reads in blue, green, red order', () => {
    const { data, width } = recogniserInput(rgba(48, 48, () => [255, 0, 0, 255]))
    expect(data[0]).toBeCloseTo(-1)
    expect(data[2 * 48 * width]).toBeCloseTo(1)
  })
})
