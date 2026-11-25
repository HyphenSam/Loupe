// Decoding in Node, against the real fixtures: jSquash for PNG, JPEG, WebP and JPEG XL, libheif for HEIC,
// ExifTool for raw previews. AVIF, GIF and BMP go through the browser and are checked there.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { pixelAt, type Pixels } from '@/lib/pixels'
import type { Embedded } from '@/lib/info'
import { decode, largestPreview } from './codecs'
import { readBinary } from './exiftool'
import { fixture, useNodeCodecs, useNodeExifTool } from './node'

// The raw previews start ExifTool cold; beside the other ExifTool suites in a full run that takes more than
// Vitest's default 5 s.
vi.setConfig({ testTimeout: 30_000 })

beforeAll(async () => {
  useNodeExifTool()
  await useNodeCodecs()
})

/** Whether a pixel is (nearly) white: the fixtures' marker in the stored top-left corner. */
const white = (p: Pixels, x: number, y: number) => pixelAt(p, x, y)!.slice(0, 3).every((v) => v > 230)

describe('decode', () => {
  it.each([
    ['grid-420.jpg', 'jpeg'],
    ['grid-444.jpg', 'jpeg'],
    ['lossy.webp', 'webp'],
    ['lossless.webp', 'webp'],
    ['photo.jxl', 'jxl'],
    ['lossless.jxl', 'jxl'],
    ['png-16-alpha.png', 'png'],
    ['screenshot.png', 'png'],
  ] as const)('decodes %s to 64 × 48 with the white corner at the top left', async (name, format) => {
    const p = await decode(fixture(name), format, 1)
    expect([p.width, p.height]).toEqual([64, 48])
    if (name !== 'png-16-alpha.png') expect(white(p, 2, 2)).toBe(true)
    expect(white(p, 40, 30)).toBe(false)
  })

  it('keeps lossless pictures’ exact stored values', async () => {
    const p = await decode(fixture('lossless.webp'), 'webp', 1)
    // The fixtures' gradient: red is x / 63 × 230; green is y / 47 × 200 + 20; blue alternates by 8 px block.
    expect(pixelAt(p, 63, 47)).toEqual([230, 220, 70, 255])
    expect(pixelAt(await decode(fixture('lossless.jxl'), 'jxl', 1), 63, 47)).toEqual([230, 220, 70, 255])
  })

  it('takes 16-bit PNGs down to 8 bits and keeps their alpha', async () => {
    const p = await decode(fixture('png-16-alpha.png'), 'png', 1)
    expect(pixelAt(p, 0, 0)![3]).toBe(0)
    expect(pixelAt(p, 63, 0)![3]).toBe(255)
  })

  it('stands a JPEG upright from its Orientation', async () => {
    const p = await decode(fixture('orient-6.jpg'), 'jpeg', 6)
    expect([p.width, p.height]).toEqual([24, 40])
    expect(white(p, 21, 2)).toBe(true)
    expect(white(p, 2, 2)).toBe(false)
  })

  it('decodes HEIC with libheif, its crop and turns applied', async () => {
    const p = await decode(fixture('photo.heic'), 'heic', 1)
    expect([p.width, p.height]).toEqual([64, 48])
    expect(white(p, 2, 2)).toBe(true)
  })

  it('doesn’t turn a HEIC again for its EXIF Orientation, which describes the turn libheif made', async () => {
    const p = await decode(fixture('photo.heic'), 'heic', 6)
    expect([p.width, p.height]).toEqual([64, 48])
  })

  it('fails in words for a file the decoder can’t read', async () => {
    await expect(decode(fixture('notimage.txt'), 'jpeg', 1)).rejects.toThrow()
  })
})

describe('largestPreview', () => {
  it('picks the largest embedded picture of a raw file and decodes it upright', async () => {
    // ExifTool's samples keep their previews but shrink them; FujiFilm.raf's is 8 × 8 with a 120 × 160
    // thumbnail beside it.
    const raf = fixture('exiftool/FujiFilm.raf')
    const item = (id: string, kind: Embedded['kind'], size: number): Embedded => ({ id, kind, label: '', size, extension: 'jpg', isImage: true })
    const thumbnail = item('EXIF:IFD1:ThumbnailImage', 'thumbnail', 9362)
    const preview = item('File:File:PreviewImage', 'preview', 12167)
    const largest = await largestPreview('FujiFilm.raf', raf, [thumbnail, preview], 1)
    const expected = await decode((await readBinary('FujiFilm.raf', raf, preview.id))!, 'jpeg', 1)
    expect(largest).toEqual(expected)
    const sideways = await largestPreview('FujiFilm.raf', raf, [thumbnail], 6)
    const upright = await decode((await readBinary('FujiFilm.raf', raf, thumbnail.id))!, 'jpeg', 6)
    expect(sideways).toEqual(upright)
  })

  it('is null when nothing embedded can be decoded', async () => {
    expect(await largestPreview('x.x3f', fixture('exiftool/Sigma.x3f'), [], 1)).toBe(null)
  })
})
