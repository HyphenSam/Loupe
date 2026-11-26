import { describe, expect, it } from 'vitest'
import { rgba, type Pixels, type Rect } from './pixels'
import { boxFrom, boxWords, dragBox, fillBox, nudgeBox, redact, strengthOf } from './redact'

const at = (p: Pixels, x: number, y: number) =>
  Array.from(p.data.subarray(4 * (y * p.width + x), 4 * (y * p.width + x) + 4))
const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height

/** Every pixel outside `boxes` is the source's. */
function expectOutsideKept(out: Pixels, source: Pixels, boxes: Rect[]) {
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++)
      if (!boxes.some((b) => inside(b, x, y))) expect(at(out, x, y), `${x}, ${y}`).toEqual(at(source, x, y))
}

// A picture with something different in every pixel.
const busy = (w = 40, h = 30) =>
  rgba(w, h, (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 53) % 256, (x * y) % 256, 255])

describe('strengthOf', () => {
  it('is a tenth of the shorter side, at least 8 px', () => {
    expect(strengthOf({ x: 0, y: 0, width: 240, height: 60 })).toBe(8)
    expect(strengthOf({ x: 0, y: 0, width: 300, height: 200 })).toBe(20)
    expect(strengthOf({ x: 0, y: 0, width: 125, height: 500 })).toBe(13)
  })
})

describe('redact: black', () => {
  it('paints the boxes opaque black and leaves everything else, and the source, alone', () => {
    const source = busy()
    const copy = source.data.slice()
    const boxes = [
      { x: 2, y: 3, width: 10, height: 4 },
      { x: 20, y: 10, width: 5, height: 15 },
    ]
    const out = redact(source, boxes, 'black')
    for (const b of boxes)
      for (let y = b.y; y < b.y + b.height; y++)
        for (let x = b.x; x < b.x + b.width; x++) expect(at(out, x, y)).toEqual([0, 0, 0, 255])
    expectOutsideKept(out, source, boxes)
    expect(source.data).toEqual(copy)
  })

  it('clips boxes to the picture', () => {
    const source = busy(10, 10)
    const out = redact(source, [{ x: 7, y: -3, width: 10, height: 5 }], 'black')
    expect(at(out, 9, 0)).toEqual([0, 0, 0, 255])
    expect(at(out, 7, 1)).toEqual([0, 0, 0, 255])
    expectOutsideKept(out, source, [{ x: 7, y: 0, width: 3, height: 2 }])
  })
})

describe('redact: pixelate', () => {
  it('fills each block from the box’s corner with the block’s average', () => {
    // 20 × 10 box: strength 8, so blocks 8 × 8, the last ones partial (4 wide, 2 high).
    const source = busy(30, 20)
    const box = { x: 3, y: 4, width: 20, height: 10 }
    const out = redact(source, [box], 'pixelate')
    const blocks = [
      { x: 3, y: 4, width: 8, height: 8 },
      { x: 11, y: 4, width: 8, height: 8 },
      { x: 19, y: 4, width: 4, height: 8 },
      { x: 3, y: 12, width: 8, height: 2 },
      { x: 19, y: 12, width: 4, height: 2 },
    ]
    for (const b of blocks) {
      const mean = [0, 1, 2, 3].map((c) => {
        let sum = 0
        for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) sum += at(source, x, y)[c]
        return Math.round(sum / (b.width * b.height))
      })
      for (let y = b.y; y < b.y + b.height; y++)
        for (let x = b.x; x < b.x + b.width; x++) expect(at(out, x, y), `${x}, ${y}`).toEqual(mean)
    }
    expectOutsideKept(out, source, [box])
  })
})

/** A box blur done the slow way: within the box, each pass the mean of the 2r + 1 pixels across, then down, the
 * box's edge pixels repeated beyond it; three passes; rounded at the end. */
function slowBlur(source: Pixels, box: Rect, r: number): Pixels {
  const { width: w, height: h } = box
  let values = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => at(source, box.x + x, box.y + y)),
  )
  const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, v))
  for (let pass = 0; pass < 3; pass++) {
    const across = values.map((row) =>
      row.map((_, x) =>
        [0, 1, 2, 3].map((c) => {
          let sum = 0
          for (let k = -r; k <= r; k++) sum += row[clamp(x + k, w)][c]
          return sum / (2 * r + 1)
        }),
      ),
    )
    values = across.map((row, y) =>
      row.map((_, x) =>
        [0, 1, 2, 3].map((c) => {
          let sum = 0
          for (let k = -r; k <= r; k++) sum += across[clamp(y + k, h)][x][c]
          return sum / (2 * r + 1)
        }),
      ),
    )
  }
  const out = { ...source, data: source.data.slice() }
  values.forEach((row, y) =>
    row.forEach((v, x) => out.data.set(v.map(Math.round), 4 * ((box.y + y) * out.width + box.x + x))),
  )
  return out
}

