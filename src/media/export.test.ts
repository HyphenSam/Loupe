// Export's jobs end to end in Node (SPEC.md 6.11): planned from the fixtures' ImageInfo, run as the worker runs them,
// and the result decoded and read back. Lossless means the decoded pixels are the source's exactly; a target size
// lands under the target or says why not; Keep metadata off leaves only the colour profile.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sniff } from '@/lib/formats'
import type { ImageInfo } from '@/lib/info'
import { flatten, type Pixels } from '@/lib/pixels'
import { exportNotes, planExport } from '@/lib/plans/export'
import type { ExportPlan } from '@/lib/plans/plan'
import { DEFAULT_EXPORT, type ExportSettings } from '@/lib/settings'
import { toImageInfo } from '@/lib/tags'
import { decode } from './codecs'
import { copyTags, readTags, restart } from './exiftool'
import { fixture, useNodeCodecs, useNodeExifTool } from './node'
import { run } from './run'

beforeAll(async () => {
  useNodeExifTool()
  await useNodeCodecs()
})
afterEach(restart)
vi.setConfig({ testTimeout: 120_000 })

async function infoOf(name: string, bytes: Uint8Array): Promise<ImageInfo> {
  return toImageInfo(await readTags(name, bytes), { name, size: bytes.length, lastModified: 0 }, sniff(bytes), bytes)!
}

async function job(name: string, over: Partial<ExportSettings> = {}, bytes: Uint8Array = fixture(name)) {
  const info = await infoOf(name, bytes)
  const planned = planExport(info, { ...DEFAULT_EXPORT, ...over })
  if (!planned.plan) throw new Error(planned.problems.join(' '))
  const plan = planned.plan as ExportPlan
  const upright = () => decode(bytes, info.format, info.orientation)
  const ran = await run(plan, bytes, upright)
  const out = new Uint8Array(await ran.blob.arrayBuffer())
  const result = await infoOf(plan.name, out)
  return { info, plan, caption: planned.caption, ran, out, result, upright }
}

const decoded = (out: Uint8Array) => decode(out, sniff(out)!, 1)

function same(a: Pixels, b: Pixels) {
  expect([a.width, a.height]).toEqual([b.width, b.height])
  let differ = 0
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) differ++
  return differ === 0
}

describe('the Lossless badge', () => {
  it.each([
    ['screenshot.png', {}],
    ['novelai.png', {}],
    ['lossless.webp', {}],
    ['screenshot.png', { format: 'webp', webpLossless: true }],
    ['novelai.png', { format: 'jxl', jxlLossless: true }],
    ['camera.jpg', { format: 'png' }],
  ] as const)('is earned: every pixel of %s survives (%o)', async (name, over) => {
    const { plan, out, upright } = await job(name, over)
    expect(plan.lossless).toBe(true)
    expect(same(await decoded(out), await upright())).toBe(true)
  })

  it('keeps a 16-bit PNG’s depth when it’s written as PNG', async () => {
    const { plan, result, out, upright } = await job('png-16-alpha.png')
    expect(plan).toMatchObject({ lossless: true, repack: true })
    expect(result.bitDepth).toBe(16)
    expect(same(await decoded(out), await upright())).toBe(true)
  })

  it('says Re-encodes for a 16-bit PNG written as lossless WebP, which has 8 bits a channel', async () => {
    const { plan, caption, out } = await job('png-16-alpha.png', { format: 'webp', webpLossless: true })
    expect(plan.lossless).toBe(false)
    expect(caption).toContain('The result has 8 bits a channel; the source has 16.')
    expect(sniff(out)).toBe('webp')
  })

  it('says Re-encodes for a resize, which makes the picture smaller with Lanczos3', async () => {
    const { plan, result } = await job('novelai.png', { resize: true, maxWidth: 64, maxHeight: 64 })
    expect(plan.lossless).toBe(false)
    expect([result.width, result.height]).toEqual([64, 48])
  })

  it('says Re-encodes for a lossy format, whose pixels change', async () => {
    const { plan, out, upright } = await job('screenshot.png', { format: 'avif' })
    expect(plan.lossless).toBe(false)
    expect(sniff(out)).toBe('avif')
    const jpeg = await job('camera.jpg')
    expect(jpeg.plan.lossless).toBe(false)
    expect(same(await decoded(jpeg.out), await jpeg.upright())).toBe(false)
    expect(await upright()).toBeTruthy()
  })

  it('puts a transparent picture over white in JPEG', async () => {
    const { out, upright } = await job('png-16-alpha.png', {
      format: 'jpeg',
      quality: { ...DEFAULT_EXPORT.quality, jpeg: 95 },
    })
    const before = await upright()
    const after = await decoded(out)
    // The mean difference in colour from `over` (the picture over white) and from the colour stored under the alpha.
    const from = (over: Pixels) => {
      let sum = 0
      for (let i = 0; i < over.data.length; i++) if (i % 4 !== 3) sum += Math.abs(after.data[i] - over.data[i])
      return sum / ((over.data.length * 3) / 4)
    }
    expect(from(flatten(before))).toBeLessThan(3)
    expect(from(before)).toBeGreaterThan(10)
  })

  it('writes each format, upright', async () => {
    for (const format of ['jpeg', 'webp', 'avif', 'jxl', 'png'] as const) {
      const { out, result } = await job('orient-6.jpg', { format })
      expect(sniff(out), format).toBe(format)
      expect(result.orientation).toBe(1)
      expect([result.displayWidth, result.displayHeight]).toEqual([24, 40])
    }
  })
})

