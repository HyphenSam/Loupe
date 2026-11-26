import { describe, expect, it } from 'vitest'
import type { ImageInfo, Orientation } from '../info'
import { fakeInfo } from '../testing'
import { DEFAULT_CROP_ROTATE, planCropRotate, turnedSize, type CropRotateSettings } from './crop-rotate'
import { copyArgs } from './pixel-edit'

/** A JPEG stored `width` × `height` with `mcu` px blocks. */
function jpeg(width: number, height: number, mcu = 16, orientation: Orientation = 1, over: Partial<ImageInfo> = {}) {
  const base = fakeInfo()
  const sideways = orientation >= 5
  return fakeInfo({
    name: 'photo.jpg',
    width,
    height,
    orientation,
    displayWidth: sideways ? height : width,
    displayHeight: sideways ? width : height,
    tags: [],
    jpeg: { ...base.jpeg!, quality: 88, mcu: { width: mcu, height: mcu } },
    ...over,
  })
}

const settings = (over: Partial<CropRotateSettings>): CropRotateSettings => ({ ...DEFAULT_CROP_ROTATE, ...over })

describe('turnedSize', () => {
  it('is the upright size, swapped by a quarter turn', () => {
    expect(turnedSize(jpeg(40, 24, 16, 6), 1)).toEqual({ width: 24, height: 40 })
    expect(turnedSize(jpeg(40, 24, 16, 6), 6)).toEqual({ width: 40, height: 24 })
  })
})

describe('planCropRotate: problems', () => {
  it('can’t edit TIFF or raw pictures', () => {
    const preview = { id: 'EXIF:IFD0:PreviewImage', kind: 'preview', label: 'Preview', size: 900, extension: 'jpg', isImage: true }
    const raw = fakeInfo({ format: 'raw', formatName: 'NEF', embedded: [preview as never] })
    expect(planCropRotate(raw, settings({ turn: 6 })).problems).toEqual([
      'Loupe can’t edit NEF pictures. Extract the preview to edit that instead.',
    ])
  })

  it('needs a crop of at least 1 × 1 px inside the picture, naming the sizes', () => {
    const info = jpeg(64, 48)
    expect(planCropRotate(info, settings({ crop: { x: 0, y: 0, width: 0, height: 10 } })).problems).toEqual([
      'The crop is 0 × 10 px; it must be at least 1 × 1 px.',
    ])
    expect(planCropRotate(info, settings({ crop: { x: 40, y: 0, width: 32, height: 10 } })).problems).toEqual([
      'The crop goes outside the 64 × 48 px picture.',
    ])
    // The picture turned a quarter is 48 wide.
    expect(planCropRotate(info, settings({ turn: 6, crop: { x: 0, y: 0, width: 64, height: 10 } })).problems).toEqual([
      'The crop goes outside the 48 × 64 px picture.',
    ])
  })

  it('needs something to do', () => {
    expect(planCropRotate(jpeg(64, 48), DEFAULT_CROP_ROTATE)).toMatchObject({
      plan: null,
      problems: ['Crop, turn or straighten the picture.'],
    })
    // A crop of the whole picture is no crop.
    expect(planCropRotate(jpeg(64, 48), settings({ crop: { x: 0, y: 0, width: 64, height: 48 } })).plan).toBe(null)
  })
})

