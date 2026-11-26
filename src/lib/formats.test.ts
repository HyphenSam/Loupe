import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  expectedExtension,
  extensionMismatch,
  formatOf,
  isLossless,
  isLosslessJxl,
  isLosslessWebp,
  sniff,
} from './formats'

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))
const le32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]
const ftyp = (major: string, ...compatible: string[]) =>
  new Uint8Array([0, 0, 0, 16 + 4 * compatible.length, ...ascii('ftyp'), ...ascii(major), 0, 0, 0, 0, ...compatible.flatMap(ascii)])
const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '../../fixtures', name)))

describe('sniff', () => {
  it('recognises each format by its first bytes', () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png')
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(sniff(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBPVP8L')]))).toBe('webp')
    expect(sniff(ftyp('avif'))).toBe('avif')
    expect(sniff(ftyp('avis'))).toBe('avif')
    expect(sniff(new Uint8Array([0xff, 0x0a, 1]))).toBe('jxl')
    expect(sniff(new Uint8Array([0, 0, 0, 0x0c, ...ascii('JXL '), 0x0d, 0x0a, 0x87, 0x0a]))).toBe('jxl')
    expect(sniff(new Uint8Array(ascii('GIF89a')))).toBe('gif')
    expect(sniff(new Uint8Array(ascii('BM\0\0')))).toBe('bmp')
  })

  it('recognises HEIC and HEIF by their brands, and an AVIF that names only mif1 by its compatible brands', () => {
    for (const brand of ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx']) expect(sniff(ftyp(brand))).toBe('heic')
    expect(sniff(ftyp('mif1', 'heic'))).toBe('heic')
    expect(sniff(ftyp('msf1', 'hevc'))).toBe('heic')
    expect(sniff(ftyp('mif1', 'mif1', 'avif'))).toBe('avif')
  })

  it('recognises TIFF in either byte order, which raw files built on TIFF share', () => {
    expect(sniff(new Uint8Array([...ascii('II'), 42, 0, 8, 0, 0, 0]))).toBe('tiff')
    expect(sniff(new Uint8Array([...ascii('MM'), 0, 42, 0, 0, 0, 8]))).toBe('tiff')
  })

  it('is null for anything else: other ISO BMFF files, WAVE, text, nothing', () => {
    expect(sniff(ftyp('isom', 'mp41'))).toBe(null)
    expect(sniff(ftyp('crx '))).toBe(null)
    expect(sniff(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]))).toBe(null)
    expect(sniff(new Uint8Array(ascii('This is a text file')))).toBe(null)
    expect(sniff(new Uint8Array([]))).toBe(null)
  })

  it('recognises every generated fixture', () => {
    expect(sniff(fixture('grid-420.jpg'))).toBe('jpeg')
    expect(sniff(fixture('misnamed.png'))).toBe('jpeg')
    expect(sniff(fixture('png-16-alpha.png'))).toBe('png')
    expect(sniff(fixture('lossy.webp'))).toBe('webp')
    expect(sniff(fixture('photo.avif'))).toBe('avif')
    expect(sniff(fixture('photo.heic'))).toBe('heic')
    expect(sniff(fixture('photo.jxl'))).toBe('jxl')
    expect(sniff(fixture('anim.gif'))).toBe('gif')
    expect(sniff(fixture('picture.bmp'))).toBe('bmp')
    expect(sniff(fixture('scan.tif'))).toBe('tiff')
    expect(sniff(fixture('notimage.txt'))).toBe(null)
  })
})

describe('formatOf', () => {
  it('takes the format from the bytes when they say', () => {
    expect(formatOf('jpeg', 'JPEG')).toBe('jpeg')
    expect(formatOf('heic', 'HEIC')).toBe('heic')
    expect(formatOf('tiff', 'TIFF')).toBe('tiff')
  })

  it('recognises raw formats by ExifTool’s file type, TIFF-based ones included', () => {
    expect(formatOf('tiff', 'NEF')).toBe('raw')
    expect(formatOf('tiff', 'DNG')).toBe('raw')
    expect(formatOf('tiff', 'CR2')).toBe('raw')
    expect(formatOf(null, 'CR3')).toBe('raw')
    expect(formatOf(null, 'RAF')).toBe('raw')
    expect(formatOf(null, 'X3F')).toBe('raw')
    expect(formatOf(null, 'CRW')).toBe('raw')
  })

  it('is null when neither knows it as a picture', () => {
    expect(formatOf(null, 'TXT')).toBe(null)
    expect(formatOf(null, 'MP4')).toBe(null)
    expect(formatOf(null, null)).toBe(null)
  })
})

