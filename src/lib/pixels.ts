/** Pixel maths on plain RGBA: standing a decoded picture upright, reading one pixel, and sizes. */
import type { Orientation } from './info'

/** RGBA, 8 bits a channel, rows top to bottom, as the decoders give it. */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray }

/** Pixels made to order, for tests. */
export function rgba(width: number, height: number, f: (x: number, y: number) => number[]): Pixels {
  const data = new Uint8ClampedArray(4 * width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(f(x, y), 4 * (y * width + x))
  return { width, height, data }
}

/** The picture turned and mirrored upright for EXIF `orientation` (Bytesize's). */
export function orient(image: Pixels, orientation: Orientation): Pixels {
  if (orientation === 1) return image
  const { width: w, height: h } = image
  const [ow, oh] = orientation >= 5 ? [h, w] : [w, h]
  // The source pixel of output pixel (x, y).
  const source: Record<Exclude<Orientation, 1>, (x: number, y: number) => [number, number]> = {
    2: (x, y) => [w - 1 - x, y],
    3: (x, y) => [w - 1 - x, h - 1 - y],
    4: (x, y) => [x, h - 1 - y],
    5: (x, y) => [y, x],
    6: (x, y) => [y, h - 1 - x],
    7: (x, y) => [w - 1 - y, h - 1 - x],
    8: (x, y) => [w - 1 - y, x],
  }
  const from = source[orientation]
  const data = new Uint8ClampedArray(image.data.length)
  // Whole pixels at a time; a Uint32Array view needs a 4-byte aligned start.
  const bytes = image.data.byteOffset % 4 ? image.data.slice() : image.data
  const pixels = new Uint32Array(bytes.buffer, bytes.byteOffset, w * h)
  const out = new Uint32Array(data.buffer)
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const [sx, sy] = from(x, y)
      out[y * ow + x] = pixels[sy * w + sx]
    }
  return { width: ow, height: oh, data }
}

/** One pixel's red, green, blue and alpha, or null outside the picture. */
export function pixelAt(image: Pixels, x: number, y: number): [number, number, number, number] | null {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null
  const i = (y * image.width + x) * 4
  const d = image.data
  return [d[i], d[i + 1], d[i + 2], d[i + 3]]
}

/** The picture with its longer side at most `maxSide`, each pixel the mean of the block it covers; the
 * picture itself when it already fits. For the stage and the readout, which need no finer filter. */
export function downscale(image: Pixels, maxSide: number): Pixels {
  const { width, height } = scaleToFit(image.width, image.height, maxSide)
  if (width === image.width && height === image.height) return image
  const data = new Uint8ClampedArray(width * height * 4)
  const sx = image.width / width
  const sy = image.height / height
  const sum = new Float64Array(4)
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      sum.fill(0)
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * image.width + xx) * 4
          for (let c = 0; c < 4; c++) sum[c] += image.data[i + c]
        }
      const n = (x1 - x0) * (y1 - y0)
      for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round(sum[c] / n)
    }
  }
  return { width, height, data }
}

/** The longest side a picture can have and still fit in `area` pixels (iOS caps a canvas at about 16.7 MP). */
export function fitArea(width: number, height: number, area: number): number {
  const longest = Math.max(width, height)
  return width * height <= area ? longest : Math.floor(longest * Math.sqrt(area / (width * height)))
}

/** The size with the longer side at most `maxSide`, never enlarged. */
export function scaleToFit(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// Turns and flips. EXIF's eight orientations are the eight ways to turn and mirror a rectangle, so the user's
// turns and flips are kept as one of them too, and two compose into a third. Each is the matrix taking a point,
// measured from the centre with y down, to where it ends up.

type Matrix = [number, number, number, number] // (x, y) → (a x + b y, c x + d y)

const MATRICES: Record<Orientation, Matrix> = {
  1: [1, 0, 0, 1],
  2: [-1, 0, 0, 1],
  3: [-1, 0, 0, -1],
  4: [1, 0, 0, -1],
  5: [0, 1, 1, 0],
  6: [0, -1, 1, 0],
  7: [0, -1, -1, 0],
  8: [0, 1, -1, 0],
}

const ORIENTATIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

/** The one turn that does `first`, then `second`. */
export function compose(first: Orientation, second: Orientation): Orientation {
  const [a, b, c, d] = MATRICES[second]
  const [e, f, g, h] = MATRICES[first]
  const product = [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h]
  return ORIENTATIONS.find((o) => MATRICES[o].every((v, i) => v === product[i]))!
}

export const rotateRight = (t: Orientation) => compose(t, 6)
export const rotateLeft = (t: Orientation) => compose(t, 8)
export const flipHorizontal = (t: Orientation) => compose(t, 2)
export const flipVertical = (t: Orientation) => compose(t, 4)

export type Edge = 'left' | 'right' | 'top' | 'bottom'

const DIRECTIONS: Record<Edge, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }

