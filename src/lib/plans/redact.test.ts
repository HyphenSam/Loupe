import { describe, expect, it } from 'vitest'
import type { Embedded, ImageInfo } from '../info'
import { fakeInfo } from '../testing'
import { copyArgs } from './pixel-edit'
import { DEFAULT_REDACT, planRedact, type RedactSettings } from './redact'

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
  fakeInfo({ name: 'photo.jpg', width: 64, height: 48, displayWidth: 64, displayHeight: 48, ...over })
const thumbnail: Embedded = {
  id: 'EXIF:IFD1:ThumbnailImage',
  kind: 'thumbnail',
  label: 'EXIF thumbnail',
  size: 900,
  extension: 'jpg',
  isImage: true,
}
const manifest: Embedded = {
  id: 'c2pa-manifest',
  kind: 'c2pa-manifest',
  label: 'Content Credentials',
  size: 9000,
  extension: 'c2pa',
  isImage: false,
}

const box = { x: 10, y: 20, width: 100, height: 30 }
const settings = (over: Partial<RedactSettings>): RedactSettings => ({ ...DEFAULT_REDACT, boxes: [box], ...over })

describe('planRedact: problems', () => {
  it('needs a box', () => {
    expect(planRedact(png, DEFAULT_REDACT)).toEqual({
      plan: null,
      problems: ['Draw a box over what to hide.'],
      caption: null,
    })
    // A box wholly outside the picture is none.
    expect(planRedact(png, settings({ boxes: [{ x: 500, y: 0, width: 10, height: 10 }] })).problems).toEqual([
      'Draw a box over what to hide.',
    ])
  })

  it('can’t edit TIFF or raw pictures', () => {
    expect(planRedact(fakeInfo({ format: 'tiff', formatName: 'TIFF' }), settings({})).problems).toEqual([
      'Loupe can’t edit TIFF pictures.',
    ])
  })
})

describe('planRedact: lossless formats', () => {
  it('writes a PNG losslessly with only the boxes changed, and by default only its colour profile kept', () => {
    expect(planRedact(png, settings({ fill: 'pixelate' }))).toEqual({
      plan: {
        kind: 'pixels',
        name: 'shot (redacted).png',
        type: 'image/png',
        exifName: 'image.png',
        source: 'source.png',
        args: ['-ICC_Profile'],
        ops: [{ type: 'redact', boxes: [box], fill: 'pixelate' }],
        encoding: { format: 'png', quality: null, lossless: true },
        srgb: false,
        lossless: true,
      },
      problems: [],
      caption: 'Only the boxes change. Written losslessly as PNG. All metadata is removed but the colour profile.',
    })
  })

  it('keeps the metadata with the switch off, as every pixel edit does', () => {
    const planned = planRedact(png, settings({ removeMetadata: false }))
    expect(planned.plan).toMatchObject({ args: copyArgs(png, 400, 300), lossless: true })
    expect(planned.caption).toBe('Only the boxes change. Written losslessly as PNG.')
  })

  it('clips boxes to the picture', () => {
    const planned = planRedact(png, settings({ boxes: [{ x: 350, y: -10, width: 100, height: 40 }] }))
    expect(planned.plan).toMatchObject({ ops: [{ boxes: [{ x: 350, y: 0, width: 50, height: 30 }] }] })
  })

  it('writes GIF and BMP as PNG', () => {
    const gif = fakeInfo({ name: 'a.gif', format: 'gif', lossless: true, jpeg: null })
    expect(planRedact(gif, settings({})).plan).toMatchObject({ name: 'a (redacted).png', lossless: true })
  })
})

describe('planRedact: lossy formats', () => {
  it('re-encodes a JPEG at its quality', () => {
    const info = photo()
    const planned = planRedact(info, settings({ boxes: [{ x: 0, y: 0, width: 8, height: 8 }] }))
    expect(planned.plan).toMatchObject({
      kind: 'pixels',
      name: 'photo (redacted).jpg',
      encoding: { format: 'jpeg', quality: 92, lossless: false },
      lossless: false,
    })
    expect(planned.caption).toBe('Re-encoded as JPEG at quality 92. All metadata is removed but the colour profile.')
  })

  it('drops the thumbnail and Content Credentials whatever the switch says, and says why', () => {
    const info = photo({ embedded: [thumbnail, manifest] })
    for (const removeMetadata of [true, false]) {
      const caption = planRedact(
        info,
        settings({ boxes: [{ x: 0, y: 0, width: 8, height: 8 }], removeMetadata }),
      ).caption!
      expect(caption).toContain('The embedded thumbnail is removed; it would show what you hid.')
      expect(caption).toContain('Content Credentials are removed; they’d no longer match the picture.')
    }
    // With it off, ExifTool leaves both out of what it copies.
    const off = planRedact(info, settings({ boxes: [{ x: 0, y: 0, width: 8, height: 8 }], removeMetadata: false }))
    expect(off.plan).toMatchObject({ args: copyArgs(info, 64, 48) })
  })

  it('writes HEIC as JPEG, and says why', () => {
    const heic = fakeInfo({ name: 'IMG.HEIC', format: 'heic', jpeg: null })
    const planned = planRedact(heic, settings({}))
    expect(planned.plan).toMatchObject({ name: 'IMG (redacted).jpg', exifName: 'image.jpg', source: 'source.heic' })
    expect(planned.caption).toContain('Browsers can’t write HEIC, so the result is a JPEG.')
  })

  it('follows the Output choice', () => {
    const output = { format: 'webp' as const, quality: 80, lossless: false }
    expect(planRedact(png, settings({ output })).plan).toMatchObject({
      name: 'shot (redacted).webp',
      encoding: output,
      lossless: false,
    })
  })

  it('converts the colours to sRGB for AVIF and JPEG XL, which can’t carry the colour profile here', () => {
    const jxl = { format: 'jxl' as const, quality: null, lossless: true }
    const planned = planRedact(png, settings({ output: jxl }))
    // Removing metadata keeps only the colour profile, and that can’t go in, so nothing is copied.
    expect(planned.plan).toMatchObject({ srgb: true, lossless: false, args: [] })
    expect(planned.caption).toBe(
      'JPEG XL can’t carry the colour profile here, so the colours are converted to sRGB. Written losslessly as JPEG XL. All metadata is removed.',
    )
    const avif = { format: 'avif' as const, quality: 60, lossless: false }
    const kept = planRedact(photo(), settings({ output: avif, removeMetadata: false }))
    expect(kept.plan).toMatchObject({ srgb: true, args: copyArgs(photo(), 64, 48, true) })
    expect(kept.caption).toContain('AVIF can’t carry the colour profile here, so the colours are converted to sRGB.')
  })

  it('keeps the colours of an sRGB or profile-less source, and of JPEG, WebP and PNG results', () => {
    const avif = { format: 'avif' as const, quality: 60, lossless: false }
    const srgb = photo({ colour: { profile: 'sRGB IEC61966-2.1', space: 'srgb', hdr: null } })
    const none = photo({ colour: { profile: null, space: null, hdr: null } })
    for (const info of [srgb, none])
      expect(planRedact(info, settings({ output: avif })).plan).toMatchObject({ srgb: false, args: ['-ICC_Profile'] })
    expect(planRedact(photo(), settings({})).plan).toMatchObject({ srgb: false })
    const webp = { format: 'webp' as const, quality: 80, lossless: false }
    expect(planRedact(png, settings({ output: webp })).plan).toMatchObject({ srgb: false })
  })
})
