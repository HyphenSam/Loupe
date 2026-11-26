import { describe, expect, it } from 'vitest'
import {
  aspectCrop,
  cropSettings,
  dragCrop,
  fieldCrop,
  fits,
  gridChip,
  gridOf,
  nudgeCrop,
  snapCrop,
  startCrop,
  straightenCrop,
  toUpright,
  turnCrop,
  type CropTool,
} from './crop'
import { fakeInfo } from './testing'

// 4032 × 3024 with 16 px blocks.
const photo = fakeInfo()
const png = fakeInfo({
  name: 'shot.png',
  format: 'png',
  lossless: true,
  jpeg: null,
  width: 400,
  height: 300,
  displayWidth: 400,
  displayHeight: 300,
})
const at = (tool: CropTool, crop: CropTool['crop']) => ({ ...tool, crop })

describe('startCrop', () => {
  it('frames the whole upright picture, free, snapping JPEGs', () => {
    expect(startCrop(photo)).toEqual({
      turn: 1,
      straighten: 0,
      crop: { x: 0, y: 0, width: 4032, height: 3024 },
      aspect: 'free',
      portrait: false,
      snap: true,
      partial: 'trim',
      output: null,
    })
    expect(startCrop(fakeInfo({ orientation: 6, displayWidth: 3024, displayHeight: 4032 })).crop).toEqual({
      x: 0,
      y: 0,
      width: 3024,
      height: 4032,
    })
  })
})

describe('cropSettings', () => {
  it('is what the planner takes', () => {
    const tool = { ...startCrop(photo), turn: 6 as const, partial: 'reencode' as const }
    expect(cropSettings(tool)).toEqual({
      turn: 6,
      straighten: 0,
      crop: { x: 0, y: 0, width: 4032, height: 3024 },
      partial: 'reencode',
      output: null,
    })
    const avif = { format: 'avif' as const, quality: 70, lossless: false }
    expect(cropSettings({ ...tool, output: avif }).output).toEqual(avif)
  })
})

describe('gridOf', () => {
  it('is the JPEG’s block grid while snapping and not straightening', () => {
    expect(gridOf(startCrop(photo), photo)).toEqual({ width: 16, height: 16, x: 0, y: 0 })
    expect(gridOf({ ...startCrop(photo), snap: false }, photo)).toBe(null)
    expect(gridOf({ ...startCrop(photo), straighten: 1 }, photo)).toBe(null)
    expect(gridOf(startCrop(png), png)).toBe(null)
  })

  it('says so on the stage', () => {
    expect(gridChip({ width: 16, height: 16, x: 0, y: 0 })).toBe('On the 16 px grid: lossless')
    expect(gridChip({ width: 16, height: 8, x: 0, y: 0 })).toBe('On the 16 × 8 px grid: lossless')
  })
})

describe('turnCrop', () => {
  const tool = at(startCrop(photo), { x: 16, y: 32, width: 96, height: 48 })

  it('turns the frame with the picture', () => {
    // Turned right, the picture is 3024 wide; the frame's top-left goes to the top-right.
    expect(turnCrop(tool, photo, 'right')).toMatchObject({ turn: 6, crop: { x: 2944, y: 16, width: 48, height: 96 } })
    expect(turnCrop(tool, photo, 'left')).toMatchObject({ turn: 8, crop: { x: 32, y: 3920, width: 48, height: 96 } })
    expect(turnCrop(tool, photo, 'horizontal')).toMatchObject({ turn: 2, crop: { x: 3920, y: 32 } })
    expect(turnCrop(tool, photo, 'vertical')).toMatchObject({ turn: 4, crop: { x: 16, y: 2944 } })
  })

  it('keeps a fixed aspect on the frame, and the straightening on the picture', () => {
    const square = { ...tool, aspect: '4:3' as const, straighten: 2 }
    expect(turnCrop(square, photo, 'right')).toMatchObject({ portrait: true, straighten: 2 })
    // Mirrored, the picture leans the other way.
    expect(turnCrop(square, photo, 'horizontal')).toMatchObject({ portrait: false, straighten: -2 })
    // The original aspect is the turned picture’s own, so it turns by itself.
    expect(turnCrop({ ...tool, aspect: 'original' }, photo, 'right')).toMatchObject({ portrait: false })
  })

  it('snaps the turned frame to the grid', () => {
    expect(turnCrop(at(tool, { x: 16, y: 30, width: 96, height: 40 }), photo, 'right').crop).toEqual({
      x: 2960,
      y: 16,
      width: 40,
      height: 96,
    })
  })
})