describe('planCropRotate: JPEG through jpegtran', () => {
  it('turns whole blocks losslessly', () => {
    const planned = planCropRotate(jpeg(64, 48), settings({ turn: 6 }))
    expect(planned).toMatchObject({
      problems: [],
      trim: null,
      plan: {
        kind: 'jpegtran',
        name: 'photo (rotated).jpg',
        type: 'image/jpeg',
        exifName: 'image.jpg',
        source: 'source.jpg',
        transform: 'rotate-90',
        crop: null,
        trim: false,
      },
    })
    expect(planned.caption).toBe('Only the picture’s blocks move; nothing is re-encoded.')
  })

  it('folds the source’s Orientation into the turn', () => {
    // Stored sideways (6) and turned left by the user: the stored picture as it is.
    expect(planCropRotate(jpeg(64, 48, 16, 6), settings({ turn: 8 })).plan).toMatchObject({ transform: 'none' })
    expect(planCropRotate(jpeg(64, 48, 16, 6), settings({ turn: 6 })).plan).toMatchObject({ transform: 'rotate-180' })
    expect(planCropRotate(jpeg(64, 48, 16, 6), settings({ turn: 2 })).plan).toMatchObject({ transform: 'transpose' })
  })

  it('stands a sideways picture upright when nothing else is asked', () => {
    expect(planCropRotate(jpeg(64, 48, 16, 6), DEFAULT_CROP_ROTATE).plan).toMatchObject({
      kind: 'jpegtran',
      transform: 'rotate-90',
      name: 'photo (rotated).jpg',
    })
  })

  it('offers to trim partial blocks a turn would move, lossless by default', () => {
    // orient-6.jpg: stored 40 × 24 with 16 px blocks; its partial bottom row is the upright picture’s left edge.
    const info = jpeg(40, 24, 16, 6)
    const trimmed = planCropRotate(info, DEFAULT_CROP_ROTATE)
    expect(trimmed).toMatchObject({
      trim: 'Trim 8 px from the left edge',
      plan: { kind: 'jpegtran', transform: 'rotate-90', trim: true, crop: null },
    })
    const reencoded = planCropRotate(info, settings({ partial: 'reencode' }))
    expect(reencoded).toMatchObject({
      trim: 'Trim 8 px from the left edge',
      plan: { kind: 'pixels', lossless: false, encoding: { format: 'jpeg', quality: 88 } },
    })
    expect(reencoded.caption).toBe('Re-encoded as JPEG at quality 88.')
  })

  it('names both edges when both need trimming', () => {
    expect(planCropRotate(jpeg(47, 24), settings({ turn: 3 })).trim).toBe(
      'Trim 15 px from the right edge and 8 px from the bottom edge',
    )
  })

  it('trims without asking when the crop leaves the partial blocks out anyway', () => {
    const planned = planCropRotate(jpeg(40, 24, 16, 6), settings({ crop: { x: 8, y: 16, width: 16, height: 20 } }))
    expect(planned).toMatchObject({
      trim: null,
      // Measured in the trimmed picture, which starts 8 px further right.
      plan: { kind: 'jpegtran', trim: true, crop: { x: 0, y: 16, width: 16, height: 20 }, name: 'photo (cropped).jpg' },
    })
  })

  it('clips a crop that reaches into the trimmed blocks', () => {
    const planned = planCropRotate(jpeg(40, 24, 16, 6), settings({ crop: { x: 4, y: 0, width: 20, height: 20 } }))
    expect(planned).toMatchObject({
      trim: 'Trim 8 px from the left edge',
      plan: { kind: 'jpegtran', trim: true, crop: { x: 0, y: 0, width: 16, height: 20 } },
    })
  })

  it('crops losslessly on the grid, and re-encodes off it', () => {
    const info = jpeg(64, 48)
    expect(planCropRotate(info, settings({ crop: { x: 16, y: 32, width: 21, height: 13 } })).plan).toMatchObject({
      kind: 'jpegtran',
      crop: { x: 16, y: 32, width: 21, height: 13 },
      trim: false,
    })
    const off = planCropRotate(info, settings({ crop: { x: 17, y: 32, width: 21, height: 13 } }))
    expect(off.plan).toMatchObject({
      kind: 'pixels',
      ops: [{ type: 'crop', rect: { x: 17, y: 32, width: 21, height: 13 } }],
    })
    expect(off.caption).toBe('Off the 16 px grid, so the picture is re-encoded. Re-encoded as JPEG at quality 88.')
  })

  it('sizes the grid by the blocks as turned', () => {
    const wide = jpeg(64, 48, 8, 1, { jpeg: { ...jpeg(64, 48).jpeg!, mcu: { width: 16, height: 8 } } })
    expect(planCropRotate(wide, settings({ turn: 6, crop: { x: 8, y: 16, width: 8, height: 8 } })).plan?.kind).toBe(
      'jpegtran',
    )
    expect(planCropRotate(wide, settings({ crop: { x: 8, y: 16, width: 8, height: 8 } })).caption).toMatch(
      /^Off the 16 × 8 px grid/,
    )
  })

  it('re-encodes to straighten', () => {
    const planned = planCropRotate(
      jpeg(64, 48),
      settings({ turn: 6, straighten: 2.5, crop: { x: 4, y: 4, width: 40, height: 50 } }),
    )
    expect(planned.plan).toMatchObject({
      kind: 'pixels',
      lossless: false,
      ops: [
        { type: 'turn', orientation: 6 },
        { type: 'straighten', degrees: 2.5 },
        { type: 'crop', rect: { x: 4, y: 4, width: 40, height: 50 } },
      ],
    })
    expect(planned.caption).toBe('Straightening resamples the picture. Re-encoded as JPEG at quality 88.')
  })
})

