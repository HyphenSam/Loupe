/** Pixels into the models' input: resampling, and planes of normalised floats in PaddleOCR's channel order. */
import type { Pixels } from '../pixels'

type Tap = { index: number; weight: number }

/** For each of `to` positions, the source positions it takes and their weights: the share of each it covers when
 * shrinking, so thin strokes aren't skipped; a blend of the two nearest centres when enlarging, as OpenCV's linear
 * resize does. */
function taps(from: number, to: number): Tap[][] {
  const scale = from / to
  return Array.from({ length: to }, (_, i) => {
    if (scale > 1) {
      const [start, end] = [i * scale, (i + 1) * scale]
      const out: Tap[] = []
      for (let j = Math.floor(start); j < Math.min(from, Math.ceil(end)); j++)
        out.push({ index: j, weight: (Math.min(end, j + 1) - Math.max(start, j)) / scale })
      return out
    }
    const s = (i + 0.5) * scale - 0.5
    const j = Math.floor(s)
    const f = s - j
    const clamp = (k: number) => Math.min(from - 1, Math.max(0, k))
    return [
      { index: clamp(j), weight: 1 - f },
      { index: clamp(j + 1), weight: f },
    ]
  })
}

/** The picture at `width` × `height`, across and then down. */
export function resize(image: Pixels, width: number, height: number): Pixels {
  if (width === image.width && height === image.height) return image
  const across = taps(image.width, width)
  const down = taps(image.height, height)
  const rows = new Float32Array(width * image.height * 4)
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < width; x++)
      for (const { index, weight } of across[x]) {
        const from = (y * image.width + index) * 4
        const to = (y * width + x) * 4
        for (let c = 0; c < 4; c++) rows[to + c] += image.data[from + c] * weight
      }
  const data = new Uint8ClampedArray(width * height * 4)
  const sum = new Float32Array(4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      sum.fill(0)
      for (const { index, weight } of down[y]) {
        const from = (index * width + x) * 4
        for (let c = 0; c < 4; c++) sum[c] += rows[from + c] * weight
      }
      data.set(sum.map(Math.round), (y * width + x) * 4)
    }
  return { width, height, data }
}

/** Three planes, blue, green and red (PaddleOCR reads pictures as OpenCV does), each value (v ÷ 255 − mean) ÷ std
 * with the mean and spread given in that order. Transparent pixels are read over white. Rows are `width` long, the
 * columns past the picture left at 0. */
export function planes(image: Pixels, mean: number[], std: number[], width = image.width): Float32Array {
  const plane = width * image.height
  const out = new Float32Array(3 * plane)
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4
      const a = image.data[i + 3] / 255
      for (let c = 0; c < 3; c++) {
        // Blue first: plane c takes channel 2 − c.
        const v = (image.data[i + 2 - c] * a + 255 * (1 - a)) / 255
        out[c * plane + y * width + x] = (v - mean[c]) / std[c]
      }
    }
  return out
}
