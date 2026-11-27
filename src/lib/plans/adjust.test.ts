import { describe, expect, it } from 'vitest'
import { NEUTRAL } from '../adjust'
import type { Embedded, ImageInfo } from '../info'
import { fakeInfo } from '../testing'
import { DEFAULT_ADJUST, planAdjust, type AdjustSettings } from './adjust'
import { copyArgs } from './pixel-edit'

const png = fakeInfo({
  name: 'shot.png',
  format: 'png',
  formatName: 'PNG',
  lossless: true,
  jpeg: null,
  width: 400,
  height: 300,
  displayWidth: 400,
  displayHeight: 300,
})
const photo = (over: Partial<ImageInfo> = {}) =>
  fakeInfo({ name: 'photo.jpg', width: 64, height: 48, displayWidth: 48, displayHeight: 64, orientation: 6, ...over })
const thumbnail: Embedded = {
  id: 'EXIF:IFD1:ThumbnailImage',
  kind: 'thumbnail',
  label: 'EXIF thumbnail',
  size: 900,
  extension: 'jpg',
  isImage: true,
  tag: { family: 'EXIF', group: 'IFD1', name: 'ThumbnailImage' },
}

const brighter = { ...NEUTRAL, exposure: 0.5 }
const settings = (over: Partial<AdjustSettings> = {}): AdjustSettings => ({
  ...DEFAULT_ADJUST,
  adjustments: brighter,
  ...over,
})

describe('planAdjust: problems', () => {
  it('needs a slider moved', () => {
    expect(planAdjust(png, DEFAULT_ADJUST)).toEqual({
      plan: null,
      problems: ['Move a slider to adjust the picture.'],
      caption: null,
    })
  })

  it('can’t edit TIFF or raw pictures', () => {
    expect(planAdjust(fakeInfo({ format: 'raw', formatName: 'CR3' }), settings()).problems).toEqual([
      'Loupe can’t edit CR3 pictures.',
    ])
  })
})

describe('planAdjust', () => {
  it('writes a PNG losslessly, copying its metadata', () => {
    expect(planAdjust(png, settings())).toEqual({
      plan: {
        kind: 'pixels',
        name: 'shot (adjusted).png',
        type: 'image/png',
        exifName: 'image.png',
        source: 'source.png',
        args: copyArgs(png, 400, 300),
        ops: [{ type: 'adjust', adjustments: brighter }],
        encoding: { format: 'png', quality: null, lossless: true },
        srgb: false,
        lossless: true,
      },
      problems: [],
      caption: 'Only the adjustment changes the pixels. Written losslessly as PNG.',
    })
  })

  it('re-encodes a JPEG at its quality, upright, and drops its thumbnail', () => {
    const info = photo({ embedded: [thumbnail] })
    const planned = planAdjust(info, settings())
    expect(planned.plan).toMatchObject({
      name: 'photo (adjusted).jpg',
      args: copyArgs(info, 48, 64),
      encoding: { format: 'jpeg', quality: 92, lossless: false },
      lossless: false,
    })
    expect(planned.caption).toBe(
      'Re-encoded as JPEG at quality 92. The embedded thumbnail is removed; it would show the picture before this edit.',
    )
  })

  it('writes HEIC as JPEG and says why; an animation keeps its first frame', () => {
    const heic = planAdjust(fakeInfo({ name: 'IMG.HEIC', format: 'heic', jpeg: null }), settings())
    expect(heic.plan).toMatchObject({ name: 'IMG (adjusted).jpg' })
    expect(heic.caption).toContain('Browsers can’t write HEIC, so the result is a JPEG.')
    const gif = fakeInfo({
      name: 'a.gif',
      format: 'gif',
      lossless: true,
      jpeg: null,
      animation: { frames: 4, duration: 400, loops: 'forever' },
    })
    const planned = planAdjust(gif, settings())
    expect(planned.plan).toMatchObject({ name: 'a (adjusted).png', lossless: false })
    expect(planned.caption).toContain('Only the first frame is kept.')
  })

  it('follows the Output choice', () => {
    const output = { format: 'webp' as const, quality: 80, lossless: false }
    expect(planAdjust(png, settings({ output })).plan).toMatchObject({ name: 'shot (adjusted).webp', encoding: output })
  })

  it('converts the colours to sRGB for AVIF and JPEG XL, which can’t carry the colour profile here', () => {
    const jxl = { format: 'jxl' as const, quality: null, lossless: true }
    const planned = planAdjust(png, settings({ output: jxl }))
    expect(planned.plan).toMatchObject({ srgb: true, lossless: false, args: copyArgs(png, 400, 300, true) })
    expect(planned.plan).toMatchObject({ args: expect.not.arrayContaining(['-ICC_Profile']) })
    expect(planned.caption).toBe(
      'JPEG XL can’t carry the colour profile here, so the colours are converted to sRGB. Written losslessly as JPEG XL.',
    )
    const avif = planAdjust(photo(), settings({ output: { format: 'avif', quality: 60, lossless: false } }))
    expect(avif.plan).toMatchObject({ srgb: true })
    expect(avif.caption).toContain('AVIF can’t carry the colour profile here, so the colours are converted to sRGB.')
  })

  it('keeps the colours of an sRGB or profile-less source, and of JPEG, WebP and PNG results', () => {
    const avif = { output: { format: 'avif' as const, quality: 60, lossless: false } }
    const srgb = photo({ colour: { profile: 'sRGB IEC61966-2.1', space: 'srgb', hdr: null } })
    const none = photo({ colour: { profile: null, space: null, hdr: null } })
    for (const info of [srgb, none]) {
      const planned = planAdjust(info, settings(avif))
      expect(planned.plan).toMatchObject({ srgb: false })
      expect(planned.caption).not.toContain('sRGB')
    }
    expect(planAdjust(photo(), settings()).plan).toMatchObject({ srgb: false, args: copyArgs(photo(), 48, 64) })
    const webp = { format: 'webp' as const, quality: null, lossless: true }
    expect(planAdjust(png, settings({ output: webp })).plan).toMatchObject({ srgb: false, lossless: true })
  })
})
