import { describe, expect, it } from 'vitest'
import { adjust, adjustmentWords, curves, isNeutral, NEUTRAL, tone, type Adjustments } from './adjust'
import { rgba, type Pixels } from './pixels'

const set = (over: Partial<Adjustments>): Adjustments => ({ ...NEUTRAL, ...over })
const one = (r: number, g: number, b: number, a = 255) => rgba(1, 1, () => [r, g, b, a])
const of = (p: Pixels) => Array.from(p.data.subarray(0, 4))
/** One pixel adjusted. */
const after = (pixel: number[], a: Partial<Adjustments>) =>
  of(adjust(one(...(pixel as [number, number, number])), set(a)))

// The sRGB transfer curve, written out again so the tests don't lean on adjust.ts's own.
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const linearOf = (byte: number) => toLinear(byte / 255)

// Every byte value in every channel, and a few alphas.
const ramp = () => rgba(256, 3, (x, y) => [x, 255 - x, (x * 7) % 256, [255, 128, 0][y]])

describe('neutral', () => {
  it('changes nothing', () => {
    const source = ramp()
    expect(isNeutral(NEUTRAL)).toBe(true)
    expect(adjust(source, NEUTRAL).data).toEqual(source.data)
  })

  it('is any setting at zero', () => {
    expect(isNeutral(set({ exposure: 0.1 }))).toBe(false)
    expect(isNeutral(set({ warmth: -1 }))).toBe(false)
  })
})

describe('exposure', () => {
  it('multiplies linear light by two for each stop', () => {
    for (const byte of [20, 64, 100, 137]) {
      const [r] = after([byte, byte, byte], { exposure: 1 })
      // Within the rounding to a byte either side.
      expect(linearOf(r) / linearOf(byte)).toBeCloseTo(2, 0)
      expect(Math.abs(linearOf(r) - 2 * linearOf(byte))).toBeLessThan(linearOf(r) - linearOf(r - 1))
    }
    const [r] = after([200, 200, 200], { exposure: -2 })
    expect(Math.abs(linearOf(r) - linearOf(200) / 4)).toBeLessThan(linearOf(r + 1) - linearOf(r))
  })

  it('keeps black black and clips at white', () => {
    expect(after([0, 0, 0], { exposure: 2 })).toEqual([0, 0, 0, 255])
    expect(after([200, 230, 255], { exposure: 2 })).toEqual([255, 255, 255, 255])
  })
})

describe('contrast', () => {
  it('keeps black, white and the middle, and pushes the rest away from the middle', () => {
    for (const c of [-100, -40, 40, 100]) {
      expect(tone(0, set({ contrast: c }))).toBeCloseTo(0, 9)
      expect(tone(1, set({ contrast: c }))).toBeCloseTo(1, 9)
      expect(tone(0.5, set({ contrast: c }))).toBeCloseTo(0.5, 9)
    }
    expect(tone(0.25, set({ contrast: 50 }))).toBeLessThan(0.25)
    expect(tone(0.75, set({ contrast: 50 }))).toBeGreaterThan(0.75)
    expect(tone(0.25, set({ contrast: -50 }))).toBeGreaterThan(0.25)
    expect(tone(0.75, set({ contrast: -50 }))).toBeLessThan(0.75)
  })
})

describe('highlights and shadows', () => {
  it('move the bright tones or the dark ones, keeping black and white', () => {
    for (const v of [-100, 100]) {
      for (const key of ['highlights', 'shadows'] as const) {
        expect(tone(0, set({ [key]: v }))).toBeCloseTo(0, 9)
        expect(tone(1, set({ [key]: v }))).toBeCloseTo(1, 9)
      }
    }
    const change = (key: 'highlights' | 'shadows', value: number, v: number) => tone(v, set({ [key]: value })) - v
    // Highlights work on the bright end and barely touch the dark.
    expect(change('highlights', -100, 0.85)).toBeLessThan(-0.05)
    expect(change('highlights', 100, 0.85)).toBeGreaterThan(0.05)
    expect(Math.abs(change('highlights', -100, 0.15))).toBeLessThan(0.01)
    // Shadows the other way round.
    expect(change('shadows', 100, 0.15)).toBeGreaterThan(0.05)
    expect(change('shadows', -100, 0.15)).toBeLessThan(-0.05)
    expect(Math.abs(change('shadows', 100, 0.85))).toBeLessThan(0.01)
  })
})

