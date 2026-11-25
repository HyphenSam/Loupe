/** Perceptual hashes (SPEC.md 6.5's Fingerprints and Embedded thumbnail): 64 bits that stay nearly the same
 * when a picture is resized or recompressed, and change when what it shows changes. The picture is averaged
 * down to a 32 × 32 grey copy, its 2-D DCT taken, and the 8 × 8 lowest frequencies after the flat one each
 * give a bit: set when above their median (as pHash does). */
import { downscale, type Pixels } from '../pixels'

const SIDE = 32
const BITS = 8

/** The picture averaged into SIDE × SIDE cells by luma (Rec. 601), whatever its size or shape. A pixel that
 * straddles cells is shared between them by how much of it falls in each, so small pictures work too. */
export function greyThumbnail(p: Pixels): Float64Array {
  const { width, height, data } = p
  // Which cells each column and row falls in, and how much: in cell units, a pixel spans SIDE / size.
  const spans = (size: number) => {
    const scale = SIDE / size
    return Array.from({ length: size }, (_, i) => {
      const from = i * scale
      const to = (i + 1) * scale
      const parts: [number, number][] = []
      for (let cell = Math.floor(from); cell < Math.min(SIDE, Math.ceil(to)); cell++)
        parts.push([cell, Math.min(to, cell + 1) - Math.max(from, cell)])
      return parts
    })
  }
  const columns = spans(width)
  const rows = spans(height)
  const sum = new Float64Array(SIDE * SIDE)
  const weight = new Float64Array(SIDE * SIDE)
  const line = new Float64Array(SIDE)
  const lineWeight = new Float64Array(SIDE)
  for (let y = 0; y < height; y++) {
    // One row reduced across first, then shared out down.
    line.fill(0)
    lineWeight.fill(0)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      for (const [cell, w] of columns[x]) {
        line[cell] += luma * w
        lineWeight[cell] += w
      }
    }
    for (const [cell, w] of rows[y])
      for (let c = 0; c < SIDE; c++) {
        sum[cell * SIDE + c] += line[c] * w
        weight[cell * SIDE + c] += lineWeight[c] * w
      }
  }
  return sum.map((s, i) => s / weight[i])
}

const COSINES = Array.from({ length: BITS + 1 }, (_, u) =>
  Float64Array.from({ length: SIDE }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIDE))),
)

/** The picture's 64-bit perceptual hash as 16 hexadecimal digits. */
export function perceptualHash(p: Pixels): string {
  const grey = greyThumbnail(p)
  // The DCT's low frequencies 1–8 in each direction, rows first. The flat term (0) says only how bright it is.
  const across = new Float64Array(SIDE * BITS)
  for (let y = 0; y < SIDE; y++)
    for (let u = 1; u <= BITS; u++) {
      let s = 0
      for (let x = 0; x < SIDE; x++) s += grey[y * SIDE + x] * COSINES[u][x]
      across[y * BITS + u - 1] = s
    }
  const coefficients: number[] = []
  for (let v = 1; v <= BITS; v++)
    for (let u = 0; u < BITS; u++) {
      let s = 0
      for (let y = 0; y < SIDE; y++) s += across[y * BITS + u] * COSINES[v][y]
      // Rounded, so a flat picture's coefficients, zero but for floating-point dust, compare as equal.
      coefficients.push(Math.round(s * 1e6) / 1e6)
    }
  const sorted = [...coefficients].sort((a, b) => a - b)
  const median = (sorted[31] + sorted[32]) / 2
  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (coefficients[i + b] > median ? 1 : 0)
    hex += nibble.toString(16)
  }
  return hex
}

/** How many of the 64 bits differ between two hashes. */
export function hashDistance(a: string, b: string): number {
  let count = 0
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    for (; x; x &= x - 1) count++
  }
  return count
}

export type Sameness = 'same' | 'similar' | 'different'

/** SPEC.md 6.5's thresholds: up to 10 bits apart is likely the same picture, up to 20 possibly similar. */
export const sameness = (distance: number): Sameness =>
  distance <= 10 ? 'same' : distance <= 20 ? 'similar' : 'different'

/** A row or column this dark is a bar a camera padded its thumbnail with, not part of the picture. */
const BAR = 24

/** The picture without black bars along its edges (cameras pad thumbnails to 160 × 120 with them); the picture
 * itself when it has none, or is black all over. */
export function trimBars(p: Pixels): Pixels {
  const { width, height, data } = p
  const dark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4
        if (data[i] > BAR || data[i + 1] > BAR || data[i + 2] > BAR) return false
      }
    return true
  }
  let top = 0
  let bottom = height
  let left = 0
  let right = width
  while (top < bottom && dark(0, top, width, top + 1)) top++
  if (top === bottom) return p
  while (dark(0, bottom - 1, width, bottom)) bottom--
  while (dark(left, top, left + 1, bottom)) left++
  while (dark(right - 1, top, right, bottom)) right--
  if (top === 0 && left === 0 && bottom === height && right === width) return p
  const w = right - left
  const h = bottom - top
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    out.set(data.subarray(((y + top) * width + left) * 4, ((y + top) * width + right) * 4), y * w * 4)
  return { width: w, height: h, data: out }
}

export type ThumbnailCheck = { matches: boolean; distance: number; aspectDiffers: boolean }

/** Whether an embedded thumbnail (upright) shows the picture as it is (SPEC.md 6.5): their shapes within 1%
 * (or a pixel of the thumbnail's, for small ones) and their hashes within 10 bits. Black bars are left out of
 * both first. */
export function thumbnailCheck(picture: Pixels, thumbnail: Pixels): ThumbnailCheck {
  const a = trimBars(downscale(picture, 512))
  const b = trimBars(thumbnail)
  const ratio = (p: Pixels) => p.width / p.height
  const tolerance = Math.max(0.01, 1 / Math.min(b.width, b.height))
  const aspectDiffers = Math.abs(ratio(b) / ratio(a) - 1) > tolerance
  const distance = hashDistance(perceptualHash(a), perceptualHash(b))
  return { matches: !aspectDiffers && sameness(distance) === 'same', distance, aspectDiffers }
}