describe('straightenCrop', () => {
  it('shrinks the frame to the largest of its aspect inside the turned picture', () => {
    const tool = straightenCrop(startCrop(photo), photo, 10)
    expect(tool.straighten).toBe(10)
    expect(tool.crop.width / tool.crop.height).toBeCloseTo(4 / 3, 2)
    expect(tool.crop.width).toBeLessThan(4032)
    expect(fits(tool.crop, { width: 4032, height: 3024 }, 10)).toBe(true)
    // Back to level, the whole picture again.
    expect(straightenCrop(tool, photo, 0).crop).toEqual({ x: 0, y: 0, width: 4032, height: 3024 })
    const square = straightenCrop({ ...startCrop(photo), aspect: '1:1' }, photo, -5).crop
    expect(square.width).toBe(square.height)
  })
})

describe('aspectCrop', () => {
  it('frames the largest of the aspect, centred and snapped', () => {
    expect(aspectCrop(startCrop(photo), photo, '1:1').crop).toEqual({ x: 496, y: 0, width: 3024, height: 3024 })
    expect(aspectCrop(startCrop(photo), photo, '4:3', true)).toMatchObject({
      aspect: '4:3',
      portrait: true,
      crop: { x: 880, y: 0, width: 2268, height: 3024 },
    })
    expect(aspectCrop(startCrop(png), png, '16:9').crop).toEqual({ x: 0, y: 37, width: 400, height: 225 })
  })

  it('leaves the frame as it is for Free', () => {
    const tool = at(startCrop(photo), { x: 16, y: 32, width: 96, height: 48 })
    expect(aspectCrop(tool, photo, 'free').crop).toEqual(tool.crop)
  })
})

describe('snapCrop', () => {
  it('snaps the frame when switched on', () => {
    const tool = at({ ...startCrop(photo), snap: false }, { x: 21, y: 30, width: 96, height: 48 })
    expect(snapCrop(tool, photo, true)).toMatchObject({ snap: true, crop: { x: 16, y: 32, width: 96, height: 48 } })
    expect(snapCrop(tool, photo, false).crop).toEqual(tool.crop)
  })
})

describe('dragCrop', () => {
  const from = { x: 100, y: 100, width: 200, height: 100 }
  const free = at(startCrop(png), from)

  it('moves the frame, inside the picture', () => {
    expect(dragCrop(free, png, from, 'move', 13, -4).crop).toEqual({ x: 113, y: 96, width: 200, height: 100 })
    // Against the left edge it slides along it.
    expect(dragCrop(free, png, from, 'move', -1000, 7).crop).toEqual({ x: 0, y: 107, width: 200, height: 100 })
    expect(dragCrop(free, png, from, 'move', 1000, 1000).crop).toEqual({ x: 200, y: 200, width: 200, height: 100 })
  })

  it('moves an edge or a corner, keeping the opposite one', () => {
    expect(dragCrop(free, png, from, 'se', 50, 20).crop).toEqual({ x: 100, y: 100, width: 250, height: 120 })
    expect(dragCrop(free, png, from, 'nw', 10, -30).crop).toEqual({ x: 110, y: 70, width: 190, height: 130 })
    expect(dragCrop(free, png, from, 'e', 10000, 0).crop).toEqual({ x: 100, y: 100, width: 300, height: 100 })
    // Never smaller than a pixel.
    expect(dragCrop(free, png, from, 'w', 500, 0).crop).toEqual({ x: 299, y: 100, width: 1, height: 100 })
  })

  it('keeps a fixed aspect', () => {
    const square = at({ ...free, aspect: '1:1' }, { x: 100, y: 100, width: 100, height: 100 })
    expect(dragCrop(square, png, square.crop, 'se', 50, 10).crop).toEqual({ x: 100, y: 100, width: 150, height: 150 })
    // An edge grows the other side about its middle.
    expect(dragCrop(square, png, square.crop, 'e', 20, 0).crop).toEqual({ x: 100, y: 90, width: 120, height: 120 })
    // Stopped by the picture’s edge, both sides stop.
    expect(dragCrop(square, png, square.crop, 'se', 1000, 1000).crop).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    })
  })

  it('snaps the left and top edges to the grid', () => {
    const tool = at(startCrop(photo), from)
    expect(dragCrop(tool, photo, from, 'move', 13, 0).crop).toEqual({ x: 112, y: 96, width: 200, height: 100 })
    expect(dragCrop(tool, photo, from, 'nw', 5, 0).crop).toEqual({ x: 112, y: 96, width: 188, height: 104 })
    // The right and bottom edges go anywhere.
    expect(dragCrop(tool, photo, { ...from, x: 96, y: 96 }, 'se', 3, 5).crop).toEqual({
      x: 96,
      y: 96,
      width: 203,
      height: 105,
    })
  })

  it('stays inside the straightened picture', () => {
    const tool = straightenCrop(startCrop(png), png, 10)
    const grown = dragCrop(tool, png, tool.crop, 'se', 100, 100).crop
    expect(fits(grown, { width: 400, height: 300 }, 10)).toBe(true)
    expect(grown.width).toBeGreaterThanOrEqual(tool.crop.width)
    const moved = dragCrop(tool, png, tool.crop, 'move', -100, 0).crop
    expect(fits(moved, { width: 400, height: 300 }, 10)).toBe(true)
  })
})

