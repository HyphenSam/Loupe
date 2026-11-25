import { describe, expect, it } from 'vitest'
import { NO_CAPABILITIES, probeCapabilities, SAMPLES, shownByBrowser } from './capabilities'

describe('probeCapabilities', () => {
  it('asks the browser to show each sample, and about the clipboard and WebGL 2', async () => {
    const asked: string[] = []
    const capabilities = await probeCapabilities({
      shows: async (url) => {
        asked.push(url)
        return url === SAMPLES.avif
      },
      clipboardImage: () => true,
      webgl2: () => false,
    })
    expect(asked.sort()).toEqual([SAMPLES.avif, SAMPLES.heic, SAMPLES.jxl].sort())
    expect(capabilities).toEqual({ shows: { avif: true, heic: false, jxl: false }, clipboardImage: true, webgl2: false })
  })

  it('takes a check that throws or never answers as a no', async () => {
    const capabilities = await probeCapabilities(
      {
        shows: (url) => (url === SAMPLES.heic ? new Promise(() => {}) : Promise.reject(new Error('no'))),
        clipboardImage: () => {
          throw new Error('no')
        },
        webgl2: () => true,
      },
      10,
    )
    expect(capabilities).toEqual({ shows: { avif: false, heic: false, jxl: false }, clipboardImage: false, webgl2: true })
  })

  it('bundles each sample as a data URL of its format', () => {
    expect(SAMPLES.avif).toMatch(/^data:image\/avif;base64,/)
    expect(SAMPLES.heic).toMatch(/^data:image\/heic;base64,/)
    expect(SAMPLES.jxl).toMatch(/^data:image\/jxl;base64,/)
  })
})

describe('shownByBrowser', () => {
  it('shows JPEG, PNG, WebP, GIF and BMP everywhere, and AVIF, HEIC and JPEG XL where the probe said', () => {
    for (const format of ['jpeg', 'png', 'webp', 'gif', 'bmp'] as const) expect(shownByBrowser(format, NO_CAPABILITIES.shows)).toBe(true)
    expect(shownByBrowser('heic', { avif: true, heic: false, jxl: true })).toBe(false)
    expect(shownByBrowser('heic', { avif: false, heic: true, jxl: false })).toBe(true)
    expect(shownByBrowser('jxl', { avif: false, heic: false, jxl: true })).toBe(true)
  })

  it('never shows TIFF or raw files directly', () => {
    const all = { avif: true, heic: true, jxl: true }
    expect(shownByBrowser('tiff', all)).toBe(false)
    expect(shownByBrowser('raw', all)).toBe(false)
  })
})
