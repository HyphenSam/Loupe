// Redact's jobs end to end in Node (SPEC.md 6.9): planned from the fixtures' ImageInfo, run as the worker runs them,
// and the result decoded and read back.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sniff } from '@/lib/formats'
import type { ImageInfo } from '@/lib/info'
import type { Pixels, Rect } from '@/lib/pixels'
import { DEFAULT_REDACT, planRedact, type RedactSettings } from '@/lib/plans/redact'
import { privacyFindings } from '@/lib/privacy'
import type { Fill } from '@/lib/redact'
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

async function job(name: string, settings: Partial<RedactSettings>) {
  const bytes = fixture(name)
  const info = await infoOf(name, bytes)
  const planned = planRedact(info, { ...DEFAULT_REDACT, ...settings })
  if (!planned.plan) throw new Error(planned.problems.join(' '))
  const upright = () => decode(bytes, info.format, info.orientation)
  const { blob } = await run(planned.plan, bytes, upright)
  const out = new Uint8Array(await blob.arrayBuffer())
  return { plan: planned.plan, out, result: await infoOf(planned.plan.name, out), source: { bytes, info, upright } }
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height
const at = (p: Pixels, x: number, y: number) =>
  Array.from(p.data.subarray(4 * (y * p.width + x), 4 * (y * p.width + x) + 4))

describe('a redacted PNG', () => {
  const boxes = [
    { x: 4, y: 6, width: 40, height: 12 },
    { x: 50, y: 30, width: 20, height: 20 },
  ]

  it.each<Fill>(['black', 'blur', 'pixelate'])('differs from its source only inside the boxes (%s)', async (fill) => {
    const { plan, out, source } = await job('screenshot.png', { boxes, fill })
    expect(plan).toMatchObject({ kind: 'pixels', lossless: true })
    expect(sniff(out)).toBe('png')
    const [before, after] = [await source.upright(), await decode(out, 'png', 1)]
    expect([after.width, after.height]).toEqual([before.width, before.height])
    let changed = 0
    for (let y = 0; y < before.height; y++)
      for (let x = 0; x < before.width; x++) {
        const box = boxes.find((b) => inside(b, x, y))
        const same = at(after, x, y).join() === at(before, x, y).join()
        if (!box) expect(same, `${x}, ${y}`).toBe(true)
        else if (!same) changed++
        if (box && fill === 'black') expect(at(after, x, y)).toEqual([0, 0, 0, 255])
      }
    expect(changed).toBeGreaterThan(0)
  })
})

describe('a redacted JPEG', () => {
  const boxes = [{ x: 8, y: 8, width: 24, height: 16 }]

  it('has no thumbnail and, with the switch on, nothing identifying', async () => {
    const { source, result, out } = await job('camera.jpg', { boxes })
    expect(source.info.embedded.some((e) => e.kind === 'thumbnail')).toBe(true)
    expect(privacyFindings(source.info, null).length).toBeGreaterThan(3)
    expect(sniff(out)).toBe('jpeg')
    expect(result.embedded).toEqual([])
    expect(privacyFindings(result, null)).toEqual([])
    expect(result.gps).toBe(null)
    expect(result.orientation).toBe(1)
  })

  it('keeps its other metadata with the switch off, but not the thumbnail', async () => {
    const { source, result } = await job('camera.jpg', { boxes, removeMetadata: false })
    expect(result.embedded.filter((e) => e.kind === 'thumbnail' || e.kind === 'preview')).toEqual([])
    expect(result.gps).toEqual(source.info.gps)
    expect(source.info.camera?.bodySerial).toBeTruthy()
    expect(result.camera).toEqual(source.info.camera)
  })

  it.each([true, false])('has no Content Credentials (switch %s)', async (removeMetadata) => {
    const { source, result } = await job('c2pa/CA.jpg', { boxes, removeMetadata })
    expect(source.info.embedded.some((e) => e.kind === 'c2pa-manifest')).toBe(true)
    expect(result.embedded.filter((e) => e.kind === 'c2pa-manifest')).toEqual([])
    expect(result.tags.filter((t) => t.family === 'JUMBF')).toEqual([])
  })

  it('stands a sideways picture upright', async () => {
    const { source, result } = await job('orient-6.jpg', { boxes: [{ x: 0, y: 0, width: 4, height: 4 }] })
    expect(source.info.orientation).toBe(6)
    expect(result.orientation).toBe(1)
    expect([result.width, result.height]).toEqual([source.info.displayWidth, source.info.displayHeight])
  })
})
