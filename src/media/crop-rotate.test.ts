// Crop and rotate's jobs end to end in Node (SPEC.md 6.8): planned from the fixtures' ImageInfo, run as the worker
// runs them, and the result decoded and read back.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sniff } from '@/lib/formats'
import type { ImageInfo, Orientation } from '@/lib/info'
import { compose, crop, orient, type Pixels } from '@/lib/pixels'
import { DEFAULT_CROP_ROTATE, planCropRotate, type CropRotateSettings } from '@/lib/plans/crop-rotate'
import { toImageInfo } from '@/lib/tags'
import { decode } from './codecs'
import { readTags, restart } from './exiftool'
import { imageData } from './image-data'
import { jpegtran } from './jpegtran'
import { fixture, useNodeCodecs, useNodeExifTool, useNodeJpegtran } from './node'
import { run } from './run'

beforeAll(async () => {
  useNodeExifTool()
  useNodeJpegtran()
  await useNodeCodecs()
})
afterEach(restart)
vi.setConfig({ testTimeout: 60_000 })

async function infoOf(name: string, bytes: Uint8Array): Promise<ImageInfo> {
  return toImageInfo(await readTags(name, bytes), { name, size: bytes.length, lastModified: 0 }, sniff(bytes), bytes)!
}

const TURNS: Orientation[] = [2, 3, 4, 5, 6, 7, 8]
const inverse = (t: Orientation) => ([1, 2, 3, 4, 5, 6, 7, 8] as const).find((o) => compose(t, o) === 1)!

/** Plans and runs the job on a fixture, and reads the result back. */
async function job(name: string, settings: Partial<CropRotateSettings>) {
  const bytes = fixture(name)
  const info = await infoOf(name, bytes)
  const planned = planCropRotate(info, { ...DEFAULT_CROP_ROTATE, ...settings })
  if (!planned.plan) throw new Error(planned.problems.join(' '))
  const upright = () => decode(bytes, info.format, info.orientation)
  const { blob } = await run(planned.plan, bytes, upright)
  const out = new Uint8Array(await blob.arrayBuffer())
  const result = await infoOf(planned.plan.name, out)
  return { planned, plan: planned.plan, out, result, source: { bytes, info, upright } }
}

/** How far decoding can stray when the same blocks are turned. libjpeg's integer IDCT rounds between its column
 * and row passes, which swap places when blocks are transposed, and 4:2:0's fancy upsampling rounds one way
 * across and another down. Losslessness itself is checked on the blocks, exactly. */
const ROUNDING = 3

const pixelsOf = async (bytes: Uint8Array) => decode(bytes, sniff(bytes)!, 1)

/** The largest difference between two pictures' channels, or Infinity when their sizes differ. */
function difference(a: Pixels, b: Pixels): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity
  let most = 0
  for (let i = 0; i < a.data.length; i++) most = Math.max(most, Math.abs(a.data[i] - b.data[i]))
  return most
}

/** What every result promises (SPEC.md 6.0): upright, and no thumbnail of the picture before the edit. */
function expectUpright(result: ImageInfo) {
  expect(result.orientation).toBe(1)
  expect(result.embedded.filter((e) => e.kind === 'thumbnail' || e.kind === 'preview')).toEqual([])
}

describe.each(['grid-444.jpg', 'grid-420.jpg'])('every turn and flip of %s', (name) => {
  it.each(TURNS)('is lossless through jpegtran (turn %i)', async (turn) => {
    const { plan, out, result, source } = await job(name, { turn })
    expect(plan).toMatchObject({ kind: 'jpegtran', trim: false })
    expectUpright(result)
    // Its blocks are the source's: turned back, jpegtran writes exactly what it writes for the source.
    const back = await jpegtran(out, { transform: inverseTransform(turn), perfect: true })
    expect(imageData(back)).toEqual(imageData(await jpegtran(source.bytes, { transform: 'none' })))
    // Decoded, it's the decoded source turned, but for the decoder's rounding.
    expect(difference(await pixelsOf(out), orient(await source.upright(), turn))).toBeLessThanOrEqual(ROUNDING)
  })
})

function inverseTransform(turn: Orientation) {
  const names = { 1: 'none', 2: 'flip-horizontal', 3: 'rotate-180', 4: 'flip-vertical', 5: 'transpose', 6: 'rotate-90', 7: 'transverse', 8: 'rotate-270' } as const // prettier-ignore
  return names[inverse(turn)]
}

describe('orient-6.jpg', () => {
  it('needs a trim to stand upright, and loses only the promised pixels', async () => {
    // Stored 40 × 24 with 16 px blocks and shown turned clockwise: the partial bottom row of blocks would move to
    // the left.
    const { planned, plan, out, result, source } = await job('orient-6.jpg', {})
    expect(planned.trim).toBe('Trim 8 px from the left edge')
    expect(plan).toMatchObject({ kind: 'jpegtran', transform: 'rotate-90', trim: true })
    expectUpright(result)
    expect([result.width, result.height]).toEqual([16, 40])
    // Exactly the upright picture without its left 8 px: the same blocks as the stored picture without its
    // bottom 8 rows.
    const kept = await jpegtran(source.bytes, { transform: 'none', crop: { x: 0, y: 0, width: 40, height: 16 } })
    expect(imageData(await jpegtran(out, { transform: 'rotate-270', perfect: true }))).toEqual(
      imageData(await jpegtran(kept, { transform: 'none' })),
    )
    expect(difference(await pixelsOf(out), orient(await pixelsOf(kept), 6))).toBeLessThanOrEqual(ROUNDING)
  })

  it('re-encodes the whole picture when asked, keeping every pixel’s place', async () => {
    const { plan, result, out, source } = await job('orient-6.jpg', { partial: 'reencode' })
    expect(plan).toMatchObject({ kind: 'pixels', lossless: false })
    expectUpright(result)
    expect([result.width, result.height]).toEqual([24, 40])
    expect(difference(await pixelsOf(out), await source.upright())).toBeLessThan(40)
  })
})

