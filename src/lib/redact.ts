/** Redact's pixel maths and its boxes (SPEC.md 6.9): black, blur and pixelate on plain pixels, and how a box is
 * drawn, moved, resized and nudged on the upright picture. */
import type { Handle } from './crop'
import type { Pixels, Rect } from './pixels'

export type Fill = 'black' | 'blur' | 'pixelate'

type Size = { width: number; height: number }

/** The blur's radius and the pixelate's block size: a tenth of the box's shorter side, at least 8 px. */
export const strengthOf = (box: Rect) => Math.max(8, Math.round(Math.min(box.width, box.height) / 10))

/** A copy of the picture with each box filled, each at its own strength. Boxes are clipped to the picture. */
export function redact(image: Pixels, boxes: Rect[], fill: Fill): Pixels {
  const out = { ...image, data: image.data.slice() }
  for (const box of boxes) fillBox(out, box, fill, strengthOf(box))
  return out
}

/** Fills one box of `image` in place at `strength` (the blur's radius, the pixelate's block). The stage's preview
 * uses it on a scaled copy, with the strength scaled too. */
export function fillBox(image: Pixels, box: Rect, fill: Fill, strength: number) {
  const r = clip(box, image)
  if (!r) return
  if (fill === 'black') {
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) image.data.set([0, 0, 0, 255], 4 * (y * image.width + x))
  } else if (fill === 'pixelate') pixelate(image, r, Math.max(1, Math.round(strength)))
  else blur(image, r, Math.max(1, Math.round(strength)))
}

function clip(box: Rect, size: Size): Rect | null {
  const x = Math.max(0, Math.round(box.x))
  const y = Math.max(0, Math.round(box.y))
  const width = Math.min(size.width, Math.round(box.x + box.width)) - x
  const height = Math.min(size.height, Math.round(box.y + box.height)) - y
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

/** Each block, from the box's top-left corner, takes its pixels' average; the last row and column of blocks can
 * be partial. */
function pixelate(image: Pixels, r: Rect, block: number) {
  const { data, width } = image
  for (let by = r.y; by < r.y + r.height; by += block)
    for (let bx = r.x; bx < r.x + r.width; bx += block) {
      const [ex, ey] = [Math.min(bx + block, r.x + r.width), Math.min(by + block, r.y + r.height)]
      const sum = [0, 0, 0, 0]
      for (let y = by; y < ey; y++)
        for (let x = bx; x < ex; x++) for (let c = 0; c < 4; c++) sum[c] += data[4 * (y * width + x) + c]
      const n = (ex - bx) * (ey - by)
      const mean = sum.map((s) => Math.round(s / n))
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) data.set(mean, 4 * (y * width + x))
    }
}

/** A box blur three times, across then down each time, reading only inside the box (its edge pixels repeated
 * beyond it), so nothing outside the box changes it. Running sums keep it linear in the radius. */
function blur(image: Pixels, r: Rect, radius: number) {
  const { width: w, height: h } = r
  const values = new Float64Array(4 * w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) values[4 * (y * w + x) + c] = image.data[4 * ((r.y + y) * image.width + r.x + x) + c]
  const spare = new Float64Array(values.length)
  const span = 2 * radius + 1
  // One pass along `n` items `stride` apart, starting at `start`, for each channel.
  const line = (from: Float64Array, to: Float64Array, start: number, n: number, stride: number) => {
    const at = (i: number) => start + stride * Math.min(n - 1, Math.max(0, i))
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += from[at(k) + c]
      for (let i = 0; i < n; i++) {
        to[start + stride * i + c] = sum / span
        sum += from[at(i + radius + 1) + c] - from[at(i - radius) + c]
      }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) line(values, spare, 4 * y * w, w, 4)
    for (let x = 0; x < w; x++) line(spare, values, 4 * x, h, 4 * w)
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++)
        image.data[4 * ((r.y + y) * image.width + r.x + x) + c] = Math.round(values[4 * (y * w + x) + c])
}

/** The box between two points of the picture, rounded outwards and kept inside it. */
export function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }, size: Size): Rect {
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x)))
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y)))
  const x1 = Math.min(size.width, Math.ceil(Math.max(a.x, b.x)))
  const y1 = Math.min(size.height, Math.ceil(Math.max(a.y, b.y)))
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }
}

/** A box a quarter of the picture's size in its middle: the one Add box makes, for the keyboard to move and resize. */
export function middleBox(size: Size): Rect {
  const width = Math.max(2, Math.round(size.width / 4))
  const height = Math.max(2, Math.round(size.height / 4))
  return { x: Math.round((size.width - width) / 2), y: Math.round((size.height - height) / 2), width, height }
}

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v))

/** `from` moved, or resized by a handle (the opposite edge stays put), by whole pixels; at least 1 × 1 and inside
 * the picture. */
export function dragBox(from: Rect, handle: Handle, dx: number, dy: number, size: Size): Rect {
  const [mx, my] = [Math.round(dx), Math.round(dy)]
  if (handle === 'move')
    return {
      ...from,
      x: clamp(from.x + mx, 0, size.width - from.width),
      y: clamp(from.y + my, 0, size.height - from.height),
    }
  let [left, top, right, bottom] = [from.x, from.y, from.x + from.width, from.y + from.height]
  if (handle.includes('w')) left = clamp(left + mx, 0, right - 1)
  if (handle.includes('e')) right = clamp(right + mx, left + 1, size.width)
  if (handle.includes('n')) top = clamp(top + my, 0, bottom - 1)
  if (handle.includes('s')) bottom = clamp(bottom + my, top + 1, size.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** An arrow key on a box or one of its handles: a pixel, ten with Shift; Alt on the box resizes it from its
 * bottom-right corner. Null for any other key. */
export function nudgeBox(
  box: Rect,
  handle: Handle,
  event: { key: string; shiftKey: boolean; altKey: boolean },
  size: Size,
): Rect | null {
  const arrow = ARROWS[event.key]
  if (!arrow) return null
  const many = event.shiftKey ? 10 : 1
  return dragBox(box, handle === 'move' && event.altKey ? 'se' : handle, arrow[0] * many, arrow[1] * many, size)
}

/** "Box 1, 240 × 60 at 120, 880". */
export const boxWords = (box: Rect, index: number) =>
  `Box ${index + 1}, ${box.width} × ${box.height} at ${box.x}, ${box.y}`
