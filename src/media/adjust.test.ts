// Adjust's jobs end to end in Node (SPEC.md 6.10): planned from the fixtures' ImageInfo, run as the worker runs them,
// and the result decoded and read back. The result's pixels are adjust.ts's on the decoded source, exactly where the
// format is lossless; its metadata follows 6.0.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { adjust, NEUTRAL, type Adjustments } from '@/lib/adjust'
import { sniff } from '@/lib/formats'
import type { ImageInfo } from '@/lib/info'
import type { Pixels } from '@/lib/pixels'
import { DEFAULT_ADJUST, planAdjust } from '@/lib/plans/adjust'
import type { Encoding } from '@/lib/plans/plan'
import { toImageInfo } from '@/lib/tags'
import { decode } from './codecs'
import { readTags, restart } from './exiftool'
import { fixture, useNodeCodecs, useNodeExifTool } from './node'
import { run } from './run'

beforeAll(async () => {
  useNodeExifTool()
  await useNodeCodecs()
})
afterEach(restart)
vi.setConfig({ testTimeout: 60_000 })

async function infoOf(name: string, bytes: Uint8Array): Promise<ImageInfo> {
  return toImageInfo(await readTags(name, bytes), { name, size: bytes.length, lastModified: 0 }, sniff(bytes), bytes)!
}

const LOOK: Adjustments = { exposure: 0.6, contrast: 25, highlights: -40, shadows: 30, saturation: 20, warmth: 15 }

/** `srgb` stands in for the browser's conversion, which Node can't run. */
async function job(
  name: string,
  adjustments: Adjustments = LOOK,
  { output = null, srgb }: { output?: Encoding | null; srgb?: () => Promise<Pixels> } = {},
) {
  const bytes = fixture(name)
  const info = await infoOf(name, bytes)
  const planned = planAdjust(info, { ...DEFAULT_ADJUST, adjustments, output })
  if (!planned.plan) throw new Error(planned.problems.join(' '))
  const upright = () => decode(bytes, info.format, info.orientation)
  const { blob } = await run(planned.plan, bytes, upright, srgb)
  const out = new Uint8Array(await blob.arrayBuffer())
  const result = await infoOf(planned.plan.name, out)
  return {
    planned,
    plan: planned.plan,
    out,
    result,
    pixels: await decode(out, sniff(out)!, 1),
    source: { info, upright },
  }
}

/** The largest and the mean difference between two pictures' channels. */
function difference(a: Pixels, b: Pixels) {
  expect([a.width, a.height]).toEqual([b.width, b.height])
  let [most, sum] = [0, 0]
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i])
    most = Math.max(most, d)
    sum += d
  }
  return { most, mean: sum / a.data.length }
}

function expectUpright(result: ImageInfo) {
  expect(result.orientation).toBe(1)
  expect(result.embedded.filter((e) => e.kind === 'thumbnail' || e.kind === 'preview')).toEqual([])
}

describe('the pixels', () => {
  it.each(['screenshot.png', 'lossless.webp'])('are adjust.ts’s on the decoded source, exactly (%s)', async (name) => {
    const { plan, pixels, source } = await job(name)
    expect(plan).toMatchObject({ kind: 'pixels', lossless: true })
    const expected = adjust(await source.upright(), LOOK)
    expect(difference(pixels, expected).most).toBe(0)
    // And the adjustment did something.
    expect(difference(pixels, await source.upright()).mean).toBeGreaterThan(5)
  })

  it('keep a 16-bit PNG’s alpha', async () => {
    const { pixels, source } = await job('png-16-alpha.png')
    const before = await source.upright()
    for (let i = 3; i < before.data.length; i += 4) expect(pixels.data[i]).toBe(before.data[i])
  })

  it('are adjust.ts’s on the decoded source, but for JPEG’s re-encoding, upright', async () => {
    for (const name of ['camera.jpg', 'orient-6.jpg', 'photo.heic']) {
      const { plan, pixels, result, source } = await job(name, { ...NEUTRAL, exposure: -0.8, saturation: -50 })
      expect(plan).toMatchObject({ kind: 'pixels', lossless: false, encoding: { format: 'jpeg' } })
      expectUpright(result)
      const before = await source.upright()
      expect([result.width, result.height]).toEqual([before.width, before.height])
      const { mean } = difference(pixels, adjust(before, { ...NEUTRAL, exposure: -0.8, saturation: -50 }))
      expect(mean, name).toBeLessThan(2.5)
    }
  })
})

describe('metadata', () => {
  it('is copied from the source, without the thumbnail', async () => {
    const { source, result } = await job('camera.jpg')
    expect(source.info.embedded.some((e) => e.kind === 'thumbnail')).toBe(true)
    expectUpright(result)
    expect(result.camera).toEqual(source.info.camera)
    expect(result.gps).toEqual(source.info.gps)
    expect(result.dates.taken).toEqual(source.info.dates.taken)
  })

  it('drops an Ultra HDR gain map and keeps the colour profile', async () => {
    const { planned, result } = await job('ultra-hdr.jpg')
    expect(planned.caption).toContain('The HDR gain map is removed, so the result is standard range.')
    expect(result.kinds).not.toContain('ultra-hdr')
    expect(result.colour.profile).toBe('Display P3 Gamut with sRGB Transfer')
  })

  it('drops Content Credentials and a Motion Photo’s video', async () => {
    const signed = await job('c2pa/CA.jpg')
    expect(signed.planned.caption).toContain('Content Credentials are removed; they’d no longer match the picture.')
    expect(signed.result.tags.filter((t) => t.family === 'JUMBF' || t.family === 'C2PA')).toEqual([])
    const motion = await job('motion-photo.jpg')
    expect(motion.planned.caption).toContain('The Motion Photo’s video is removed.')
    expect(motion.result.motion).toBe(null)
    expect(motion.result.kinds).not.toContain('motion-photo')
  })

  it('converts a Display P3 picture to sRGB for JPEG XL, taking the converted pixels, and copies no profile', async () => {
    const bytes = fixture('ultra-hdr.jpg')
    const info = await infoOf('ultra-hdr.jpg', bytes)
    // A stand-in for the browser's conversion: the stored pixels, darkened, so they can be told apart.
    const converted = async () => {
      const p = await decode(bytes, info.format, info.orientation)
      return { ...p, data: p.data.map((v, i) => (i % 4 === 3 ? v : v >> 1)) }
    }
    const output: Encoding = { format: 'jxl', quality: null, lossless: true }
    const { plan, pixels, result } = await job('ultra-hdr.jpg', LOOK, { output, srgb: converted })
    expect(plan).toMatchObject({ srgb: true })
    expect(difference(pixels, adjust(await converted(), LOOK)).most).toBe(0)
    expect(result.colour.profile).toBe(null)
    expect(result.camera).toEqual(info.camera)
  })
})
