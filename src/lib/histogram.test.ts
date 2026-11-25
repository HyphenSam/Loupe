import { describe, expect, it } from 'vitest'
import { clippingWords, histogram } from './histogram'
import { rgba } from './pixels'

describe('histogram', () => {
  it('counts each channel’s values and the luminance', () => {
    const h = histogram(rgba(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255])))
    expect(h.red[255]).toBe(1)
    expect(h.red[0]).toBe(1)
    expect(h.blue[255]).toBe(1)
    expect(h.green[0]).toBe(2)
    // Rec. 709 weights: red 0.2126, blue 0.0722.
    expect(h.luma[54]).toBe(1)
    expect(h.luma[18]).toBe(1)
    expect(h.pixels).toBe(2)
  })

  it('leaves out fully transparent pixels', () => {
    const h = histogram(rgba(2, 1, (x) => (x === 0 ? [255, 255, 255, 0] : [10, 10, 10, 255])))
    expect(h.pixels).toBe(1)
    expect(h.red[255]).toBe(0)
  })

  it('works out the share of clipped shadows and highlights', () => {
    const h = histogram(rgba(4, 1, (x) => [[0, 0, 0], [255, 255, 255], [255, 255, 255], [128, 128, 128]][x].concat(255)))
    expect(h.shadows).toBe(0.25)
    expect(h.highlights).toBe(0.5)
  })

  it('counts a highlight as clipped when any channel is', () => {
    expect(histogram(rgba(1, 1, () => [255, 40, 40, 255])).highlights).toBe(1)
    expect(histogram(rgba(1, 1, () => [0, 0, 40, 255])).shadows).toBe(0)
  })
})

describe('clippingWords', () => {
  it('says how much is clipped, to a tenth of a per cent', () => {
    expect(clippingWords(0.0123, 0.2)).toBe('1.2% of the picture is clipped to black and 20% to white.')
    expect(clippingWords(0, 0.0004)).toBe('Nothing is clipped to black; less than 0.1% is clipped to white.')
    expect(clippingWords(0, 0)).toBe('Nothing is clipped to black or white.')
  })
})