describe('extensionMismatch', () => {
  it('is null when the extension fits the format, in any case and spelling', () => {
    expect(extensionMismatch('photo.JPG', 'jpeg', 'JPEG')).toBe(null)
    expect(extensionMismatch('photo.jpeg', 'jpeg', 'JPEG')).toBe(null)
    expect(extensionMismatch('scan.tiff', 'tiff', 'TIFF')).toBe(null)
    expect(extensionMismatch('IMG_1.HIF', 'heic', 'HEIC')).toBe(null)
    expect(extensionMismatch('DSC_1.NEF', 'raw', 'NEF')).toBe(null)
  })

  it('names what was given and what was expected when they disagree', () => {
    expect(extensionMismatch('misnamed.png', 'jpeg', 'JPEG')).toEqual({ given: 'png', expected: 'jpg' })
    expect(extensionMismatch('DSC_1.TIF', 'raw', 'NEF')).toEqual({ given: 'TIF', expected: 'nef' })
  })

  it('says nothing for a file with no extension', () => {
    expect(extensionMismatch('image', 'png', 'PNG')).toBe(null)
  })
})

describe('expectedExtension', () => {
  it('is the usual extension of each format', () => {
    expect(expectedExtension('jpeg', 'JPEG')).toBe('jpg')
    expect(expectedExtension('heic', 'HEIF')).toBe('heic')
    expect(expectedExtension('raw', 'ARW')).toBe('arw')
  })
})

describe('isLosslessWebp', () => {
  const chunk = (fourcc: string, data: number[]) => [...ascii(fourcc), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])]
  const webp = (...chunks: number[][]) => {
    const body = [...ascii('WEBP'), ...chunks.flat()]
    return new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body])
  }

  it('finds VP8L, alone or after VP8X and other chunks', () => {
    expect(isLosslessWebp(webp(chunk('VP8L', [0x2f, 0, 0, 0, 0])))).toBe(true)
    expect(isLosslessWebp(webp(chunk('VP8X', new Array(10).fill(0)), chunk('ICCP', [1, 2, 3]), chunk('VP8L', [0x2f])))).toBe(true)
    expect(isLosslessWebp(fixture('lossless.webp'))).toBe(true)
  })

  it('is false for lossy WebP and other formats', () => {
    expect(isLosslessWebp(fixture('lossy.webp'))).toBe(false)
    expect(isLosslessWebp(fixture('grid-420.jpg'))).toBe(false)
  })
})

describe('isLosslessJxl', () => {
  it('reads xyb_encoded from the codestream’s image metadata', () => {
    expect(isLosslessJxl(fixture('lossless.jxl'))).toBe(true)
    expect(isLosslessJxl(fixture('photo.jxl'))).toBe(false)
  })

  it('finds the codestream in its container', () => {
    const box = (type: string, data: Uint8Array) => {
      const size = 8 + data.length
      return [0, 0, size >> 8, size & 255, ...ascii(type), ...data]
    }
    const signature = [0, 0, 0, 0x0c, ...ascii('JXL '), 0x0d, 0x0a, 0x87, 0x0a]
    const codestream = fixture('lossless.jxl')
    expect(isLosslessJxl(new Uint8Array([...signature, ...box('jxlc', codestream)]))).toBe(true)
    // Partial codestream boxes start with a 4-byte index.
    expect(
      isLosslessJxl(new Uint8Array([...signature, ...box('jxlp', new Uint8Array([0, 0, 0, 0, ...codestream]))])),
    ).toBe(true)
  })

  it('is false when it can’t tell, or for other formats', () => {
    expect(isLosslessJxl(new Uint8Array([0xff, 0x0a]))).toBe(false)
    expect(isLosslessJxl(fixture('grid-420.jpg'))).toBe(false)
  })
})

describe('isLossless', () => {
  it('says which pictures are stored losslessly', () => {
    expect(isLossless('png', fixture('screenshot.png'))).toBe(true)
    expect(isLossless('gif', fixture('anim.gif'))).toBe(true)
    expect(isLossless('bmp', fixture('picture.bmp'))).toBe(true)
    expect(isLossless('webp', fixture('lossless.webp'))).toBe(true)
    expect(isLossless('webp', fixture('lossy.webp'))).toBe(false)
    expect(isLossless('jxl', fixture('lossless.jxl'))).toBe(true)
    expect(isLossless('jpeg', fixture('grid-420.jpg'))).toBe(false)
    expect(isLossless('avif', fixture('photo.avif'))).toBe(false)
  })
})
