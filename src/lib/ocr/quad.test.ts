import { describe, expect, it } from 'vitest'
import { convexHull, minAreaRect, orderCorners, unclip } from './quad'

const round = (points: { x: number; y: number }[]) => points.map(({ x, y }) => ({ x: +x.toFixed(3), y: +y.toFixed(3) }))

describe('convexHull', () => {
  it('keeps the outside points, anticlockwise on screen from the lowest x', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 1 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 1, y: 1 },
      { x: 0, y: 3 },
    ]
    expect(new Set(convexHull(points).map(({ x, y }) => `${x},${y}`))).toEqual(new Set(['0,0', '4,0', '4,3', '0,3']))
  })
})

describe('minAreaRect', () => {
  it('fits an upright rectangle to its corners', () => {
    const rect = minAreaRect([
      { x: 5, y: 8 },
      { x: 24, y: 8 },
      { x: 24, y: 11 },
      { x: 5, y: 11 },
    ])
    expect(Math.max(rect.width, rect.height)).toBeCloseTo(19)
    expect(Math.min(rect.width, rect.height)).toBeCloseTo(3)
    expect(rect.centre).toEqual({ x: 14.5, y: 9.5 })
  })

  it('turns with a tilted line: the smallest box around its points', () => {
    // A 10 × 2 rectangle turned 30°.
    const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]
    const corners = [
      [0, 0],
      [10, 0],
      [10, 2],
      [0, 2],
    ].map(([x, y]) => ({ x: x * c - y * s, y: x * s + y * c }))
    const rect = minAreaRect(corners)
    expect(rect.width * rect.height).toBeCloseTo(20)
    expect(Math.min(rect.width, rect.height)).toBeCloseTo(2)
  })
})

describe('orderCorners', () => {
  it('orders a box’s corners from the top left, clockwise, as PaddleOCR does', () => {
    const corners = [
      { x: 24, y: 11 },
      { x: 5, y: 8 },
      { x: 5, y: 11 },
      { x: 24, y: 8 },
    ]
    expect(orderCorners(corners)).toEqual([
      { x: 5, y: 8 },
      { x: 24, y: 8 },
      { x: 24, y: 11 },
      { x: 5, y: 11 },
    ])
  })
})

describe('unclip', () => {
  it('grows each side by area × ratio ÷ perimeter, as the shrunk text the detector was taught on needs', () => {
    // 100 × 10: 1000 × 1.5 ÷ 220 = 6.818 on every side.
    const quad = unclip(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 10 },
        { x: 0, y: 10 },
      ],
      1.5,
    )
    expect(round(quad)).toEqual([
      { x: -6.818, y: -6.818 },
      { x: 106.818, y: -6.818 },
      { x: 106.818, y: 16.818 },
      { x: -6.818, y: 16.818 },
    ])
  })
})