describe('redact: blur', () => {
  it('is a box blur three times, within the box', () => {
    const source = busy(50, 40)
    const box = { x: 5, y: 6, width: 30, height: 25 }
    const out = redact(source, [box], 'blur')
    const expected = slowBlur(source, box, 8)
    for (let y = 0; y < source.height; y++)
      for (let x = 0; x < source.width; x++) {
        const [a, b] = [at(out, x, y), at(expected, x, y)]
        for (let c = 0; c < 4; c++) expect(Math.abs(a[c] - b[c]), `${x}, ${y}`).toBeLessThanOrEqual(1)
      }
    expectOutsideKept(out, source, [box])
  })

  it('leaves an even colour as it is', () => {
    const source = rgba(20, 20, () => [10, 200, 30, 255])
    expect(redact(source, [{ x: 0, y: 0, width: 20, height: 20 }], 'blur').data).toEqual(source.data)
  })
})

describe('fillBox', () => {
  it('fills a region in place at a given strength, for the stage’s scaled preview', () => {
    const p = busy(20, 20)
    const before = p.data.slice()
    fillBox(p, { x: 0, y: 0, width: 4, height: 4 }, 'pixelate', 2)
    expect(at(p, 0, 0)).toEqual(at(p, 1, 1))
    expect(at(p, 2, 0)).toEqual(at(p, 3, 1))
    expect(at(p, 4, 0)).toEqual(Array.from(before.subarray(16, 20)))
  })
})

describe('box geometry', () => {
  const size = { width: 400, height: 300 }

  it('spans two points, rounded outwards and kept inside the picture', () => {
    expect(boxFrom({ x: 10.4, y: 20.6 }, { x: 5.2, y: 40.1 }, size)).toEqual({ x: 5, y: 20, width: 6, height: 21 })
    expect(boxFrom({ x: 390, y: 290 }, { x: 450, y: -20 }, size)).toEqual({ x: 390, y: 0, width: 10, height: 290 })
  })

  it('moves inside the picture', () => {
    const box = { x: 10, y: 10, width: 50, height: 20 }
    expect(dragBox(box, 'move', 5, -3, size)).toEqual({ x: 15, y: 7, width: 50, height: 20 })
    expect(dragBox(box, 'move', -50, 1000, size)).toEqual({ x: 0, y: 280, width: 50, height: 20 })
  })

  it('resizes from a handle, anchored at the opposite edge, at least 1 px and inside the picture', () => {
    const box = { x: 10, y: 10, width: 50, height: 20 }
    expect(dragBox(box, 'se', 10, 5, size)).toEqual({ x: 10, y: 10, width: 60, height: 25 })
    expect(dragBox(box, 'nw', -4, 2, size)).toEqual({ x: 6, y: 12, width: 54, height: 18 })
    expect(dragBox(box, 'w', 100, 0, size)).toEqual({ x: 59, y: 10, width: 1, height: 20 })
    expect(dragBox(box, 'n', 0, -50, size)).toEqual({ x: 10, y: 0, width: 50, height: 30 })
    expect(dragBox(box, 'e', 1000, 0, size)).toEqual({ x: 10, y: 10, width: 390, height: 20 })
  })

  it('takes arrow keys: a pixel, ten with Shift, and Alt resizes', () => {
    const box = { x: 10, y: 10, width: 50, height: 20 }
    const key = (key: string, shiftKey = false, altKey = false) => ({ key, shiftKey, altKey })
    expect(nudgeBox(box, 'move', key('ArrowRight'), size)).toEqual({ ...box, x: 11 })
    expect(nudgeBox(box, 'move', key('ArrowUp', true), size)).toEqual({ ...box, y: 0 })
    expect(nudgeBox(box, 'move', key('ArrowLeft', false, true), size)).toEqual({ ...box, width: 49 })
    expect(nudgeBox(box, 's', key('ArrowDown'), size)).toEqual({ ...box, height: 21 })
    expect(nudgeBox(box, 'move', key('Enter'), size)).toBe(null)
  })

  it('words a box for the settings and screen readers', () => {
    expect(boxWords({ x: 120, y: 880, width: 240, height: 60 }, 0)).toBe('Box 1, 240 × 60 at 120, 880')
  })
})
