import { describe, expect, it } from 'vitest'
import { jpegGrid, onGrid, partialEdges, snapRect } from './mcu'
import { fakeInfo } from './testing'

const jpeg = (width: number, height: number, mcu: [number, number], orientation: 1 | 6 = 1) => {
  const info = fakeInfo({ width, height, orientation })
  return { ...info, jpeg: { ...info.jpeg!, mcu: { width: mcu[0], height: mcu[1] } } }
}

describe('jpegGrid', () => {
  it('is the block grid from the top left when nothing moves the partial edges', () => {
    expect(jpegGrid(jpeg(64, 48, [8, 8]), 1)).toEqual({ width: 8, height: 8, x: 0, y: 0 })
    // Transposing keeps the partial edges right and bottom.
    expect(jpegGrid(jpeg(40, 24, [16, 16]), 5)).toEqual({ width: 16, height: 16, x: 0, y: 0 })
  })

  it('turns with the picture, starting after a partial strip moved to the left or top', () => {
    // 4:2:2 blocks are 16 wide and 8 high; turned, 8 wide and 16 high.
    expect(jpegGrid(jpeg(64, 48, [16, 8]), 6)).toEqual({ width: 8, height: 16, x: 0, y: 0 })
    // Stored 40 × 24 and shown turned clockwise: the partial bottom row (8 px) is the left of the upright picture.
    expect(jpegGrid(jpeg(40, 24, [16, 16], 6), 1)).toEqual({ width: 16, height: 16, x: 8, y: 0 })
    // Flipped as well, both partial edges end up left and top.
    expect(jpegGrid(jpeg(40, 24, [16, 16]), 3)).toEqual({ width: 16, height: 16, x: 8, y: 8 })
  })

  it('is null without a JPEG', () => {
    expect(jpegGrid(fakeInfo({ format: 'png', jpeg: null }), 1)).toBe(null)
  })
})

describe('partialEdges', () => {
  it('names the partial edges a turn would have to trim, as the picture first stood', () => {
    expect(partialEdges(jpeg(64, 48, [16, 16]), 6)).toEqual([])
    expect(partialEdges(jpeg(40, 24, [16, 16]), 1)).toEqual([])
    expect(partialEdges(jpeg(40, 24, [16, 16]), 2)).toEqual([{ edge: 'right', px: 8 }])
    expect(partialEdges(jpeg(40, 24, [16, 16], 6), 1)).toEqual([{ edge: 'left', px: 8 }])
    expect(partialEdges(jpeg(47, 24, [16, 16]), 3)).toEqual([
      { edge: 'right', px: 15 },
      { edge: 'bottom', px: 8 },
    ])
  })
})

describe('snapRect', () => {
  const grid = { width: 16, height: 16, x: 8, y: 0 }

  it('moves the left and top edges to the nearest grid line, keeping the right and bottom', () => {
    const snapped = snapRect({ x: 13, y: 5, width: 20, height: 20 }, grid)
    expect(snapped).toEqual({ x: 8, y: 0, width: 25, height: 25 })
    expect(onGrid(snapped, grid)).toBe(true)
    expect(snapRect({ x: 20, y: 12, width: 20, height: 20 }, grid)).toEqual({ x: 24, y: 16, width: 16, height: 16 })
  })

  it('snaps back a line rather than past the opposite edge', () => {
    expect(snapRect({ x: 30, y: 0, width: 2, height: 2 }, { width: 16, height: 16, x: 0, y: 0 })).toEqual({
      x: 16,
      y: 0,
      width: 16,
      height: 2,
    })
  })

  it('leaves a crop inside the partial strip where it is', () => {
    const inside = { x: 2, y: 0, width: 4, height: 16 }
    expect(snapRect(inside, grid)).toEqual(inside)
    expect(onGrid(inside, grid)).toBe(false)
  })
})

describe('onGrid', () => {
  it('needs the left and top edges on grid lines', () => {
    const grid = { width: 16, height: 16, x: 8, y: 0 }
    expect(onGrid({ x: 24, y: 32, width: 3, height: 3 }, grid)).toBe(true)
    expect(onGrid({ x: 16, y: 32, width: 3, height: 3 }, grid)).toBe(false)
    expect(onGrid({ x: 24, y: 8, width: 3, height: 3 }, grid)).toBe(false)
  })
})