describe('planCropRotate: other formats', () => {
  const png = fakeInfo({ name: 'shot.png', format: 'png', formatName: 'PNG', lossless: true, jpeg: null, tags: [] })

  it('moves a lossless picture’s pixels exactly and writes it losslessly', () => {
    const planned = planCropRotate(png, settings({ turn: 8 }))
    expect(planned).toMatchObject({
      plan: {
        kind: 'pixels',
        name: 'shot (rotated).png',
        type: 'image/png',
        exifName: 'image.png',
        source: 'source.png',
        lossless: true,
        encoding: { format: 'png', lossless: true },
        ops: [{ type: 'turn', orientation: 8 }],
      },
    })
    expect(planned.caption).toBe('The pixels move exactly. Written losslessly as PNG.')
  })

  it('writes GIF and BMP as PNG', () => {
    const gif = fakeInfo({ name: 'a.gif', format: 'gif', lossless: true, jpeg: null, tags: [] })
    expect(planCropRotate(gif, settings({ turn: 6 })).plan).toMatchObject({ name: 'a (rotated).png', lossless: true })
  })

  it('isn’t lossless past 8 bits a channel, or for an animation’s first frame', () => {
    const deep = planCropRotate({ ...png, bitDepth: 16 }, settings({ turn: 6 }))
    expect(deep.plan).toMatchObject({ lossless: false })
    expect(deep.caption).toBe('The result has 8 bits a channel; the source has 16. Written losslessly as PNG.')
    const animated = { ...png, animation: { frames: 3, duration: 1, loops: 'forever' as const } }
    expect(planCropRotate(animated, settings({ turn: 6 }))).toMatchObject({
      plan: { lossless: false },
      caption: 'Only the first frame is kept. Written losslessly as PNG.',
    })
  })

  it('re-encodes lossy formats, HEIC as JPEG', () => {
    const heic = fakeInfo({ name: 'IMG_1.HEIC', format: 'heic', jpeg: null, tags: [] })
    const planned = planCropRotate(heic, settings({ turn: 6 }))
    expect(planned.plan).toMatchObject({ name: 'IMG_1 (rotated).jpg', source: 'source.heic', lossless: false })
    expect(planned.caption).toBe(
      'Browsers can’t write HEIC, so the result is a JPEG. Re-encoded as JPEG at quality 90.',
    )
  })

  it('takes the Output disclosure’s format and quality', () => {
    const output = { format: 'webp' as const, quality: 80, lossless: false }
    expect(planCropRotate(png, settings({ turn: 6, output })).plan).toMatchObject({
      name: 'shot (rotated).webp',
      lossless: false,
      encoding: output,
    })
    // A JPEG asked for at another quality is decoded and encoded, not turned by jpegtran.
    const jpegOut = { format: 'jpeg' as const, quality: 60, lossless: false }
    expect(planCropRotate(jpeg(64, 48), settings({ turn: 6, output: jpegOut })).plan?.kind).toBe('pixels')
  })

  it('names what a pixel edit drops, and copies the rest of the metadata', () => {
    const thumbnail = {
      id: 'EXIF:IFD1:ThumbnailImage',
      kind: 'thumbnail' as const,
      label: 'EXIF thumbnail',
      size: 5,
      extension: 'jpg',
      isImage: true,
    }
    const planned = planCropRotate(jpeg(64, 48, 16, 1, { embedded: [thumbnail] }), settings({ turn: 6 }))
    expect(planned.caption).toBe(
      'Only the picture’s blocks move; nothing is re-encoded. The embedded thumbnail is removed; it would show the picture before this edit.',
    )
    expect(planned.plan).toMatchObject({ args: expect.arrayContaining(['-all:all', '--IFD1:all']) })
  })

  it('converts the colours to sRGB for AVIF and JPEG XL, which can’t carry the colour profile here', () => {
    const jxl = { format: 'jxl' as const, quality: null, lossless: true }
    const planned = planCropRotate(png, settings({ turn: 6, output: jxl }))
    expect(planned.plan).toMatchObject({
      kind: 'pixels',
      srgb: true,
      lossless: false,
      args: copyArgs(png, 3024, 4032, true),
    })
    expect(planned.caption).toBe(
      'JPEG XL can’t carry the colour profile here, so the colours are converted to sRGB. Written losslessly as JPEG XL.',
    )
    const avif = { format: 'avif' as const, quality: 60, lossless: false }
    const turned = planCropRotate(jpeg(64, 48), settings({ turn: 6, output: avif }))
    expect(turned.plan).toMatchObject({ srgb: true, args: expect.not.arrayContaining(['-ICC_Profile']) })
    expect(turned.caption).toContain('AVIF can’t carry the colour profile here, so the colours are converted to sRGB.')
  })

  it('keeps the colours of an sRGB or profile-less source, and of JPEG, WebP and PNG results', () => {
    const avif = { format: 'avif' as const, quality: 60, lossless: false }
    const srgb = { profile: 'sRGB IEC61966-2.1', space: 'srgb' as const, hdr: null }
    const none = { profile: null, space: null, hdr: null }
    for (const colour of [srgb, none])
      expect(planCropRotate(jpeg(64, 48, 16, 1, { colour }), settings({ turn: 6, output: avif })).plan).toMatchObject({
        srgb: false,
        args: expect.arrayContaining(['-ICC_Profile']),
      })
    expect(planCropRotate(png, settings({ turn: 6 })).plan).toMatchObject({ srgb: false, lossless: true })
    const webp = { format: 'webp' as const, quality: 80, lossless: false }
    expect(planCropRotate(png, settings({ turn: 6, output: webp })).plan).toMatchObject({ srgb: false })
    // Straightened, a JPEG stays a JPEG.
    expect(planCropRotate(jpeg(64, 48), settings({ straighten: 1 })).plan).toMatchObject({ srgb: false })
  })
})