describe('nudgeCrop', () => {
  const free = at(startCrop(png), { x: 100, y: 100, width: 200, height: 100 })
  const key = (k: string, shift = false, alt = false) => ({ key: k, shiftKey: shift, altKey: alt })

  it('moves the frame a pixel, ten with Shift', () => {
    expect(nudgeCrop(free, png, 'move', key('ArrowRight'))?.crop).toMatchObject({ x: 101, y: 100 })
    expect(nudgeCrop(free, png, 'move', key('ArrowUp', true))?.crop).toMatchObject({ x: 100, y: 90 })
  })

  it('resizes the frame with Alt, from its right and bottom edges', () => {
    expect(nudgeCrop(free, png, 'move', key('ArrowRight', false, true))?.crop).toEqual({
      x: 100,
      y: 100,
      width: 201,
      height: 100,
    })
    expect(nudgeCrop(free, png, 'move', key('ArrowUp', true, true))?.crop).toMatchObject({ height: 90 })
  })

  it('moves a handle', () => {
    expect(nudgeCrop(free, png, 'w', key('ArrowLeft'))?.crop).toEqual({ x: 99, y: 100, width: 201, height: 100 })
    expect(nudgeCrop(free, png, 'se', key('ArrowDown'))?.crop).toEqual({ x: 100, y: 100, width: 200, height: 101 })
  })

  it('steps a block at a time where the grid holds the edge', () => {
    const tool = at(startCrop(photo), { x: 96, y: 96, width: 200, height: 100 })
    expect(nudgeCrop(tool, photo, 'move', key('ArrowRight'))?.crop).toMatchObject({ x: 112 })
    expect(nudgeCrop(tool, photo, 'move', key('ArrowLeft', true))?.crop).toMatchObject({ x: 0 })
    expect(nudgeCrop(tool, photo, 'n', key('ArrowDown'))?.crop).toMatchObject({ y: 112, height: 84 })
    expect(nudgeCrop(tool, photo, 'e', key('ArrowRight'))?.crop).toMatchObject({ width: 201 })
  })

  it('ignores other keys', () => {
    expect(nudgeCrop(free, png, 'move', key('Enter'))).toBe(null)
  })
})

describe('fieldCrop', () => {
  it('sets one side, keeping a fixed aspect', () => {
    const free = at(startCrop(png), { x: 100, y: 100, width: 200, height: 100 })
    expect(fieldCrop(free, png, 'x', 20).crop).toEqual({ x: 20, y: 100, width: 200, height: 100 })
    expect(fieldCrop({ ...free, aspect: '1:1' }, png, 'width', 150).crop).toEqual({
      x: 100,
      y: 100,
      width: 150,
      height: 150,
    })
  })
})

describe('toUpright', () => {
  it('finds the upright picture’s pixel under a point of the turned one', () => {
    const size = { width: 4, height: 2 }
    // Turned right, the upright top-left pixel is at the top-right.
    expect(toUpright({ x: 1.5, y: 0.5 }, 6, 0, size)).toEqual({ x: 0, y: 0 })
    expect(toUpright({ x: 3.5, y: 0.5 }, 2, 0, size)).toEqual({ x: 0, y: 0 })
    expect(toUpright({ x: 2.2, y: 1.7 }, 1, 0, size)).toEqual({ x: 2, y: 1 })
    expect(toUpright({ x: 5, y: 1 }, 1, 0, size)).toBe(null)
    // Straightened a quarter turn about the middle.
    expect(toUpright({ x: 2.5, y: 0.5 }, 1, 90, { width: 4, height: 4 })).toEqual({ x: 0, y: 1 })
  })
})
