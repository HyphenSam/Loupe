import { describe, expect, it } from 'vitest'
import type { Embedded, ImageInfo } from '../info'
import { DEFAULT_EXPORT, type ExportSettings } from '../settings'
import { fakeInfo } from '../testing'
import { exportNotes, planExport } from './export'
import { CANT_EDIT, copyArgs } from './pixel-edit'
import type { ExportPlan } from './plan'

const photo = (over: Partial<ImageInfo> = {}) =>
  fakeInfo({ name: 'photo.jpg', width: 4000, height: 3000, displayWidth: 4000, displayHeight: 3000, ...over })
const png = (over: Partial<ImageInfo> = {}) =>
  photo({
    name: 'shot.png',
    format: 'png',
    formatName: 'PNG',
    lossless: true,
    jpeg: null,
    colour: { profile: null, space: null, hdr: null },
    ...over,
  })
const settings = (over: Partial<ExportSettings> = {}): ExportSettings => ({ ...DEFAULT_EXPORT, ...over })

function plan(info: ImageInfo, over: Partial<ExportSettings> = {}) {
  const planned = planExport(info, settings(over))
  if (!planned.plan) throw new Error(planned.problems.join(' '))
  return { plan: planned.plan as ExportPlan, caption: planned.caption ?? '' }
}

describe('planExport: the Lossless badge', () => {
  it('is Lossless for an 8-bit PNG written as PNG: oxipng repacks the file itself', () => {
    const { plan: p, caption } = plan(png())
    expect(p).toMatchObject({ kind: 'export', lossless: true, repack: true, size: null, srgb: false })
    expect(p.encoding).toEqual({ format: 'png', quality: null, lossless: true })
    expect(caption).toContain('Every pixel is kept.')
  })

  it('is Lossless for a 16-bit PNG written as PNG, which keeps its depth', () => {
    expect(plan(png({ bitDepth: 16 })).plan).toMatchObject({ lossless: true, repack: true })
  })

  it('re-encodes a 16-bit PNG written as lossless WebP, saying so', () => {
    const { plan: p, caption } = plan(png({ bitDepth: 16 }), { format: 'webp', webpLossless: true })
    expect(p).toMatchObject({ lossless: false, repack: false, encoding: { format: 'webp', lossless: true } })
    expect(caption).toContain('The result has 8 bits a channel; the source has 16.')
  })

  it('is Lossless for a lossless WebP or JPEG XL kept in its format, or switched to lossless', () => {
    const webp = photo({ name: 'a.webp', format: 'webp', formatName: 'WebP', lossless: true, jpeg: null })
    expect(plan(webp, { webpLossless: false }).plan).toMatchObject({ lossless: true, encoding: { lossless: true } })
    const srgb = { profile: null, space: null, hdr: null }
    expect(plan(png(), { format: 'jxl', jxlLossless: true }).plan).toMatchObject({ lossless: true })
    expect(plan(png({ colour: srgb }), { format: 'webp', webpLossless: true }).plan).toMatchObject({ lossless: true })
  })

  it('is Lossless for a JPEG written as PNG: every decoded pixel survives', () => {
    expect(plan(photo({ colour: { profile: null, space: null, hdr: null } }), { format: 'png' }).plan).toMatchObject({
      lossless: true,
      repack: false,
    })
  })

  it('re-encodes a lossy format, at its quality', () => {
    const { plan: p, caption } = plan(photo())
    expect(p).toMatchObject({ lossless: false, encoding: { format: 'jpeg', quality: 75, lossless: false } })
    expect(caption).toContain('Re-encoded as JPEG at quality 75.')
    expect(plan(photo(), { format: 'avif' }).caption).toContain('Re-encoded as AVIF at quality 50.')
    const lossy = photo({ name: 'a.webp', format: 'webp', formatName: 'WebP', jpeg: null })
    expect(plan(lossy).plan.encoding).toEqual({ format: 'webp', quality: 75, lossless: false })
  })

  it('re-encodes when the picture is resized, but never makes it larger', () => {
    const { plan: p, caption } = plan(png(), { resize: true, maxWidth: 1000, maxHeight: 1000 })
    expect(p).toMatchObject({ lossless: false, repack: false, size: { width: 1000, height: 750 } })
    expect(caption).toContain('Resized to 1000 × 750.')
    expect(plan(png(), { resize: true, maxWidth: 8000, maxHeight: 8000 }).plan).toMatchObject({
      lossless: true,
      size: null,
    })
  })

  it('keeps only the first frame of an animation', () => {
    const gif = png({
      name: 'anim.gif',
      format: 'gif',
      formatName: 'GIF',
      animation: { frames: 4, duration: 1, loops: 'forever' },
    })
    const { plan: p, caption } = plan(gif)
    expect(p).toMatchObject({ lossless: false, repack: false, encoding: { format: 'png' } })
    expect(caption).toContain('Only the first frame is kept.')
  })

  it('converts the colours to sRGB for AVIF and JPEG XL, which can’t carry the colour profile here', () => {
    const { plan: p, caption } = plan(photo(), { format: 'avif' })
    expect(p.srgb).toBe(true)
    expect(caption).toContain('AVIF can’t carry the colour profile here, so the colours are converted to sRGB.')
    expect(
      plan(png({ colour: { profile: 'Display P3', space: 'display-p3', hdr: null } }), {
        format: 'jxl',
        jxlLossless: true,
      }).plan,
    ).toMatchObject({ srgb: true, lossless: false })
    // An sRGB profile, or none, needs no converting.
    expect(
      plan(photo({ colour: { profile: 'sRGB IEC61966-2.1', space: 'srgb', hdr: null } }), { format: 'avif' }).plan.srgb,
    ).toBe(false)
    expect(plan(png(), { format: 'avif' }).plan.srgb).toBe(false)
    expect(plan(photo(), { format: 'webp' }).plan.srgb).toBe(false)
  })

  it('says a transparent picture becomes white in JPEG', () => {
    expect(plan(png({ alpha: true }), { format: 'jpeg' }).caption).toContain(
      'JPEG has no transparency, so transparent areas become white.',
    )
  })
})

