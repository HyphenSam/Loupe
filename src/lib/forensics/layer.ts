/** What Forensics' Error levels and Noise views share (SPEC.md 6.5): a greyscale layer, its amplification
 * into a picture for the stage, and the sliders' ranges. */
import type { Pixels } from '../pixels'

/** One value a pixel, rows top to bottom: how much each pixel changed or stands out. */
export type Grey = { width: number; height: number; data: Uint8Array }

/** Error levels' re-save quality and brightness, and Noise's amplification. */
export type LayerSettings = { quality: number; brightness: number; noise: number }

export const DEFAULT_LAYERS: LayerSettings = { quality: 90, brightness: 20, noise: 10 }

export const LAYER_LIMITS: Record<keyof LayerSettings, { min: number; max: number }> = {
  quality: { min: 70, max: 95 },
  brightness: { min: 1, max: 50 },
  noise: { min: 1, max: 50 },
}

/** The layer as an opaque grey picture, each value multiplied by `amount` and stopping at white. */
export function amplify(layer: Grey, amount: number): Pixels {
  const { width, height } = layer
  const data = new Uint8ClampedArray(width * height * 4)
  // Whole pixels at a time, alpha included (little-endian: alpha is the top byte).
  const out = new Uint32Array(data.buffer)
  const table = new Uint32Array(256)
  for (let v = 0; v < 256; v++) {
    const g = Math.min(255, Math.round(v * amount))
    table[v] = (0xff000000 | (g << 16) | (g << 8) | g) >>> 0
  }
  for (let i = 0; i < layer.data.length; i++) out[i] = table[layer.data[i]]
  return { width, height, data }
}
