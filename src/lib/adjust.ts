/** Adjust's maths (SPEC.md 6.10) on plain RGBA, shared by the stage's preview and the job. Warmth and exposure are
 * gains in linear light; contrast, highlights and shadows a tone curve on the encoded values; saturation a move away
 * from or towards each pixel's grey. Everything but saturation works on one channel at a time, so it's three tables
 * of 256 entries, and a 2048 px preview takes a few milliseconds. */
import type { Pixels } from './pixels'

/** Exposure in stops (−2 to 2); the rest −100 to 100. */
export type Adjustments = {
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  saturation: number
  warmth: number
}

export type AdjustmentKey = keyof Adjustments

export const NEUTRAL: Adjustments = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, warmth: 0 }

export const isNeutral = (a: Adjustments) => (Object.keys(NEUTRAL) as AdjustmentKey[]).every((k) => a[k] === 0)

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toEncoded = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

/** Lifts (`amount` > 0) or deepens the dark tones, most near a third and none at black or white: a power curve
 * faded out towards white. Never reverses tones for `amount` in −1 to 1. */
function lift(v: number, amount: number): number {
  if (!amount) return v
  const fade = (1 - v) ** 2
  return v + fade * (v ** (2 ** -amount) - v)
}

/** The tone curve on an encoded value from 0 to 1: contrast as an S about the middle (or flattened towards it),
 * then highlights and shadows, each keeping black and white where they are. */
export function tone(v: number, a: Adjustments): number {
  if (a.contrast) {
    const p = 2 ** (1.5 * (a.contrast / 100))
    const [x, y] = [v ** p, (1 - v) ** p]
    v = x / (x + y)
  }
  // Highlights are shadows seen from white: brightening them deepens 1 − v's dark tones.
  if (a.highlights) v = 1 - lift(1 - v, -a.highlights / 100)
  if (a.shadows) v = lift(v, a.shadows / 100)
  return v
}

/** Warmth at 100 is red up and blue down by this many stops. */
const WARMTH_STOPS = 0.3

/** Red's, green's and blue's tables: what each stored value becomes before saturation, from 0 to 255. */
export function curves(a: Adjustments): [Float32Array, Float32Array, Float32Array] {
  const w = (a.warmth / 100) * WARMTH_STOPS
  return [w, 0, -w].map((stops) => {
    const gain = 2 ** (a.exposure + stops)
    const table = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const v = gain === 1 ? i / 255 : toEncoded(Math.min(1, toLinear(i / 255) * gain))
      table[i] = 255 * tone(v, a)
    }
    return table
  }) as [Float32Array, Float32Array, Float32Array]
}

/** The picture adjusted, alpha kept; into `into` when given (the preview reuses one buffer while a slider moves). */
export function adjust(image: Pixels, a: Adjustments, into = new Uint8ClampedArray(image.data.length)): Pixels {
  const [red, green, blue] = curves(a)
  // A whole pixel at a time, which halves the time a 2048 px preview takes in Chrome (to 12–28 ms). Every
  // browser's platform is little-endian, so red is the low byte. A view needs a 4-byte aligned start.
  const data = image.data.byteOffset % 4 ? image.data.slice() : image.data
  const source = new Uint32Array(data.buffer, data.byteOffset, image.width * image.height)
  const out = new Uint32Array(into.buffer, into.byteOffset, image.width * image.height)
  // Saturation scales each channel's distance from the pixel's luminance (Rec. 709 weights): 0 is grey, 2 double.
  const s = 1 + a.saturation / 100
  if (s === 1) {
    // Each channel's table rounded, and shifted into its byte.
    const [r8, g8, b8] = [red, green, blue].map((table, c) => Uint32Array.from(table, (v) => Math.round(v) << (8 * c)))
    for (let i = 0; i < source.length; i++) {
      const p = source[i]
      out[i] = ((p & 0xff000000) | r8[p & 255] | g8[(p >> 8) & 255] | b8[(p >> 16) & 255]) >>> 0
    }
  } else {
    // Rounded half up, as Math.round would be; the typed array's own rounding is half to even, and slower. The
    // clamps are written out: Firefox doesn't inline a helper here, which took it from 27 ms to 46.
    for (let i = 0; i < source.length; i++) {
      const p = source[i]
      const r = red[p & 255]
      const g = green[(p >> 8) & 255]
      const b = blue[(p >> 16) & 255]
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const r8 = Math.min(255, Math.max(0, y + (r - y) * s + 0.5)) | 0
      const g8 = Math.min(255, Math.max(0, y + (g - y) * s + 0.5)) | 0
      const b8 = Math.min(255, Math.max(0, y + (b - y) * s + 0.5)) | 0
      out[i] = ((p & 0xff000000) | r8 | (g8 << 8) | (b8 << 16)) >>> 0
    }
  }
  return { width: image.width, height: image.height, data: into }
}

/** A value as its slider shows it: "+0.5 EV", "−20", "0". */
export function adjustmentWords(key: AdjustmentKey, value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return key === 'exposure' ? `${sign}${Math.abs(value).toFixed(1)} EV` : `${sign}${Math.abs(value)}`
}