describe('planExport: formats and names', () => {
  it('keeps the format with “(compressed)” in the name, or names the new format’s file after the source', () => {
    expect(plan(photo()).plan.name).toBe('photo (compressed).jpg')
    expect(plan(photo(), { format: 'jpeg' }).plan.name).toBe('photo (compressed).jpg')
    expect(plan(photo(), { format: 'webp' }).plan).toMatchObject({
      name: 'photo.webp',
      type: 'image/webp',
      exifName: 'image.webp',
    })
    expect(plan(photo(), { format: 'jxl' }).plan.name).toBe('photo.jxl')
  })

  it('writes GIF and BMP as PNG, and HEIC as JPEG, for Same', () => {
    expect(plan(png({ name: 'a.gif', format: 'gif', formatName: 'GIF' })).plan).toMatchObject({
      name: 'a.png',
      encoding: { format: 'png' },
      lossless: true,
      repack: false,
    })
    expect(plan(png({ name: 'b.bmp', format: 'bmp', formatName: 'BMP' })).plan.name).toBe('b.png')
    const heic = plan(photo({ name: 'IMG_1.HEIC', format: 'heic', formatName: 'HEIC', jpeg: null }))
    expect(heic.plan).toMatchObject({ name: 'IMG_1.jpg', encoding: { format: 'jpeg', quality: 75 } })
    expect(heic.caption).toContain('Browsers can’t write HEIC, so the result is a JPEG.')
  })
})

describe('planExport: target size', () => {
  it('searches for the quality that fits, up to the slider’s', () => {
    const { plan: p, caption } = plan(photo(), { format: 'webp', target: true, targetSize: 200 })
    expect(p.target).toBe(200_000)
    expect(caption).toContain('Re-encoded as WebP at the highest quality up to 75 that fits under 200 kB.')
    expect(plan(photo(), { target: true, targetSize: 1.5, targetUnit: 'MB' }).plan.target).toBe(1_500_000)
    expect(plan(photo()).plan.target).toBe(null)
  })

  it('needs a lossy format', () => {
    expect(planExport(png(), settings({ target: true })).problems).toEqual([
      'PNG is always lossless, so it can’t aim for a target size. Choose JPEG, WebP, AVIF or JPEG XL.',
    ])
    expect(planExport(photo(), settings({ format: 'webp', webpLossless: true, target: true })).problems).toEqual([
      'Lossless WebP can’t aim for a target size. Turn off Lossless.',
    ])
  })
})

