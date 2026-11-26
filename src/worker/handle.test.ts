// The worker's requests end to end in Node, against the fixtures.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Capabilities } from '@/lib/capabilities'
import type { ImageInfo } from '@/lib/info'
import type { Pixels } from '@/lib/pixels'
import type { Fingerprint, Reply, StagePicture, ThumbnailMatch } from '@/lib/protocol'
import { FIXTURES, useNodeCodecs, useNodeExifTool, useNodeJpegtran, useNodePlaces } from '@/media/node'
import { orient } from '@/lib/pixels'
import { DEFAULT_CROP_ROTATE, planCropRotate } from '@/lib/plans/crop-rotate'
import { decode } from '@/media/codecs'
import { CANT_OPEN, handle, NO_RAW_PREVIEW, NO_TIFF } from './handle'
import { hashDistance } from '@/lib/forensics/phash'

beforeAll(async () => {
  useNodeExifTool()
  useNodeJpegtran()
  useNodePlaces()
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

  it('says whether the picture is stored losslessly', async () => {
    expect((await open('lossless.webp')).info?.lossless).toBe(true)
    expect((await open('lossless.jxl')).info?.lossless).toBe(true)
    expect((await open('screenshot.png')).info?.lossless).toBe(true)
    expect((await open('lossy.webp')).info?.lossless).toBe(false)
    expect((await open('camera.jpg')).info?.lossless).toBe(false)
  })

  it('looks up the nearest place for a picture with GPS, and none for one without', async () => {
    expect((await open('camera.jpg')).info?.place).toMatchObject({
      type: 'town',
      name: 'Arrowtown',
      region: 'Otago',
      country: 'New Zealand',
    })
    expect((await open('photo.heic')).info?.place).toBeNull()
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

describe('png', () => {
  it('gives the open picture upright as a PNG Blob, its pixels exact', async () => {
    await open('orient-6.jpg')
    const blob = done<Blob>(await ask({ type: 'png' }))!
    expect(blob.type).toBe('image/png')
    const back = await decode(new Uint8Array(await blob.arrayBuffer()), 'png', 1)
    const upright = done<Pixels>(await ask({ type: 'pixels', maxSide: 4096 }))!
    expect([back.width, back.height]).toEqual([24, 40])
    expect(back.data).toEqual(upright.data)
  })

  it('converts another picture, a result, standing it upright', async () => {
    await open('camera.jpg')
    const source = { blob: fixture('orient-6.jpg'), format: 'jpeg', orientation: 6 }
    const blob = done<Blob>(await ask({ type: 'png', source }))!
    const back = await decode(new Uint8Array(await blob.arrayBuffer()), 'png', 1)
    expect([back.width, back.height]).toEqual([24, 40])
  })

  it('says there’s no picture to copy for TIFF', async () => {
    await open('scan.tif')
    expect((await ask({ type: 'png' }))[0]).toMatchObject({ type: 'failed', message: NO_TIFF })
  })
})

describe('generators', () => {
  const generators = async (name: string) => (await open(name)).info?.generators

  // Each generator fixture, read through ExifTool (and the pixels, for stealth metadata) as the app reads it.
  it.each([
    ['a1111.png', { name: 'Forge', seed: '3141592653', size: '832 × 1216', model: 'juggernautXL_v9' }],
    ['a1111.jpg', { name: 'AUTOMATIC1111', prompt: 'a red bicycle against a brick wall', negative: 'cartoon' }],
    [
      'comfyui.png',
      {
        name: 'ComfyUI',
        seed: '156680208700286',
        model: 'v1-5-pruned-emaonly-fp16.safetensors',
        workflow: expect.objectContaining({ nodes: 9 }),
      },
    ],
    [
      'comfyui.webp',
      { name: 'ComfyUI', steps: '20', size: '512 × 512', workflow: expect.objectContaining({ nodes: 9 }) },
    ],
    [
      'invokeai.png',
      { name: 'InvokeAI', model: 'Juggernaut XL v9', loras: [{ name: 'Pixel Art XL', weight: '0.75' }] },
    ],
    ['swarmui.png', { name: 'SwarmUI', prompt: 'a photo of a cat', modelHash: expect.stringMatching(/^0xd7a9/) }],
    ['midjourney.png', { name: 'Midjourney', prompt: 'a bowl of ramen, food photography', model: 'Midjourney 6.1' }],
    ['drawthings.png', { name: 'Draw Things', prompt: 'a koi pond, watercolour', size: '1024 × 768' }],
    ['tensorart.png', { name: 'Tensor.Art', seed: '3013050530', model: 'Illustrious-XL-v1' }],
  ])('reads %s', async (name, expected) => {
    expect(await generators(name)).toEqual([expect.objectContaining(expected)])
  })

  it('reads NovelAI’s text chunks and finds the same in the alpha channel', async () => {
    expect(await generators('novelai.png')).toEqual([
      expect.objectContaining({
        name: 'NovelAI',
        model: 'NovelAI Diffusion V4.5',
        modelHash: '4BDE2A90',
        where: ['the PNG text chunks “Software”, “Source” and “Comment”', 'the lowest bits of the alpha channel'],
      }),
    ])
  })

  it('reads stealth metadata from the colour channels of a PNG with no text chunks', async () => {
    expect(await generators('stealth.png')).toEqual([
      expect.objectContaining({
        name: 'AUTOMATIC1111',
        prompt: 'a paper boat on a puddle',
        where: ['the lowest bits of the red, green and blue channels'],
      }),
    ])
  })

  // Real files from sd-parsers' tests: each generator's own output, cropped.
  it.each([
    ['automatic1111_cropped.png', { name: 'AUTOMATIC1111', prompt: 'photo of a duck', seed: '235284042' }],
    ['automatic1111_cropped.jpg', { name: 'AUTOMATIC1111', negative: 'monochrome', size: '512 × 400' }],
    ['automatic1111_stealth.png', { name: 'AUTOMATIC1111', prompt: 'a circle', negative: 'a square' }],
    [
      'img2img_cropped.png',
      { name: 'ComfyUI', prompt: 'photograph of victorian woman with wings, sky clouds, meadow grass' },
    ],
    ['fooocus1_cropped.png', { name: 'Fooocus', prompt: 'a smiling goldfish', size: '768 × 1280' }],
    ['invokeai_imeta1.png', { name: 'InvokeAI', model: 'juggernautXL', steps: '35' }],
    ['invokeai_sdmeta1.png', { name: 'InvokeAI', model: 'deliberateForInvoke_v08', size: '512 × 768' }],
    ['invokeai_dream1.png', { name: 'InvokeAI', seed: '2980747362', sampler: 'k_lms' }],
    [
      'novelai1_cropped.png',
      { name: 'NovelAI', modelHash: '1D44365E', prompt: 'masterpiece, best quality,  cat, space, icon' },
    ],
  ])('reads the real %s', async (name, expected) => {
    expect(await generators(`sd-parsers/${name}`)).toEqual([expect.objectContaining(expected)])
  })

  it('finds none in a camera’s picture', async () => {
    expect(await generators('camera.jpg')).toEqual([])
  })
})

describe('run', () => {
  it('runs a metadata plan on the open file and reads the result back', async () => {
    await open('camera.jpg')
    const plan = {
      kind: 'metadata',
      name: 'camera (cleaned).jpg',
      type: 'image/jpeg',
      exifName: 'image.jpg',
      args: ['-GPS:all='],
      readBack: true,
    }
    const replies = await ask({ type: 'run', plan })
    expect(replies[0]).toMatchObject({ type: 'progress', fraction: null })
    const result = done<{ blob: Blob; info: ImageInfo }>(replies)!
    expect(result.blob.type).toBe('image/jpeg')
    expect(result.info).toMatchObject({ name: 'camera (cleaned).jpg', gps: null, camera: { make: 'Loupe' } })
  })

  it('runs a pixel plan on the open picture’s upright pixels', async () => {
    const { info } = await open('orient-6.jpg')
    const plan = planCropRotate(info!, { ...DEFAULT_CROP_ROTATE, turn: 2, partial: 'reencode', straighten: 0.1 }).plan
    const result = done<{ blob: Blob }>(await ask({ type: 'run', plan }))!
    const out = new Uint8Array(await result.blob.arrayBuffer())
    const pixels = await decode(out, 'jpeg', 1)
    expect([pixels.width, pixels.height]).toEqual([24, 40])
  })

  it('turns a PNG exactly, and runs a jpegtran plan on the open file', async () => {
    const { info } = await open('screenshot.png')
    const png = planCropRotate(info!, { ...DEFAULT_CROP_ROTATE, turn: 6 }).plan
    const turned = new Uint8Array(await done<{ blob: Blob }>(await ask({ type: 'run', plan: png }))!.blob.arrayBuffer())
    const source = await decode(new Uint8Array(readFileSync(join(FIXTURES, 'screenshot.png'))), 'png', 1)
    expect((await decode(turned, 'png', 1)).data).toEqual(orient(source, 6).data)

    const grid = (await open('grid-444.jpg')).info!
    const plan = planCropRotate(grid, { ...DEFAULT_CROP_ROTATE, turn: 8 }).plan
    expect(plan?.kind).toBe('jpegtran')
    const out = new Uint8Array(await done<{ blob: Blob }>(await ask({ type: 'run', plan }))!.blob.arrayBuffer())
    expect((await decode(out, 'jpeg', 1)).width).toBe(48)
  })
})

describe('forensics', () => {
  it('reads Photoshop’s history at open, each step whole', async () => {
    const { info } = await open('photoshop.jpg')
    expect(info!.edits.history.map((s) => s.action)).toEqual(['Created', 'Saved', 'Converted', 'Derived', 'Saved'])
    expect(info!.edits.history[2]).toEqual({
      action: 'Converted',
      when: null,
      software: null,
      detail: 'From PSD to JPEG',
    })
  })

  it('reads the JPEG’s tables and the data after its picture at open', async () => {
    const { info } = await open('trailer-zip.jpg')
    expect(info!.jpeg).toMatchObject({ quality: 90, tables: 'ijg' })
    expect(info!.trailer).toMatchObject({ offset: 709, looksLike: 'zip' })
  })
})

describe('extract', () => {
  it('gives the data after the end of the picture, as it is', async () => {
    const { info } = await open('trailer-zip.jpg')
    const blob = done<Blob>(await ask({ type: 'extract', item: 'trailer' }))!
    expect(blob.type).toBe('application/zip')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const source = readFileSync(join(FIXTURES, 'trailer-zip.jpg'))
    expect(bytes).toEqual(new Uint8Array(source.subarray(info!.trailer!.offset)))
  })

  it.each(['motion-photo.jpg', 'motion-photo.heic'])('gives %s’s video as the MP4 Loupe found', async (name) => {
    const { info } = await open(name)
    const blob = done<Blob>(await ask({ type: 'extract', item: 'motion-video' }))!
    expect(blob.type).toBe('video/mp4')
    const { offset, length } = info!.motion!
    const source = readFileSync(join(FIXTURES, name))
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array(source.subarray(offset, offset + length)))
  })

  it('says so when the file has no such item', async () => {
    await open('camera.jpg')
    const replies = await ask({ type: 'extract', item: 'trailer' })
    expect(replies).toEqual([
      expect.objectContaining({ type: 'failed', message: 'This file has nothing to save as “trailer”.' }),
    ])
  })
})

describe('run with a cut', () => {
  it('cuts the hidden data out before ExifTool runs, and reads the result back without it', async () => {
    await open('trailer-zip.jpg')
    const plan = {
      kind: 'metadata',
      name: 'trailer-zip (cleaned).jpg',
      type: 'image/jpeg',
      exifName: 'image.jpg',
      args: [],
      cut: { offset: 709, length: 149 },
      readBack: true,
    }
    const result = done<{ blob: Blob; info: ImageInfo }>(await ask({ type: 'run', plan }))!
    const out = new Uint8Array(await result.blob.arrayBuffer())
    expect(out).toEqual(new Uint8Array(readFileSync(join(FIXTURES, 'grid-420.jpg'))))
    expect(result.info.trailer).toBe(null)
  })
})

describe('layer', () => {
  const grey = (p: Pixels) => {
    for (let i = 0; i < p.data.length; i += 4) {
      if (p.data[i] !== p.data[i + 1] || p.data[i] !== p.data[i + 2] || p.data[i + 3] !== 255) return false
    }
    return true
  }

  it.each(['ela', 'noise'])(
    'gives the %s layer as opaque grey pixels the size of the upright picture',
    async (layer) => {
      await open('orient-6.jpg')
      const pixels = done<Pixels>(await ask({ type: 'layer', layer, quality: 90, amount: 10 }))!
      expect([pixels.width, pixels.height]).toEqual([24, 40])
      expect(grey(pixels)).toBe(true)
      expect(pixels.data.some((v, i) => i % 4 === 0 && v > 0)).toBe(true)
    },
  )

  it('amplifies the same levels by the amount asked for', async () => {
    await open('camera.jpg')
    const once = done<Pixels>(await ask({ type: 'layer', layer: 'ela', quality: 80, amount: 1 }))!
    const thrice = done<Pixels>(await ask({ type: 'layer', layer: 'ela', quality: 80, amount: 3 }))!
    for (let i = 0; i < once.data.length; i += 4) expect(thrice.data[i]).toBe(Math.min(255, once.data[i] * 3))
  })

  it('re-saves at the quality asked for', async () => {
    await open('camera.jpg')
    const sum = (p: Pixels) => p.data.reduce((a, v, i) => (i % 4 === 0 ? a + v : a), 0)
    const low = done<Pixels>(await ask({ type: 'layer', layer: 'ela', quality: 70, amount: 1 }))!
    const high = done<Pixels>(await ask({ type: 'layer', layer: 'ela', quality: 95, amount: 1 }))!
    expect(sum(low)).toBeGreaterThan(sum(high))
  })

  it('says there’s no picture for TIFF', async () => {
    await open('scan.tif')
    expect((await ask({ type: 'layer', layer: 'noise', quality: 90, amount: 10 }))[0]).toMatchObject({
      type: 'failed',
      message: NO_TIFF,
    })
  })

  it('gives the depth map as it’s stored, upright, its near square over the picture’s white corner', async () => {
    await open('depth.jpg')
    const depth = done<Pixels>(await ask({ type: 'layer', layer: 'depth', quality: 90, amount: 10 }))!
    expect([depth.width, depth.height]).toEqual([32, 24])
    expect(grey(depth)).toBe(true)
    const at = (x: number, y: number) => depth.data[(y * 32 + x) * 4]
    expect([at(0, 0), at(3, 3), at(4, 0), at(31, 23)]).toEqual([255, 255, 60, 180])
  })

  it('says when there’s no depth map', async () => {
    await open('camera.jpg')
    expect((await ask({ type: 'layer', layer: 'depth', quality: 90, amount: 10 }))[0]).toMatchObject({
      type: 'failed',
      message: 'This file has no depth map Loupe can show.',
    })
  })
})

describe('fingerprint', () => {
  const sha256 = (name: string) =>
    createHash('sha256')
      .update(readFileSync(join(FIXTURES, name)))
      .digest('hex')

  it('gives the open file’s SHA-256 and its picture’s perceptual hash', async () => {
    await open('camera.jpg')
    const print = done<Fingerprint>(await ask({ type: 'fingerprint' }))!
    expect(print.sha256).toBe(sha256('camera.jpg'))
    expect(print.phash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('gives no perceptual hash for a picture Loupe can’t show', async () => {
    await open('scan.tif')
    expect(done<Fingerprint>(await ask({ type: 'fingerprint' }))).toEqual({ sha256: sha256('scan.tif'), phash: null })
  })

  it('fingerprints another file without opening it, its picture stood upright', async () => {
    await open('orient-6.jpg')
    const mine = done<Fingerprint>(await ask({ type: 'fingerprint' }))!
    // The upright picture as a PNG: the same picture, other bytes.
    const png = done<Blob>(await ask({ type: 'png' }))!
    const theirs = done<Fingerprint>(await ask({ type: 'fingerprint', file: new File([png], 'upright.png') }))!
    expect(theirs.sha256).not.toBe(mine.sha256)
    expect(hashDistance(theirs.phash!, mine.phash!)).toBe(0)
    // The open file is still the one asked about.
    expect(done<Fingerprint>(await ask({ type: 'fingerprint' }))).toEqual(mine)
  })

  it('turns away another file that isn’t a picture', async () => {
    await open('camera.jpg')
    const [reply] = await ask({ type: 'fingerprint', file: fixture('notimage.txt') })
    expect(reply).toMatchObject({ type: 'failed', message: CANT_OPEN })
  })
})

describe('thumbnail', () => {
  it('finds camera.jpg’s EXIF thumbnail matches its picture', async () => {
    await open('camera.jpg')
    const match = done<ThumbnailMatch>(await ask({ type: 'thumbnail' }))!
    expect(match).toMatchObject({ label: 'EXIF thumbnail', matches: true, aspectDiffers: false })
    expect(match.distance).toBeLessThanOrEqual(10)
    expect(match.thumbnail.type).toBe('image/png')
    const thumb = await decode(new Uint8Array(await match.thumbnail.arrayBuffer()), 'png', 1)
    expect([thumb.width, thumb.height]).toEqual([32, 24])
  })

  it('finds cropped-thumb.jpg’s thumbnail still shows the whole picture', async () => {
    await open('cropped-thumb.jpg')
    expect(done<ThumbnailMatch>(await ask({ type: 'thumbnail' }))).toMatchObject({
      matches: false,
      aspectDiffers: true,
    })
  })

  it('has none for a file without one, nor for a raw file, whose picture is its preview', async () => {
    await open('lossless.webp')
    expect(done(await ask({ type: 'thumbnail' }))).toBe(null)
    await open('exiftool/Nikon.nef')
    expect(done(await ask({ type: 'thumbnail' }))).toBe(null)
  })
})
