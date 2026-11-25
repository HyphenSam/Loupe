import { gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { rgba } from '../pixels'
import { hideStealth, readStealth } from './stealth'

const text = 'a circle\nNegative prompt: a square\nSteps: 20, Sampler: Euler, Seed: 1'
const bytes = (s: string) => new TextEncoder().encode(s)
const grey = (width: number, height: number, alpha = 255) => rgba(width, height, () => [120, 121, 122, alpha])

describe('readStealth', () => {
  it('reads text hidden in the alpha channel’s lowest bits, column by column', async () => {
    const p = grey(30, 30)
    hideStealth(p, 'stealth_pnginfo', bytes(text))
    expect(await readStealth(p)).toEqual({ text, channel: 'alpha' })
  })

  it('unzips stealth_pngcomp', async () => {
    const p = grey(30, 30)
    hideStealth(p, 'stealth_pngcomp', gzipSync(bytes(text)))
    expect(await readStealth(p)).toEqual({ text, channel: 'alpha' })
  })

  it('reads the colour channels’ lowest bits for stealth_rgbinfo and stealth_rgbcomp', async () => {
    const plain = grey(20, 20)
    hideStealth(plain, 'stealth_rgbinfo', bytes(text))
    expect(await readStealth(plain)).toEqual({ text, channel: 'rgb' })
    const zipped = grey(20, 20)
    hideStealth(zipped, 'stealth_rgbcomp', gzipSync(bytes(text)))
    expect(await readStealth(zipped)).toEqual({ text, channel: 'rgb' })
  })

  it('reads in column order: the first bits run down the left edge', () => {
    const p = grey(20, 20)
    hideStealth(p, 'stealth_pnginfo', bytes('x'))
    // 's' is 0111 0011: its bits go to (0, 0), (0, 1)… down the first column.
    const lsb = (x: number, y: number) => p.data[(y * 20 + x) * 4 + 3] & 1
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((y) => lsb(0, y))).toEqual([0, 1, 1, 1, 0, 0, 1, 1])
  })

  it('finds nothing in an ordinary picture, or where the length runs past the end', async () => {
    expect(await readStealth(grey(20, 20))).toBeNull()
    expect(await readStealth(grey(20, 20, 254))).toBeNull()
    // Too small for the signature; then room for the signature and length (152 bits) but not the text.
    expect(await readStealth(grey(4, 4))).toBeNull()
    const short = grey(1, 160)
    hideStealth(short, 'stealth_pnginfo', bytes(text))
    expect(await readStealth(short)).toBeNull()
  })

  it('gives up on data that won’t unzip', async () => {
    const p = grey(20, 20)
    hideStealth(p, 'stealth_pngcomp', bytes('not gzip'))
    expect(await readStealth(p)).toBeNull()
  })
})