describe('planExport: problems', () => {
  it('can’t edit TIFF or raw files', () => {
    expect(planExport(photo({ format: 'tiff' }), DEFAULT_EXPORT)).toEqual({
      plan: null,
      problems: [CANT_EDIT],
      caption: null,
    })
  })

  it('keeps WebP within libwebp’s 16383 px', () => {
    const wide = photo({ width: 20000, displayWidth: 20000, height: 3000, displayHeight: 3000 })
    expect(planExport(wide, settings({ format: 'webp' })).problems).toEqual([
      'WebP can’t be larger than 16383 px on a side, and this picture is 20000 × 3000 px. Turn on Resize, or choose another format.',
    ])
    expect(planExport(wide, settings({ format: 'webp', resize: true })).plan).not.toBe(null)
  })
})

describe('planExport: metadata', () => {
  const thumbnail: Embedded = {
    id: 'EXIF:IFD1:ThumbnailImage',
    kind: 'thumbnail',
    label: 'EXIF thumbnail',
    size: 900,
    extension: 'jpg',
    isImage: true,
  }

  it('keeps only the colour profile with Keep metadata off', () => {
    const { plan: p, caption } = plan(photo({ embedded: [thumbnail] }))
    expect(p.args).toEqual(['-ICC_Profile'])
    expect(caption).toContain('Metadata is removed but for the colour profile.')
    expect(caption).not.toContain('thumbnail')
    // Nothing to copy: ExifTool doesn't run.
    expect(plan(png(), { format: 'webp' }).plan.args).toEqual([])
    expect(plan(png(), { format: 'webp' }).caption).toContain('Metadata is removed.')
    expect(plan(photo(), { format: 'avif' }).plan.args).toEqual([])
  })

  it('removes everything but the profile from a repacked PNG, which oxipng leaves as it was', () => {
    expect(plan(png()).plan.args).toEqual(['-all='])
    expect(plan(png({ colour: { profile: 'Display P3', space: 'display-p3', hdr: null } })).plan.args).toEqual([
      '-all=',
      '-tagsFromFile',
      '@',
      '-ICC_Profile',
    ])
  })

  it('copies it under SPEC.md 6.0’s rules with Keep metadata on, at the result’s size', () => {
    const info = photo({ embedded: [thumbnail] })
    const { plan: p, caption } = plan(info, { keepMetadata: true, resize: true, maxWidth: 1000, maxHeight: 1000 })
    expect(p.args).toEqual(copyArgs(info, 1000, 750))
    expect(caption).toContain('The embedded thumbnail is removed; it would show the picture before this edit.')
    // Never the profile into a file whose colours were converted.
    expect(plan(info, { keepMetadata: true, format: 'avif' }).plan.args).not.toContain('-ICC_Profile')
  })

  it('keeps a repacked PNG’s metadata as it is, but for Content Credentials', () => {
    expect(plan(png(), { keepMetadata: true }).plan.args).toEqual([])
    const signed = png({
      embedded: [
        { id: 'JUMBF:JUMBF:C2PA', kind: 'c2pa-manifest', label: 'C2PA', size: 9000, extension: 'c2pa', isImage: false },
      ],
    })
    const { plan: p, caption } = plan(signed, { keepMetadata: true })
    expect(p.args).toEqual(['-JUMBF:all='])
    expect(caption).toContain('Content Credentials are removed; they’d no longer match the picture.')
  })
})

describe('exportNotes', () => {
  const jpeg = plan(photo()).plan
  const targeted = plan(photo(), { target: true, targetSize: 200 }).plan
  const lossless = plan(png()).plan

  it('says nothing for a smaller file', () => {
    expect(exportNotes(jpeg, 50_000, 100_000, null)).toEqual([])
  })

  it('says how much larger a file grew, and what to try', () => {
    expect(exportNotes(jpeg, 104_000, 100_000, null)).toEqual(['4% larger than the original. Try a lower quality.'])
    expect(exportNotes(lossless, 266_000, 100_000, null)).toEqual([
      '166% larger than the original. Try a lossy format such as WebP or AVIF.',
    ])
  })

  it('says the quality a target settled on, or why even the lowest is too large', () => {
    expect(exportNotes(targeted, 190_000, 900_000, { quality: 62, fits: true })).toEqual([
      'Quality 62 fits under 200 kB.',
    ])
    expect(exportNotes(targeted, 312_000, 900_000, { quality: 1, fits: false })).toEqual([
      'Even at quality 1 this is 312 kB, over the 200 kB target. Turn on Resize, or choose another format.',
    ])
  })
})