describe('a crop on the block grid', () => {
  it('is lossless and has the promised size', async () => {
    const rect = { x: 16, y: 8, width: 30, height: 21 }
    const { plan, out, result, source } = await job('grid-444.jpg', { crop: rect })
    expect(plan).toMatchObject({ kind: 'jpegtran', crop: rect, name: 'grid-444 (cropped).jpg' })
    expect([result.width, result.height]).toEqual([30, 21])
    expect(difference(await pixelsOf(out), crop(await source.upright(), rect))).toBe(0)
  })

  it('is lossless after a turn, on the turned grid', async () => {
    const rect = { x: 16, y: 32, width: 20, height: 30 }
    const { plan, result } = await job('grid-420.jpg', { turn: 6, crop: rect })
    expect(plan).toMatchObject({ kind: 'jpegtran', transform: 'rotate-90', crop: rect })
    expect([result.width, result.height]).toEqual([20, 30])
  })

  it('re-encodes off the grid, at the promised size', async () => {
    const rect = { x: 3, y: 5, width: 30, height: 21 }
    const { plan, result } = await job('grid-420.jpg', { crop: rect })
    expect(plan.kind).toBe('pixels')
    expect([result.width, result.height]).toEqual([30, 21])
  })
})

describe('lossless formats', () => {
  it.each(TURNS)('turns a PNG pixel-exactly (turn %i)', async (turn) => {
    const { plan, out, result, source } = await job('screenshot.png', { turn })
    expect(plan).toMatchObject({ kind: 'pixels', lossless: true, encoding: { format: 'png' } })
    expectUpright(result)
    expect(difference(await pixelsOf(out), orient(await source.upright(), turn))).toBe(0)
  })

  it('crops a PNG pixel-exactly', async () => {
    const rect = { x: 3, y: 5, width: 30, height: 21 }
    const { plan, out, source } = await job('screenshot.png', { crop: rect })
    expect(plan).toMatchObject({ kind: 'pixels', lossless: true, name: 'screenshot (cropped).png' })
    expect(difference(await pixelsOf(out), crop(await source.upright(), rect))).toBe(0)
  })

  it('turns a lossless WebP pixel-exactly, and writes it as WebP', async () => {
    const { plan, out, source } = await job('lossless.webp', { turn: 7 })
    expect(plan).toMatchObject({ kind: 'pixels', lossless: true, encoding: { format: 'webp', lossless: true } })
    expect(sniff(out)).toBe('webp')
    expect(difference(await pixelsOf(out), orient(await source.upright(), 7))).toBe(0)
  })
})

describe('metadata', () => {
  const has = (info: ImageInfo, group: string, name: string) =>
    info.tags.some((t) => t.group === group && t.name === name)

  it('copies the source’s metadata, without the thumbnail, through jpegtran and re-encoding', async () => {
    for (const settings of [{ turn: 6 as const }, { turn: 6 as const, straighten: 3 }]) {
      const { plan, result } = await job('camera.jpg', settings)
      expect(plan.kind).toBe(settings.straighten ? 'pixels' : 'jpegtran')
      expectUpright(result)
      expect(result.camera).toMatchObject({ make: 'Loupe', model: 'Test Camera 1', lens: 'Loupe 35mm F2' })
      expect(result.gps).toMatchObject({ altitude: 312 })
      expect(result.dates.taken).toEqual({ local: '2025-03-12T14:32:05', offset: '+13:00' })
    }
  })

  it('sets Orientation to 1 where the source had one', async () => {
    const { result } = await job('orient-6.jpg', {})
    expect(has(result, 'IFD0', 'Orientation')).toBe(true)
    expect(result.orientation).toBe(1)
  })

  it('drops an Ultra HDR gain map and keeps the colour profile', async () => {
    const { planned, result } = await job('ultra-hdr.jpg', { turn: 3 })
    expect(planned.caption).toContain('The HDR gain map is removed, so the result is standard range.')
    expect(result.kinds).not.toContain('ultra-hdr')
    expect(result.embedded.map((e) => e.kind)).not.toContain('gain-map')
    expect(result.colour.profile).toBe('Display P3 Gamut with sRGB Transfer')
  })

  it('drops a Motion Photo’s video, from a JPEG and from a HEIC written as JPEG', async () => {
    for (const name of ['motion-photo.jpg', 'motion-photo.heic']) {
      const { planned, out, result } = await job(name, { turn: 6 })
      expect(planned.caption).toContain('The Motion Photo’s video is removed.')
      expect(sniff(out)).toBe('jpeg')
      expect(result.kinds).not.toContain('motion-photo')
      expect(result.motion).toBe(null)
      expect(result.camera).toMatchObject({ make: 'Loupe', model: 'Test Phone 1' })
    }
  })

  it('drops Content Credentials', async () => {
    const { planned, result } = await job('c2pa/CA.jpg', { turn: 6 })
    expect(planned.caption).toContain('Content Credentials are removed; they’d no longer match the picture.')
    expect(result.tags.filter((t) => t.family === 'JUMBF' || t.family === 'C2PA')).toEqual([])
  })
})
