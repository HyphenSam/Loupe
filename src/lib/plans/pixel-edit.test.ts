import { describe, expect, it } from 'vitest'
import type { Tag } from '../info'
import { fakeInfo } from '../testing'
import {
  copyArgs,
  defaultEncoding,
  dropped,
  encodingCaption,
  encodingFor,
  needsSrgb,
  outputChoice,
  outputWords,
  srgbCaption,
} from './pixel-edit'

const tag = (family: string, group: string, name: string): Tag => ({ family, group, name, label: name, value: '1' })

describe('defaultEncoding', () => {
  const jpeg = (quality: number | null) => {
    const info = fakeInfo()
    return fakeInfo({ jpeg: { ...info.jpeg!, quality } })
  }

  it('writes lossless sources losslessly in their own format, GIF and BMP as PNG', () => {
    expect(defaultEncoding(fakeInfo({ format: 'png', lossless: true }))).toEqual({
      encoding: { format: 'png', quality: null, lossless: true },
      note: null,
    })
    expect(defaultEncoding(fakeInfo({ format: 'gif', lossless: true })).encoding.format).toBe('png')
    expect(defaultEncoding(fakeInfo({ format: 'bmp', lossless: true })).encoding.format).toBe('png')
    expect(defaultEncoding(fakeInfo({ format: 'webp', lossless: true })).encoding).toEqual({
      format: 'webp',
      quality: null,
      lossless: true,
    })
    expect(defaultEncoding(fakeInfo({ format: 'jxl', lossless: true })).encoding.lossless).toBe(true)
  })

  it('re-encodes lossy sources at 6.0’s qualities', () => {
    expect(defaultEncoding(jpeg(92)).encoding).toEqual({ format: 'jpeg', quality: 92, lossless: false })
    expect(defaultEncoding(jpeg(98)).encoding.quality).toBe(95)
    expect(defaultEncoding(jpeg(null)).encoding.quality).toBe(90)
    expect(defaultEncoding(fakeInfo({ format: 'webp' })).encoding).toEqual({
      format: 'webp',
      quality: 90,
      lossless: false,
    })
    expect(defaultEncoding(fakeInfo({ format: 'avif' })).encoding.quality).toBe(70)
    expect(defaultEncoding(fakeInfo({ format: 'jxl' })).encoding).toEqual({
      format: 'jxl',
      quality: 90,
      lossless: false,
    })
  })

  it('writes HEIC as JPEG, and says why', () => {
    expect(defaultEncoding(fakeInfo({ format: 'heic', jpeg: null }))).toEqual({
      encoding: { format: 'jpeg', quality: 90, lossless: false },
      note: 'Browsers can’t write HEIC, so the result is a JPEG.',
    })
  })
})

describe('encodingFor', () => {
  const photo = fakeInfo()
  const webp = fakeInfo({ format: 'webp', lossless: true })

  it('is the default for the source’s own output format', () => {
    expect(encodingFor(photo, 'jpeg')).toEqual({ format: 'jpeg', quality: 92, lossless: false })
    expect(encodingFor(webp, 'webp')).toEqual({ format: 'webp', quality: null, lossless: true })
  })

  it('writes other formats at 6.0’s qualities, and PNG losslessly', () => {
    expect(encodingFor(photo, 'webp')).toEqual({ format: 'webp', quality: 90, lossless: false })
    expect(encodingFor(photo, 'avif')).toEqual({ format: 'avif', quality: 70, lossless: false })
    expect(encodingFor(photo, 'jxl')).toEqual({ format: 'jxl', quality: 90, lossless: false })
    expect(encodingFor(photo, 'png')).toEqual({ format: 'png', quality: null, lossless: true })
    expect(encodingFor(webp, 'jpeg')).toEqual({ format: 'jpeg', quality: 90, lossless: false })
  })

  it('turns Lossless on and off for WebP and JPEG XL', () => {
    expect(encodingFor(photo, 'jxl', true)).toEqual({ format: 'jxl', quality: null, lossless: true })
    expect(encodingFor(webp, 'webp', false)).toEqual({ format: 'webp', quality: 90, lossless: false })
  })
})

describe('outputChoice', () => {
  const photo = fakeInfo()

  it('is null when the choice is the default, so the planner can still turn a JPEG losslessly', () => {
    expect(outputChoice(photo, { format: 'jpeg', quality: 92, lossless: false })).toBe(null)
    expect(outputChoice(photo, { format: 'jpeg', quality: 80, lossless: false })).toEqual({
      format: 'jpeg',
      quality: 80,
      lossless: false,
    })
    expect(outputChoice(photo, { format: 'avif', quality: 70, lossless: false })).toEqual({
      format: 'avif',
      quality: 70,
      lossless: false,
    })
  })
})

describe('outputWords', () => {
  it('names the format and its quality, or that it’s lossless', () => {
    expect(outputWords({ format: 'jpeg', quality: 92, lossless: false })).toBe('JPEG, quality 92')
    expect(outputWords({ format: 'jxl', quality: null, lossless: true })).toBe('JPEG XL, lossless')
  })
})

