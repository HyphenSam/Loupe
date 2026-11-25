import { describe, expect, it } from 'vitest'
import { bytesOf, concat } from '../containers'
import type { Tag } from '../info'
import { findTrailer, pictureEnd, trailerExtension, trailerWords, unknownChunks } from './trailer'

const tag = (family: string, group: string, name: string, value: string): Tag => ({
  family,
  group,
  name,
  label: name,
  value,
})

const bytes = (...values: number[]) => new Uint8Array(values)
const segment = (marker: number, body: number[]) => bytes(0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body) // prettier-ignore

/** A baseline JPEG's shape: headers, a scan whose data has stuffed bytes and a restart marker, and EOI. */
const JPEG = concat([
  bytes(0xff, 0xd8),
  segment(0xe0, [...bytesOf('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  segment(0xdb, [0, ...new Array(64).fill(1)]),
  segment(0xc0, [8, 0, 8, 0, 8, 1, 1, 0x11, 0]),
  segment(0xda, [1, 1, 0, 0, 63, 0]),
  bytes(0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xff, 0x00, 0x78),
  bytes(0xff, 0xd9),
])

/** A progressive JPEG: Huffman tables between its scans. */
const PROGRESSIVE = concat([
  bytes(0xff, 0xd8),
  segment(0xc2, [8, 0, 8, 0, 8, 1, 1, 0x11, 0]),
  segment(0xda, [1, 1, 0, 0, 0, 0]),
  bytes(0x11, 0xff, 0x00, 0x22),
  segment(0xc4, [0, ...new Array(16).fill(0)]),
  segment(0xda, [1, 1, 0, 1, 63, 0]),
  bytes(0x33, 0x44),
  bytes(0xff, 0xd9),
])

const ZIP = concat([bytesOf('PK\x03\x04'), new Uint8Array(40).fill(7)])

describe('pictureEnd', () => {
  it('ends a JPEG after the EOI that closes its scan, past stuffed bytes, restarts and fill bytes', () => {
    expect(pictureEnd(JPEG, 'jpeg')).toBe(JPEG.length)
    expect(pictureEnd(concat([JPEG, ZIP]), 'jpeg')).toBe(JPEG.length)
  })

  it('reads past the segments between a progressive JPEG’s scans', () => {
    expect(pictureEnd(concat([PROGRESSIVE, ZIP]), 'jpeg')).toBe(PROGRESSIVE.length)
  })

  it('is null for a JPEG whose scan never ends', () => {
    expect(pictureEnd(JPEG.subarray(0, JPEG.length - 2), 'jpeg')).toBe(null)
  })

  it('ends a PNG after IEND, and a WebP after its RIFF chunk', () => {
    const png = concat([bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), bytes(0, 0, 0, 0), bytesOf('IEND'), bytes(0xae, 0x42, 0x60, 0x82)]) // prettier-ignore
    expect(pictureEnd(concat([png, ZIP]), 'png')).toBe(png.length)
    const webp = concat([bytesOf('RIFF'), bytes(12, 0, 0, 0), bytesOf('WEBP'), bytesOf('VP8L'), bytes(0, 0, 0, 0)])
    expect(pictureEnd(concat([webp, ZIP]), 'webp')).toBe(webp.length)
  })

  it('is null for formats it doesn’t walk', () => {
    expect(pictureEnd(JPEG, 'heic')).toBe(null)
  })
})

describe('findTrailer', () => {
  it('finds nothing after a picture that ends where the file does', () => {
    expect(findTrailer(JPEG, 'jpeg', [])).toBe(null)
  })

  it('finds data after the end of the picture, and what it starts like', () => {
    expect(findTrailer(concat([JPEG, ZIP]), 'jpeg', [])).toEqual({
      offset: JPEG.length,
      length: ZIP.length,
      looksLike: 'zip',
    })
  })

  it.each([
    ['Rar!\x1a\x07\x01\x00', 'rar'],
    ['7z\xbc\xaf\x27\x1c\x00\x04', '7z'],
    ['%PDF-1.7\n%', 'pdf'],
    ['\xff\xd8\xff\xe0\x00\x10JFIF', 'jpeg'],
    ['\x89PNG\r\n\x1a\n\x00\x00', 'png'],
    ['Some notes kept after the picture.\nSecond line.', 'text'],
    ['\x01\x02\x03\x00\x9a\x10\x00', 'unknown'],
  ] as const)('says data starting %j looks like %s', (start, looksLike) => {
    expect(findTrailer(concat([JPEG, bytesOf(start)]), 'jpeg', [])!.looksLike).toBe(looksLike)
  })

  it('takes padding of zeros or 0xFF for nothing', () => {
    expect(findTrailer(concat([JPEG, new Uint8Array(300)]), 'jpeg', [])).toBe(null)
    expect(findTrailer(concat([JPEG, new Uint8Array(30).fill(0xff)]), 'jpeg', [])).toBe(null)
  })

  it('knows the pictures MPF lists after the first', () => {
    const second = concat([JPEG])
    const file = concat([JPEG, second])
    const tags = [
      tag('MPF', 'MPImage2', 'MPImageStart', String(JPEG.length)),
      tag('MPF', 'MPImage2', 'MPImageLength', String(second.length)),
    ]
    expect(findTrailer(file, 'jpeg', tags)).toBe(null)
    expect(findTrailer(concat([file, ZIP]), 'jpeg', tags)).toMatchObject({ offset: file.length, looksLike: 'zip' })
  })

  it('knows the items Google’s container directory puts at the end (Motion Photos, gain maps)', () => {
    const video = concat([bytes(0, 0, 0, 0x18), bytesOf('ftypmp42'), new Uint8Array(100)])
    const tags = [
      tag('XMP', 'XMP-GContainer', 'DirectoryItemSemantic', 'Primary, MotionPhoto'),
      tag('XMP', 'XMP-GContainer', 'DirectoryItemLength', String(video.length)),
    ]
    expect(findTrailer(concat([JPEG, video]), 'jpeg', tags)).toBe(null)
    // Something between the picture and the video isn't part of either.
    expect(findTrailer(concat([JPEG, ZIP, video]), 'jpeg', tags)).toEqual({
      offset: JPEG.length,
      length: ZIP.length,
      looksLike: 'zip',
    })
  })

  it('knows the older Motion Photo’s video, placed by its offset from the end', () => {
    const video = concat([bytes(0, 0, 0, 0x18), bytesOf('ftypmp42'), new Uint8Array(50)])
    const tags = [tag('XMP', 'XMP-GCamera', 'MicroVideoOffset', String(video.length))]
    expect(findTrailer(concat([JPEG, video]), 'jpeg', tags)).toBe(null)
  })

  it('knows Samsung’s trailer, from its SEFH directory and SEFT footer', () => {
    const data = concat([bytes(0, 0, 0x30, 0x0a), bytes(13, 0, 0, 0), bytesOf('MotionPhoto_Data'), new Uint8Array(20)])
    const le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
    const directory = concat([bytesOf('SEFH'), bytes(...le(107)), bytes(...le(1)), bytes(0, 0, 0x30, 0x0a, ...le(data.length), ...le(data.length))]) // prettier-ignore
    const samsung = concat([data, directory, bytes(...le(directory.length)), bytesOf('SEFT')])
    expect(findTrailer(concat([JPEG, samsung]), 'jpeg', [])).toBe(null)
    expect(findTrailer(concat([JPEG, ZIP, samsung]), 'jpeg', [])).toEqual({
      offset: JPEG.length,
      length: ZIP.length,
      looksLike: 'zip',
    })
  })

  it('finds data after a PNG’s IEND', () => {
    const png = concat([bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), bytes(0, 0, 0, 0), bytesOf('IEND'), bytes(0xae, 0x42, 0x60, 0x82)]) // prettier-ignore
    expect(findTrailer(concat([png, ZIP]), 'png', [])).toEqual({
      offset: png.length,
      length: ZIP.length,
      looksLike: 'zip',
    })
  })
})

describe('trailerWords', () => {
  it('says how much, and what it starts like', () => {
    expect(trailerWords({ offset: 709, length: 4_200_000, looksLike: 'zip' })).toBe(
      '4.2 MB of data after the end of the picture. It starts like a ZIP archive.',
    )
    expect(trailerWords({ offset: 709, length: 149, looksLike: 'text' })).toBe(
      '149 B of data after the end of the picture. It starts like text.',
    )
    expect(trailerWords({ offset: 709, length: 2000, looksLike: 'unknown' })).toBe(
      '2 kB of data after the end of the picture. Loupe doesn’t recognise what it starts like.',
    )
  })

  it('gives each kind the extension it’s saved with', () => {
    expect(trailerExtension('zip')).toBe('zip')
    expect(trailerExtension('jpeg')).toBe('jpg')
    expect(trailerExtension('text')).toBe('txt')
    expect(trailerExtension('unknown')).toBe('bin')
  })
})

describe('unknownChunks', () => {
  /** A PNG of the given chunk types, each empty. */
  const png = (...types: string[]) =>
    concat([
      bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      ...types.map((type) => concat([bytes(0, 0, 0, 0), bytesOf(type), bytes(0, 0, 0, 0)])),
    ])

  it('lists chunk types outside the PNG spec and known extensions, once each', () => {
    expect(unknownChunks(png('IHDR', 'iCCP', 'tEXt', 'zzZz', 'IDAT', 'IDAT', 'zzZz', 'miNE', 'IEND'))).toEqual([
      'zzZz',
      'miNE',
    ])
  })

  it('knows the extensions Apple, ImageMagick, Android and Content Credentials write', () => {
    expect(
      unknownChunks(png('IHDR', 'iDOT', 'vpAg', 'orNT', 'npTc', 'caBX', 'eXIf', 'acTL', 'fcTL', 'fdAT', 'IEND')),
    ).toEqual([])
  })

  it('lists nothing for anything but a PNG', () => {
    expect(unknownChunks(JPEG)).toEqual([])
  })
})