describe('target size', () => {
  const photo = 'c2pa/composite-dst.jpg'

  // Resized, so eight encodes stay quick; each target three-quarters of what the slider's quality makes. One test
  // a format, so ExifTool starts afresh for each (CLAUDE.md: it slows with every call).
  it.each(['jpeg', 'webp', 'avif'] as const)(
    'lands under the target at the highest quality that fits, the colour profile included (%s)',
    async (format) => {
      const small = { resize: true, maxWidth: 512, maxHeight: 512 }
      const full = await job(photo, { ...small, format })
      const kB = Math.round((full.out.length * 0.75) / 1000)
      const { ran, out, plan } = await job(photo, { ...small, format, target: true, targetSize: kB })
      expect(out.length).toBeLessThanOrEqual(kB * 1000)
      expect(ran.fitted?.fits).toBe(true)
      expect(ran.fitted?.quality).toBeLessThan(plan.encoding.quality!)
      expect(exportNotes(plan, out.length, 126_000, ran.fitted ?? null)).toEqual([
        `Quality ${ran.fitted!.quality} fits under ${kB} kB.`,
      ])
    },
  )

  it('stops at the slider’s quality when that already fits', async () => {
    const { ran, plan } = await job(photo, { format: 'webp', target: true, targetSize: 5, targetUnit: 'MB' })
    expect(ran.fitted).toEqual({ quality: plan.encoding.quality, fits: true })
  })

  it('says why not when even the lowest quality is too large', async () => {
    const { ran, out, plan } = await job(photo, { format: 'jpeg', target: true, targetSize: 2 })
    expect(ran.fitted).toEqual({ quality: 1, fits: false })
    expect(out.length).toBeGreaterThan(2_000)
    expect(exportNotes(plan, out.length, 126_000, ran.fitted ?? null)).toEqual([
      expect.stringMatching(
        /^Even at quality 1 this is \d+ kB, over the 2 kB target\. Turn on Resize, or choose another format\.$/,
      ),
    ])
  })
})

describe('Keep metadata', () => {
  // What a file holds besides metadata: the file's own structure, and the profile.
  const STRUCTURE = new Set(['File', 'JFIF', 'ICC_Profile', 'Composite', 'PNG', 'RIFF', 'ExifTool', 'JPEG'])
  const metadata = (info: ImageInfo) =>
    info.tags.filter((t) => !STRUCTURE.has(t.family) || ['Parameters', 'Comment'].includes(t.name))

  it('off leaves only the colour profile', async () => {
    for (const format of ['jpeg', 'webp', 'png'] as const) {
      const { info, result } = await job('ultra-hdr.jpg', { format })
      expect(metadata(info).length).toBeGreaterThan(0)
      expect(metadata(result), format).toEqual([])
      expect(result.colour.profile, format).toBe('Display P3 Gamut with sRGB Transfer')
      expect(result.kinds).not.toContain('ultra-hdr')
    }
  })

  it('off leaves only the colour profile in a repacked PNG', async () => {
    // A1111's PNG, given a profile.
    const png = await copyTags(
      'image.png',
      fixture('a1111.png'),
      { name: 'source.jpg', data: fixture('ultra-hdr.jpg') },
      ['-ICC_Profile'],
    )
    const { plan, info, result } = await job('a1111.png', {}, png)
    expect(plan.repack).toBe(true)
    expect(info.tags.some((t) => t.name === 'Parameters')).toBe(true)
    expect(metadata(result)).toEqual([])
    expect(result.colour.profile).toBe('Display P3 Gamut with sRGB Transfer')
  })

  it('off with no profile leaves nothing', async () => {
    const { result } = await job('photoshop.jpg', { format: 'webp' })
    expect(metadata(result)).toEqual([])
  })

  it('on copies the metadata under SPEC.md 6.0’s rules, at the result’s size', async () => {
    const { info, result } = await job('camera.jpg', { keepMetadata: true, format: 'webp' })
    expect(info.embedded.some((e) => e.kind === 'thumbnail')).toBe(true)
    expect(result.camera).toEqual(info.camera)
    expect(result.gps).toEqual(info.gps)
    expect(result.embedded.filter((e) => e.kind === 'thumbnail')).toEqual([])
    // Resized, the stored size is the result's.
    const apple = fixture('exiftool/Apple.jpg')
    const half = Math.ceil((await infoOf('Apple.jpg', apple)).displayWidth / 2)
    const resized = await job(
      'Apple.jpg',
      { keepMetadata: true, resize: true, maxWidth: half, maxHeight: 10_000 },
      apple,
    )
    expect(resized.result.width).toBe(half)
    expect(resized.result.tags.find((t) => t.name === 'ExifImageWidth')?.value).toBe(String(half))
  })
})
