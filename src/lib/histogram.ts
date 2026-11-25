/** Info's histogram (SPEC.md 6.1): red, green, blue and luminance over the decoded pixels' stored values,
 * and how much is clipped. */
import type { Pixels } from './pixels'

export type Histogram = {
  red: Uint32Array
  green: Uint32Array
  blue: Uint32Array
  luma: Uint32Array
  /** Pixels counted: all but the fully transparent. */
  pixels: number
  /** Share of pixels black in every channel. */
  shadows: number
  /** Share of pixels white in at least one channel. */
  highlights: number
}

export function histogram({ data }: Pixels): Histogram {
  const red = new Uint32Array(256)
  const green = new Uint32Array(256)
  const blue = new Uint32Array(256)
  const luma = new Uint32Array(256)
  let pixels = 0
  let shadows = 0
  let highlights = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    red[r]++
    green[g]++
    blue[b]++
    // Rec. 709 weights on the stored values, as image editors' luminance histograms use.
    luma[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++
    pixels++
    if (r === 0 && g === 0 && b === 0) shadows++
    if (r === 255 || g === 255 || b === 255) highlights++
  }
  return {
    red,
    green,
    blue,
    luma,
    pixels,
    shadows: pixels ? shadows / pixels : 0,
    highlights: pixels ? highlights / pixels : 0,
  }
}

const percent = (share: number) => (share < 0.001 ? 'less than 0.1%' : `${Math.round(share * 1000) / 10}%`)

/** The histogram's caption. */
export function clippingWords(shadows: number, highlights: number): string {
  if (!shadows && !highlights) return 'Nothing is clipped to black or white.'
  if (!shadows) return `Nothing is clipped to black; ${percent(highlights)} is clipped to white.`
  if (!highlights) return `${capital(percent(shadows))} of the picture is clipped to black; nothing to white.`
  return `${capital(percent(shadows))} of the picture is clipped to black and ${percent(highlights)} to white.`
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1)