describe('the tone curve', () => {
  it('never reverses tones, at any setting', () => {
    const extremes: Partial<Adjustments>[] = [
      { contrast: 100 },
      { contrast: -100 },
      { highlights: 100 },
      { highlights: -100 },
      { shadows: 100 },
      { shadows: -100 },
      { contrast: 100, highlights: -100, shadows: 100 },
      { contrast: -100, highlights: 100, shadows: -100, exposure: 2, warmth: 100 },
      { exposure: -2, warmth: -100 },
    ]
    for (const a of extremes) {
      const lut = curves(set(a))
      for (const channel of lut)
        for (let i = 1; i < 256; i++)
          expect(channel[i], `${JSON.stringify(a)} at ${i}`).toBeGreaterThanOrEqual(channel[i - 1])
    }
  })

  it('keeps a grey grey', () => {
    for (const a of [{ exposure: 1.3 }, { contrast: 70 }, { highlights: -60 }, { shadows: 80 }, { saturation: 100 }])
      for (const byte of [10, 90, 180, 250]) {
        const [r, g, b] = after([byte, byte, byte], a)
        expect([g, b]).toEqual([r, r])
      }
  })
})

describe('saturation', () => {
  it('turns colour to grey at −100, keeping its luminance', () => {
    const [r, g, b] = after([200, 80, 40], { saturation: -100 })
    expect([g, b]).toEqual([r, r])
    expect(r).toBe(Math.round(0.2126 * 200 + 0.7152 * 80 + 0.0722 * 40))
  })

  it('doubles the distance from grey at +100, clipped', () => {
    const grey = 0.2126 * 140 + 0.7152 * 120 + 0.0722 * 100
    expect(after([140, 120, 100], { saturation: 100 })).toEqual([
      Math.round(grey + 2 * (140 - grey)),
      Math.round(grey + 2 * (120 - grey)),
      Math.round(grey + 2 * (100 - grey)),
      255,
    ])
    expect(after([250, 20, 20], { saturation: 100 })[0]).toBe(255)
    expect(after([250, 20, 20], { saturation: 100 })[1]).toBe(0)
  })
})

describe('warmth', () => {
  it('turns a grey towards orange when warmer and blue when cooler, leaving green', () => {
    const [r, g, b] = after([128, 128, 128], { warmth: 100 })
    expect(r).toBeGreaterThan(128)
    expect(g).toBe(128)
    expect(b).toBeLessThan(128)
    const [r2, g2, b2] = after([128, 128, 128], { warmth: -100 })
    expect(r2).toBeLessThan(128)
    expect(g2).toBe(128)
    expect(b2).toBeGreaterThan(128)
  })
})

describe('adjust', () => {
  it('keeps alpha and the source as they were', () => {
    const source = ramp()
    const copy = source.data.slice()
    const out = adjust(source, set({ exposure: 1, contrast: 30, saturation: 50, warmth: 20 }))
    expect(source.data).toEqual(copy)
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(source.data[i])
    expect([out.width, out.height]).toEqual([source.width, source.height])
  })

  it('can write into a buffer it’s given, for the preview', () => {
    const source = ramp()
    const into = new Uint8ClampedArray(source.data.length)
    const out = adjust(source, set({ shadows: 40 }), into)
    expect(out.data).toBe(into)
    expect(out.data).toEqual(adjust(source, set({ shadows: 40 })).data)
  })
})

describe('adjustmentWords', () => {
  it('writes each value as the slider shows it', () => {
    expect(adjustmentWords('exposure', 0)).toBe('0.0 EV')
    expect(adjustmentWords('exposure', 0.5)).toBe('+0.5 EV')
    expect(adjustmentWords('exposure', -1.25)).toBe('−1.3 EV')
    expect(adjustmentWords('contrast', 0)).toBe('0')
    expect(adjustmentWords('contrast', 35)).toBe('+35')
    expect(adjustmentWords('warmth', -100)).toBe('−100')
  })
})
