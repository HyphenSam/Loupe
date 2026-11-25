// Forensics' pixel checks on real photos (SPEC.md 6.5): perceptual hashes through real resizing, JPEG
// recompression and cropping, and error levels picking out a part pasted into a re-saved JPEG.
import decodeJpeg from '@jsquash/jpeg/decode.js'
import encodeJpeg from '@jsquash/jpeg/encode.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { errorLevels } from '@/lib/forensics/ela'
import { hashDistance, perceptualHash } from '@/lib/forensics/phash'
import { downscale, type Pixels } from '@/lib/pixels'
import { decode, resaveJpeg } from './codecs'
import { fixture, useNodeCodecs } from './node'

beforeAll(useNodeCodecs)
vi.setConfig({ testTimeout: 30_000 })

const photo = (name: string) => decode(fixture(name), 'jpeg', 1)

function crop(p: Pixels, left: number, top: number, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    data.set(p.data.subarray(((y + top) * p.width + left) * 4, ((y + top) * p.width + left + width) * 4), y * width * 4)
  return { width, height, data }
}

/** Saved as most cameras and editors do: libjpeg's standard tables, colour at half size (4:2:0). */
async function save(p: Pixels, quality: number): Promise<Pixels> {
  const bytes = await encodeJpeg(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), {
    quality,
    quant_table: 0,
  })
  const back = await decodeJpeg(bytes)
  return { width: back.width, height: back.height, data: back.data }
}

const distance = (a: Pixels, b: Pixels) => hashDistance(perceptualHash(a), perceptualHash(b))

describe('resaveJpeg', () => {
  it('gives the picture back the same size, changed a little, and less at a higher quality', async () => {
    const p = await photo('c2pa/CA.jpg')
    const low = await resaveJpeg(p, 70)
    const high = await resaveJpeg(p, 95)
    expect([low.width, low.height]).toEqual([p.width, p.height])
    const mean = (q: Pixels) => errorLevels(p, q).data.reduce((a, b) => a + b, 0) / (p.width * p.height)
    expect(mean(high)).toBeGreaterThan(0)
    expect(mean(high)).toBeLessThan(mean(low))
  })
})

describe('perceptual hashes of a real photo', () => {
  let p: Pixels
  beforeAll(async () => {
    p = await photo('c2pa/CA.jpg')
  })

  it('barely move when it’s resized', () => {
    expect(distance(p, downscale(p, Math.round(Math.max(p.width, p.height) / 2)))).toBeLessThanOrEqual(4)
    expect(distance(p, downscale(p, 160))).toBeLessThanOrEqual(6)
  })

  it('barely move when it’s recompressed, even hard', async () => {
    expect(distance(p, await resaveJpeg(p, 90))).toBeLessThanOrEqual(2)
    expect(distance(p, await resaveJpeg(downscale(p, 400), 30))).toBeLessThanOrEqual(6)
  })

  it('stay within 10 bits when it’s lightly cropped', () => {
    const dx = Math.round(p.width * 0.03)
    const dy = Math.round(p.height * 0.03)
    expect(distance(p, crop(p, dx, dy, p.width - 2 * dx, p.height - 2 * dy))).toBeLessThanOrEqual(10)
  })

  it('are far from another photo’s', async () => {
    expect(distance(p, await photo('c2pa/genai-actions-v2.jpg'))).toBeGreaterThan(20)
  })
})

describe('error levels', () => {
  // A camera's JPEG at quality 70, a square of the same scene pasted in where it was (so only its history
  // differs, not what it shows), then saved at 90 as editors do. Downscaling the sample first wipes its own
  // JPEG history, so the pasted square has never been saved as a JPEG.
  it('pick out a part pasted into a JPEG that was then saved again', async () => {
    const scene = downscale(await photo('c2pa/CA.jpg'), 800)
    const camera = await save(scene, 70)
    const [left, top, size] = [320, 240, 96]
    const edited = { ...camera, data: new Uint8ClampedArray(camera.data) }
    for (let y = 0; y < size; y++) {
      const i = ((y + top) * scene.width + left) * 4
      edited.data.set(scene.data.subarray(i, i + size * 4), i)
    }
    // The square's mean error level, a block in from its edges, in the edited picture and the untouched one.
    const level = async (p: Pixels) => {
      const saved = await save(p, 90)
      const levels = errorLevels(saved, await resaveJpeg(saved, 90))
      let sum = 0
      for (let y = top + 8; y < top + size - 8; y++)
        for (let x = left + 8; x < left + size - 8; x++) sum += levels.data[y * levels.width + x]
      return sum / (size - 16) ** 2
    }
    expect(await level(edited)).toBeGreaterThan(2 * (await level(camera)))
  })
})
