import { describe, expect, it } from 'vitest'
import type { Tag } from '../info'
import { fakeInfo } from '../testing'
import { copyArgs, defaultEncoding, dropped, encodingCaption } from './pixel-edit'

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

describe('encodingCaption', () => {
  it('says how the result is written', () => {
    expect(encodingCaption({ format: 'avif', quality: 50, lossless: false })).toBe('Re-encoded as AVIF at quality 50.')
    expect(encodingCaption({ format: 'png', quality: null, lossless: true })).toBe('Written losslessly as PNG.')
    expect(encodingCaption({ format: 'jxl', quality: null, lossless: true })).toBe('Written losslessly as JPEG XL.')
  })
})

describe('copyArgs', () => {
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