/** Where `edge` of a picture ends up after `turn`. */
export function edgeAfter(edge: Edge, turn: Orientation): Edge {
  const [x, y] = DIRECTIONS[edge]
  const [a, b, c, d] = MATRICES[turn]
  const to = [a * x + b * y, c * x + d * y]
  return (Object.keys(DIRECTIONS) as Edge[]).find((e) => DIRECTIONS[e][0] === to[0] && DIRECTIONS[e][1] === to[1])!
}

export type Rect = { x: number; y: number; width: number; height: number }

/** The pixels inside `rect`, exactly. */
export function crop(image: Pixels, rect: Rect): Pixels {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4
    data.set(image.data.subarray(from, from + rect.width * 4), y * rect.width * 4)
  }
  return { width: rect.width, height: rect.height, data }
}

/** Keys' cubic with a = −0.5 (Catmull–Rom): weights that sum to one and copy whole pixels exactly. */
function cubic(t: number): number {
  const x = Math.abs(t)
  if (x <= 1) return 1.5 * x ** 3 - 2.5 * x ** 2 + 1
  if (x < 2) return -0.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2
  return 0
}

/** The picture turned `degrees` clockwise about its centre, at the same size, resampled bicubically. Colour is
 * weighted by alpha so transparent pixels lend none; corners outside the source repeat its nearest edge (the
 * crop keeps them out of the result). */
export function straighten(image: Pixels, degrees: number): Pixels {
  if (degrees === 0) return image
  const { width: w, height: h, data: src } = image
  const out = new Uint8ClampedArray(src.length)
  const t = (degrees * Math.PI) / 180
  const [cos, sin] = [Math.cos(t), Math.sin(t)]
  const [cx, cy] = [(w - 1) / 2, (h - 1) / 2]
  const wx = new Float64Array(4)
  const wy = new Float64Array(4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Where this output pixel comes from: turned back by the angle.
      const [dx, dy] = [x - cx, y - cy]
      const sx = cx + dx * cos + dy * sin
      const sy = cy - dx * sin + dy * cos
      const [x0, y0] = [Math.floor(sx), Math.floor(sy)]
      for (let i = 0; i < 4; i++) {
        wx[i] = cubic(sx - (x0 - 1 + i))
        wy[i] = cubic(sy - (y0 - 1 + i))
      }
      let [r, g, b, a] = [0, 0, 0, 0]
      for (let j = 0; j < 4; j++) {
        const yy = Math.min(h - 1, Math.max(0, y0 - 1 + j))
        for (let i = 0; i < 4; i++) {
          const weight = wx[i] * wy[j]
          if (weight === 0) continue
          const xx = Math.min(w - 1, Math.max(0, x0 - 1 + i))
          const s = (yy * w + xx) * 4
          const alpha = src[s + 3] * weight
          r += src[s] * alpha
          g += src[s + 1] * alpha
          b += src[s + 2] * alpha
          a += alpha
        }
      }
      const o = (y * w + x) * 4
      if (a > 0) {
        out[o] = r / a
        out[o + 1] = g / a
        out[o + 2] = b / a
      }
      out[o + 3] = a
    }
  return { width: w, height: h, data: out }
}

/** The largest rectangle of `aspect` (width over height; the picture's own by default), centred, that fits inside
 * the picture once it's turned `degrees` about its centre: the crop that shows no blank corners. */
export function innerRect(width: number, height: number, degrees: number, aspect = width / height): Rect {
  const t = (Math.abs(degrees) * Math.PI) / 180
  const [cos, sin] = [Math.abs(Math.cos(t)), Math.abs(Math.sin(t))]
  // Each corner must lie within half the width along the turned x axis and half the height along its y axis.
  const h = Math.min(width / (aspect * cos + sin), height / (aspect * sin + cos))
  const size = { width: Math.min(width, Math.floor(aspect * h + 1e-9)), height: Math.min(height, Math.floor(h + 1e-9)) }
  return { x: Math.floor((width - size.width) / 2), y: Math.floor((height - size.height) / 2), ...size }
}

/** What a pixel edit does to the upright picture, in order. */
export type PixelOp =
  { type: 'turn'; orientation: Orientation } | { type: 'straighten'; degrees: number } | { type: 'crop'; rect: Rect }

export function transform(image: Pixels, ops: PixelOp[]): Pixels {
  return ops.reduce((p, op) => {
    switch (op.type) {
      case 'turn':
        return orient(p, op.orientation)
      case 'straighten':
        return straighten(p, op.degrees)
      case 'crop':
        return crop(p, op.rect)
    }
  }, image)
}
