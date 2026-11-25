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
