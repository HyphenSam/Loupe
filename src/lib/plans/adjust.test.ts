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
    expect(planAdjust(fakeInfo({ format: 'raw' }), settings()).problems).toEqual([
      'Loupe can’t edit TIFF or raw pictures. Extract the preview to edit that instead.',
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
})
