// The worker's requests end to end in Node, against the fixtures.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Capabilities } from '@/lib/capabilities'
import type { ImageInfo } from '@/lib/info'
import type { Pixels } from '@/lib/pixels'
import type { Reply, StagePicture } from '@/lib/protocol'
import { FIXTURES, useNodeCodecs, useNodeExifTool } from '@/media/node'
import { CANT_OPEN, handle, NO_RAW_PREVIEW, NO_TIFF } from './handle'

beforeAll(async () => {
  useNodeExifTool()
  await useNodeCodecs()
})
vi.setConfig({ testTimeout: 30_000 })

const CHROME: Capabilities['shows'] = { avif: true, heic: false, jxl: false }
const fixture = (name: string) => new File([readFileSync(join(FIXTURES, name))], name.split('/').at(-1)!)

let nextId = 1
async function ask(request: Record<string, unknown> & { type: string }) {
  const replies: Reply[] = []
  await handle({ ...request, id: nextId++ } as never, (reply) => replies.push(reply))
  return replies
}

async function open(name: string, shows = CHROME) {
  const replies = await ask({ type: 'open', file: fixture(name), shows })
  const picture = replies.find((r) => r.type === 'picture')?.picture as StagePicture | undefined
  const done = replies.find((r) => r.type === 'done')?.value as ImageInfo | undefined
  const failed = replies.find((r) => r.type === 'failed')
  return { replies, picture, info: done, failed: failed?.type === 'failed' ? failed.message : undefined }
}

const done = <T>(replies: Reply[]) => (replies.find((r) => r.type === 'done') as { value: T } | undefined)?.value

describe('open', () => {
  it('lets the browser show a JPEG, and answers with ImageInfo after the picture', async () => {
    const { replies, picture, info } = await open('camera.jpg')
    expect(picture).toEqual({ type: 'file' })
    expect(replies.map((r) => r.type)).toEqual(['picture', 'done'])
    expect(info).toMatchObject({ name: 'camera.jpg', format: 'jpeg', camera: { make: 'Loupe' } })
  })

  it('decodes a HEIC the browser can’t show, sizing ImageInfo from what libheif decoded', async () => {
    const { picture, info } = await open('photo.heic')
    expect(picture).toMatchObject({ type: 'pixels', scaled: false, preview: false, pixels: { width: 64, height: 48 } })
    expect(info).toMatchObject({ format: 'heic', width: 64, height: 48, displayWidth: 64, displayHeight: 48 })
  })

  it('lets a browser that shows HEIC show it', async () => {
    expect((await open('photo.heic', { avif: true, heic: true, jxl: true })).picture).toEqual({ type: 'file' })
  })

  it('decodes JPEG XL where the browser can’t show it', async () => {
    expect((await open('photo.jxl')).picture).toMatchObject({ type: 'pixels', pixels: { width: 64, height: 48 } })
  })

  it('shows a raw file’s largest embedded preview, marked as one', async () => {
    const { picture, info } = await open('exiftool/FujiFilm.raf')
    expect(picture).toMatchObject({ type: 'pixels', preview: true })
    expect(info).toMatchObject({ format: 'raw', formatName: 'RAF' })
  })

  it.each([
    'CanonRaw.cr2',
    'CanonRaw.cr3',
    'CanonRaw.crw',
    'DNG.dng',
    'FujiFilm.raf',
    'Nikon.nef',
    'Panasonic.rw2',
    'PhaseOne.iiq',
    'Sigma.x3f',
  ])('opens %s, showing its preview or saying why not', async (name) => {
    const { picture, info, failed } = await open(`exiftool/${name}`)
    expect(failed).toBe(undefined)
    expect(info).toMatchObject({ format: 'raw' })
    expect(['pixels', 'none']).toContain(picture?.type)
  })

  it('says so when a raw file has no preview it can show', async () => {
    expect((await open('exiftool/Sigma.x3f')).picture).toEqual({ type: 'none', message: NO_RAW_PREVIEW })
  })

  it('shows no picture for TIFF, saying why, and still lists its metadata', async () => {
    const { picture, info } = await open('scan.tif')
    expect(picture).toEqual({ type: 'none', message: NO_TIFF })
    expect(info).toMatchObject({ format: 'tiff', width: 64, height: 48 })
  })

  it('turns away a file that isn’t a picture, in the words SPEC.md gives', async () => {
    const { failed, picture } = await open('notimage.txt')
    expect(failed).toBe(CANT_OPEN)
    expect(picture).toBe(undefined)
  })
})

describe('pixels and pixel', () => {
  it('gives the open picture’s upright pixels, scaled down to fit', async () => {
    await open('orient-6.jpg')
    const full = done<Pixels>(await ask({ type: 'pixels', maxSide: 4096 }))!
    expect([full.width, full.height]).toEqual([24, 40])
    const small = done<Pixels>(await ask({ type: 'pixels', maxSide: 20 }))!
    expect([small.width, small.height]).toEqual([12, 20])
  })

  it('reads one exact pixel, upright, and null outside the picture', async () => {
    await open('lossless.webp')
    expect(done(await ask({ type: 'pixel', x: 63, y: 47 }))).toEqual([230, 220, 70, 255])
    expect(done(await ask({ type: 'pixel', x: 64, y: 0 }))).toBe(null)
  })

  it('keeps the previous file when the next can’t be opened', async () => {
    await open('lossless.webp')
    await open('notimage.txt')
    expect(done(await ask({ type: 'pixel', x: 63, y: 47 }))).toEqual([230, 220, 70, 255])
  })

  it('says there’s no picture to read for TIFF', async () => {
    await open('scan.tif')
    const [reply] = await ask({ type: 'pixel', x: 0, y: 0 })
    expect(reply).toMatchObject({ type: 'failed', message: NO_TIFF })
  })
})
