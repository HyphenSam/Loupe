/** Noise (SPEC.md 6.5): each pixel's brightness minus the median of its 3 × 3 neighbourhood. The median
 * keeps edges and smooth gradients, so what's left is the grain: a pasted-in part from another camera, or one
 * smoothed or sharpened apart from the rest, can have grain of its own. */
import type { Pixels } from '../pixels'
import type { Grey } from './layer'

/** Paeth's sorting network for the median of nine: 19 exchanges, after which the middle value is the median. */
const NETWORK = Uint8Array.from([
  1, 2, 4, 5, 7, 8, 0, 1, 3, 4, 6, 7, 1, 2, 4, 5, 7, 8, 0, 3, 5, 8, 4, 7, 3, 6, 1, 4, 2, 5, 4, 7, 4, 2, 6, 4, 4, 2,
])

function median9(v: Int32Array): number {
  for (let i = 0; i < NETWORK.length; i += 2) {
    const a = NETWORK[i]
    const b = NETWORK[i + 1]
    if (v[a] > v[b]) {
      const t = v[a]
      v[a] = v[b]
      v[b] = t
    }
  }
  return v[4]
}

/** Each pixel's difference from the median of its 3 × 3 neighbourhood, by luma (Rec. 601). Pixels past the
 * edges repeat the edge. */
export function noiseResidual(p: Pixels): Grey {
  const { width, height, data } = p
  const luma = new Int32Array(width * height)
  for (let i = 0, j = 0; i < luma.length; i++, j += 4)
    luma[i] = Math.floor((299 * data[j] + 587 * data[j + 1] + 114 * data[j + 2] + 500) / 1000)
  const out = new Uint8Array(width * height)
  const window = new Int32Array(9)
  for (let y = 0; y < height; y++) {
    const rows = [Math.max(0, y - 1), y, Math.min(height - 1, y + 1)].map((r) => r * width)
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 1)
      const right = Math.min(width - 1, x + 1)
      for (let r = 0; r < 3; r++) {
        window[r * 3] = luma[rows[r] + left]
        window[r * 3 + 1] = luma[rows[r] + x]
        window[r * 3 + 2] = luma[rows[r] + right]
      }
      out[y * width + x] = Math.abs(luma[y * width + x] - median9(window))
    }
  }
  return { width, height, data: out }
}
