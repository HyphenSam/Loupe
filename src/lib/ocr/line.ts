/** A detected line on its way to the recogniser (SPEC.md 6.12): cut from the picture and straightened by its box,
 * turned when it stands tall, and scaled to the recogniser's height. */
import { orient, type Pixels } from '../pixels'
import { planes, resize } from './image'
import { distance } from './quad'
import type { Point, Quad } from './types'

/** The recogniser reads lines 48 px high, at least 320 wide (its inference.yml's image shape). */
export const LINE_HEIGHT = 48
const MIN_WIDTH = 320

/** The perspective transform taking the unit square's corners (0,0), (1,0), (1,1), (0,1) to the quad's (Heckbert). */
function squareTo([p0, p1, p2, p3]: Quad): (u: number, v: number) => Point {
  const sx = p0.x - p1.x + p2.x - p3.x
  const sy = p0.y - p1.y + p2.y - p3.y
  let g = 0
  let h = 0
  if (sx || sy) {
    const [dx1, dx2, dy1, dy2] = [p1.x - p2.x, p3.x - p2.x, p1.y - p2.y, p3.y - p2.y]
    const det = dx1 * dy2 - dx2 * dy1
    g = (sx * dy2 - dx2 * sy) / det
    h = (dx1 * sy - sx * dy1) / det
  }
  const [a, b, c] = [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x]
  const [d, e, f] = [p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y]
  return (u, v) => {
    const w = g * u + h * v + 1
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w }
  }
}

/** One pixel at a fractional place, blended from its four neighbours; places off the picture take the nearest edge. */
function sample(image: Pixels, x: number, y: number, out: Uint8ClampedArray, at: number) {
  const clampX = (n: number) => Math.min(image.width - 1, Math.max(0, n))
  const clampY = (n: number) => Math.min(image.height - 1, Math.max(0, n))
  const [x0, y0] = [Math.floor(x), Math.floor(y)]
  const [fx, fy] = [x - x0, y - y0]
  const [xa, xb, ya, yb] = [clampX(x0), clampX(x0 + 1), clampY(y0), clampY(y0 + 1)]
  const d = image.data
  for (let c = 0; c < 4; c++) {
    const top = d[(ya * image.width + xa) * 4 + c] * (1 - fx) + d[(ya * image.width + xb) * 4 + c] * fx
    const bottom = d[(yb * image.width + xa) * 4 + c] * (1 - fx) + d[(yb * image.width + xb) * 4 + c] * fx
    out[at + c] = Math.round(top * (1 - fy) + bottom * fy)
  }
}

/** The line inside `quad`, straightened: as wide as its longer top or bottom edge and as high as its longer side,
 * its top left corner at the cut's top left (PaddleOCR's `get_rotate_crop_image`). */
export function cutLine(image: Pixels, quad: Quad): Pixels {
  const width = Math.max(1, Math.floor(Math.max(distance(quad[0], quad[1]), distance(quad[2], quad[3]))))
  const height = Math.max(1, Math.floor(Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]))))
  const map = squareTo(quad)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = map(x / width, y / height)
      sample(image, p.x, p.y, data, (y * width + x) * 4)
    }
  return { width, height, data }
}

/** The line turned a quarter anticlockwise when it's at least 1.5 times taller than wide, so a vertical line of
 * Chinese or Japanese reads from left to right; null when it reads as it is. */
export function turnTall(line: Pixels): Pixels | null {
  return line.height / line.width >= 1.5 ? orient(line, 8) : null
}

/** The recogniser's input: the line scaled to 48 px high, as planes normalised to −1–1, padded with 0 on the right
 * to at least 320 wide. */
export function recogniserInput(line: Pixels): { data: Float32Array; width: number } {
  const scaled = Math.ceil((LINE_HEIGHT * line.width) / line.height)
  const width = Math.max(MIN_WIDTH, Math.floor((LINE_HEIGHT * line.width) / line.height))
  const resized = resize(line, Math.min(width, scaled), LINE_HEIGHT)
  return { data: planes(resized, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], width), width }
}