describe('encodingCaption', () => {
  it('says how the result is written', () => {
    expect(encodingCaption({ format: 'avif', quality: 50, lossless: false })).toBe('Re-encoded as AVIF at quality 50.')
    expect(encodingCaption({ format: 'png', quality: null, lossless: true })).toBe('Written losslessly as PNG.')
    expect(encodingCaption({ format: 'jxl', quality: null, lossless: true })).toBe('Written losslessly as JPEG XL.')
  })
})

describe('needsSrgb', () => {
  const p3 = fakeInfo({ colour: { profile: 'Display P3', space: 'display-p3', hdr: null } })

  it('converts a picture with a profile other than sRGB for AVIF and JPEG XL, which can’t carry it here', () => {
    expect(needsSrgb(p3, 'avif')).toBe(true)
    expect(needsSrgb(p3, 'jxl')).toBe(true)
    expect(
      needsSrgb(fakeInfo({ colour: { profile: 'Adobe RGB (1998)', space: 'adobe-rgb', hdr: null } }), 'avif'),
    ).toBe(true)
  })

  it('leaves an sRGB or profile-less picture, and formats that carry the profile, alone', () => {
    expect(needsSrgb(fakeInfo({ colour: { profile: 'sRGB IEC61966-2.1', space: 'srgb', hdr: null } }), 'avif')).toBe(
      false,
    )
    expect(needsSrgb(fakeInfo({ colour: { profile: null, space: null, hdr: null } }), 'jxl')).toBe(false)
    for (const format of ['jpeg', 'png', 'webp'] as const) expect(needsSrgb(p3, format)).toBe(false)
  })

  it('says so', () => {
    expect(srgbCaption('avif')).toBe('AVIF can’t carry the colour profile here, so the colours are converted to sRGB.')
    expect(srgbCaption('jxl')).toBe(
      'JPEG XL can’t carry the colour profile here, so the colours are converted to sRGB.',
    )
  })
})

describe('copyArgs', () => {
  it('leaves out the colour profile when the colours are converted to sRGB', () => {
    const args = copyArgs(fakeInfo({ tags: [] }), 100, 50, true)
    expect(args).not.toContain('-ICC_Profile')
    expect(args[0]).toBe('-all:all')
    expect(args).toContain('--Orientation')
  })

  it('copies everything with the colour profile, leaving out what wouldn’t match', () => {
    const args = copyArgs(fakeInfo({ tags: [] }), 100, 50)
    expect(args.slice(0, 2)).toEqual(['-all:all', '-ICC_Profile'])
    for (const left of ['--Orientation', '--IFD1:all', '--XMP-hdrgm:all', '--XMP-GContainer:all', '--JUMBF:all'])
      expect(args).toContain(left)
    expect(args).toContain('--XMP-GCamera:MotionPhoto*')
    // Nothing to set when the source had no Orientation or stored size.
    expect(args.filter((a) => !a.startsWith('-' + '-') && a.includes('='))).toEqual([])
  })

  it('sets Orientation to 1 and the stored size where the source had them', () => {
    const info = fakeInfo({
      tags: [
        tag('EXIF', 'IFD0', 'Orientation'),
        tag('EXIF', 'ExifIFD', 'ExifImageWidth'),
        tag('XMP', 'XMP-exif', 'ExifImageHeight'),
      ],
    })
    const args = copyArgs(info, 100, 50)
    expect(args).toContain('-Orientation#=1')
    expect(args).toContain('-ExifImageWidth=100')
    expect(args).toContain('-ExifImageHeight=50')
  })

  it('leaves out previews by their tag, and maker notes that hold one', () => {
    const embedded = (id: string) => ({
      id,
      kind: 'preview' as const,
      label: 'Preview',
      size: 1000,
      extension: 'jpg',
      isImage: true,
    })
    expect(copyArgs(fakeInfo({ embedded: [embedded('EXIF:PreviewIFD:PreviewImage')] }), 1, 1)).toContain(
      '--PreviewIFD:PreviewImage',
    )
    expect(copyArgs(fakeInfo({ embedded: [embedded('MakerNotes:Nikon:PreviewImage')] }), 1, 1)).toContain(
      '--MakerNotes',
    )
  })
})

describe('dropped', () => {
  it('names each thing a pixel edit removes that was there', () => {
    expect(dropped(fakeInfo())).toEqual([])
    const all = fakeInfo({
      kinds: ['ultra-hdr', 'motion-photo'],
      embedded: [
        {
          id: 'EXIF:IFD1:ThumbnailImage',
          kind: 'thumbnail',
          label: 'EXIF thumbnail',
          size: 5,
          extension: 'jpg',
          isImage: true,
        },
        {
          id: 'c2pa-manifest',
          kind: 'c2pa-manifest',
          label: 'Content Credentials',
          size: null,
          extension: 'json',
          isImage: false,
        },
      ],
    })
    expect(dropped(all)).toEqual([
      'The embedded thumbnail is removed; it would show the picture before this edit.',
      'Content Credentials are removed; they’d no longer match the picture.',
      'The HDR gain map is removed, so the result is standard range.',
      'The Motion Photo’s video is removed.',
    ])
  })
})
