// quant.ts against real encoders: MozJPEG at every quality with libjpeg's tables and with its own, the
// fixtures, and Photoshop's tables against ExifTool's digests of them.
import { createHash } from 'node:crypto'
import encode, { init } from '@jsquash/jpeg/encode.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { jpegInfo, KNOWN_TABLES, ZIGZAG } from '@/lib/forensics/quant'
import { fixture, packageFile, useNodeCodecs } from './node'

beforeAll(async () => {
  await useNodeCodecs()
  await init(await WebAssembly.compile(packageFile('@jsquash/jpeg/encode.js', 'codec/enc/mozjpeg_enc.wasm')))
})

/** A 16 × 16 gradient, encoded by MozJPEG. */
async function mozjpeg(options: Record<string, unknown>) {
  const data = new Uint8ClampedArray(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 256))
  return new Uint8Array(await encode(new ImageData(data, 16, 16), options))
}

describe('jpegInfo with MozJPEG', () => {
  it('knows libjpeg’s tables and their quality at every setting', async () => {
    for (let quality = 1; quality <= 100; quality++) {
      const bytes = await mozjpeg({ quality, quant_table: 0, separate_chroma_quality: false })
      expect(jpegInfo(bytes), `quality ${quality}`).toMatchObject({ quality, tables: 'ijg', tablesName: 'libjpeg' })
    }
  })

  it('knows its own default tables and their quality at every setting', async () => {
    for (let quality = 1; quality <= 99; quality++) {
      const bytes = await mozjpeg({ quality })
      expect(jpegInfo(bytes), `quality ${quality}`).toMatchObject({ quality, tables: 'known', tablesName: 'MozJPEG' })
    }
    // At 100 every table scales to all ones, the same bytes as libjpeg's, so the first family found names them.
    expect(jpegInfo(await mozjpeg({ quality: 100 }))).toMatchObject({ quality: 100, tables: 'ijg' })
  })

  it('reads subsampling and progressive as encoded', async () => {
    const base = { quality: 80, auto_subsample: false, separate_chroma_quality: false }
    expect(jpegInfo(await mozjpeg({ ...base, chroma_subsample: 2, progressive: true }))).toMatchObject({
      subsampling: '4:2:0',
      progressive: true,
      mcu: { width: 16, height: 16 },
    })
    expect(jpegInfo(await mozjpeg({ ...base, chroma_subsample: 1, progressive: false }))).toMatchObject({
      subsampling: '4:4:4',
      progressive: false,
      mcu: { width: 8, height: 8 },
    })
  })
})

describe('jpegInfo on the fixtures', () => {
  it.each([
    [
      'grid-420.jpg',
      { quality: 90, tables: 'ijg', subsampling: '4:2:0', progressive: false, mcu: { width: 16, height: 16 } },
    ],
    [
      'grid-444.jpg',
      { quality: 90, tables: 'ijg', subsampling: '4:4:4', progressive: false, mcu: { width: 8, height: 8 } },
    ],
    ['trailer-zip.jpg', { quality: 90, tables: 'ijg', subsampling: '4:2:0' }],
    ['ultra-hdr.jpg', { quality: 90, tables: 'ijg' }],
    [
      'photoshop.jpg',
      { tables: 'photoshop', tablesName: 'Photoshop “Save As” 10 or Lightroom 77–84%', subsampling: '4:4:4' },
    ],
  ])('reads %s', (name, expected) => {
    expect(jpegInfo(fixture(name))).toMatchObject(expected)
  })

  it.each([
    'Canon.jpg',
    'Nikon.jpg',
    'Sony.jpg',
    'Pentax.jpg',
    'FujiFilm.jpg',
    'Olympus.jpg',
    'Panasonic.jpg',
    'Apple.jpg',
  ])('gives the maker-note sample %s a plausible quality', (name) => {
    const info = jpegInfo(fixture(`exiftool/${name}`))!
    expect(info.quality).toBeGreaterThanOrEqual(1)
    expect(info.quality).toBeLessThanOrEqual(100)
  })
})

// ExifTool's JPEGDigest.pm keys these tables by the MD5 of the DQT segment Photoshop writes (both tables in one
// segment, zigzag order) and the sampling factors.
const EXIFTOOL_DIGESTS = [
  '683506a889c78d9bc230a0c7ee5f62f3:221111', // Adobe Photoshop, Quality 0
  'bc490651af6592cd1dbbbc4fa2cfa1fb:221111', // 1
  'ce4286d9f07999524c3c7472b065c5ab:221111', // 2
  '8453391d3adf377c46a1a0cee08c35c3:221111', // Adobe Lightroom, Quality 24% - 30%
  'f8ede291b1272576d1580e333d30103e:221111', // 31% - 38%
  'de0fb6d13e12e8df26140dd74691bf0f:221111', // 39% - 46%
  '0d5b0af72561f68c671731f22d9e41e2:221111', // 47% - 53%
  'b9fd15fd52408af5ea2a5045227233d8:111111', // 54% - 61%
  '27472e3714251402d5509438505611c3:111111', // 62% - 69%
  '34a599dff2b6aaed12143938b7374f2f:111111', // 70% - 76%
  '5c508e529d045b6f0c800e29ba2d6ab5:111111', // 77% - 84%
  '42bfe52476bf07f1ed0e6451903cc9ee:111111', // 85% - 92%
  '4c3c425b4024b68c0de03904a825bc35:111111', // 93% - 100%
]

it('holds Photoshop’s tables exactly as ExifTool knows them', () => {
  const photoshop = KNOWN_TABLES.filter((t) => t.tables === 'photoshop')
  const digests = photoshop.map(({ luma, chroma }) => {
    const segment = [0, ...ZIGZAG.map((i) => luma[i]), 1, ...ZIGZAG.map((i) => chroma![i])]
    return createHash('md5').update(Buffer.from(segment)).digest('hex')
  })
  expect(digests).toEqual(EXIFTOOL_DIGESTS.map((d) => d.split(':')[0]))
})
