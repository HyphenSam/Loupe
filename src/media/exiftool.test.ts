// ExifTool end to end in Node: every fixture read with the app's arguments and turned into ImageInfo.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { sniff } from '@/lib/formats'
import { toImageInfo } from '@/lib/tags'
import { readBinary, readHistory, readTags, writeTags } from './exiftool'
import { FIXTURES, fixture, useNodeExifTool } from './node'

beforeAll(useNodeExifTool)
// ExifTool starts in about half a second; later reads take a few hundred milliseconds each.
vi.setConfig({ testTimeout: 30_000 })

// Each fixture is read once: ExifTool takes a few hundred milliseconds a file.
const read = new Map<string, ReturnType<typeof toImageInfo>>()
async function open(name: string) {
  if (!read.has(name)) {
    const bytes = fixture(name)
    const json = await readTags(name, bytes)
    read.set(
      name,
      toImageInfo(json, { name: name.split('/').at(-1)!, size: bytes.length, lastModified: 0 }, sniff(bytes), bytes),
    )
  }
  return read.get(name)!
}

const files = ['', 'exiftool', 'c2pa'].flatMap((dir) =>
  readdirSync(join(FIXTURES, dir))
    .map((name) => (dir ? `${dir}/${name}` : name))
    .filter((name) => statSync(join(FIXTURES, name)).isFile() && !name.endsWith('.md')),
)

describe('reading every fixture', () => {
  it.each(files.filter((name) => name !== 'notimage.txt'))(
    '%s opens with a format, a size and its tags',
    async (name) => {
      const info = await open(name)
      expect(info).not.toBe(null)
      expect(info!.width).toBeGreaterThan(0)
      expect(info!.height).toBeGreaterThan(0)
      expect(info!.tags.some((tag) => tag.family === 'File' && tag.name === 'FileType')).toBe(true)
      expect(JSON.parse(info!.json)[0].SourceFile).toBe('/image.' + name.split('.').at(-1))
    },
  )

  it('turns a text file away', async () => {
    expect(await open('notimage.txt')).toBe(null)
  })
})

describe('formats', () => {
  it('knows each format and its name', async () => {
    const names: Record<string, [string, string]> = {
      'grid-420.jpg': ['jpeg', 'JPEG'],
      'png-16-alpha.png': ['png', 'PNG'],
      'lossless.webp': ['webp', 'WebP'],
      'photo.avif': ['avif', 'AVIF'],
      'photo.heic': ['heic', 'HEIC'],
      'photo.jxl': ['jxl', 'JPEG XL'],
      'anim.gif': ['gif', 'GIF'],
      'picture.bmp': ['bmp', 'BMP'],
      'scan.tif': ['tiff', 'TIFF'],
      'exiftool/Nikon.nef': ['raw', 'NEF'],
      'exiftool/DNG.dng': ['raw', 'DNG'],
      'exiftool/CanonRaw.cr3': ['raw', 'CR3'],
      'exiftool/CanonRaw.crw': ['raw', 'CRW'],
      'exiftool/FujiFilm.raf': ['raw', 'RAF'],
      'exiftool/Panasonic.rw2': ['raw', 'RW2'],
      'exiftool/PhaseOne.iiq': ['raw', 'IIQ'],
      'exiftool/Sigma.x3f': ['raw', 'X3F'],
    }
    for (const [name, [format, formatName]] of Object.entries(names))
      expect(await open(name), name).toMatchObject({ format, formatName })
  })

  it('notices a JPEG named .png', async () => {
    expect((await open('misnamed.png'))!.extension).toEqual({ given: 'png', expected: 'jpg' })
    expect((await open('grid-420.jpg'))!.extension).toBe(null)
  })

  it('reads bit depth, transparency and animation', async () => {
    expect(await open('png-16-alpha.png')).toMatchObject({ bitDepth: 16, alpha: true, animation: null })
    expect(await open('anim.gif')).toMatchObject({
      animation: { frames: 3, duration: 0.6, loops: 'forever' },
      kinds: ['animated'],
    })
    expect(await open('picture.bmp')).toMatchObject({ bitDepth: 8, alpha: false })
  })

  it('finds the Ultra HDR gain map and its Display P3 profile', async () => {
    const info = (await open('ultra-hdr.jpg'))!
    expect(info.colour).toEqual({
      profile: 'Display P3 Gamut with sRGB Transfer',
      space: 'display-p3',
      hdr: 'gain-map',
    })
    expect(info.kinds).toEqual(['ultra-hdr'])
    expect(info.embedded.find((e) => e.kind === 'gain-map')).toMatchObject({ size: 1218, isImage: true })
    expect(info.embedded.filter((e) => e.kind === 'mpf-image')).toEqual([])
  })

  it('lists Content Credentials', async () => {
    expect((await open('c2pa/CA.jpg'))!.embedded.map((e) => e.kind)).toContain('c2pa-manifest')
  })
})

describe('cameras, from ExifTool’s maker-note samples', () => {
  it('reads Nikon’s shutter count, serial and lens', async () => {
    expect((await open('exiftool/Nikon.nef'))!.camera).toMatchObject({
      make: 'NIKON CORPORATION',
      model: 'NIKON D70',
      lens: 'AF-S DX Zoom-Nikkor 18-70mm f/3.5-4.5G IF-ED',
      bodySerial: '12345678',
      shutterCount: 3619,
    })
    expect((await open('exiftool/NikonD70.jpg'))!.camera).toMatchObject({
      shutterCount: 526,
      bodySerial: 'No= 20025585',
    })
    expect((await open('exiftool/NikonD2Hs.jpg'))!.camera).toMatchObject({ shutterCount: 2, bodySerial: '3001006' })
  })

  it('reads Canon’s serials, owner and shutter count', async () => {
    expect((await open('exiftool/Canon.jpg'))!.camera).toMatchObject({ bodySerial: '0560018150', owner: 'Phil Harvey' })
    expect((await open('exiftool/Canon1DmkIII.jpg'))!.camera).toMatchObject({
      bodySerial: '500292',
      internalSerial: 'G002669',
      shutterCount: 1,
      lens: 'Canon EF 16-35mm f/2.8L II USM',
      owner: null,
    })
    expect((await open('exiftool/CanonRaw.cr3'))!.camera).toMatchObject({
      model: 'Canon EOS M50',
      bodySerial: '613040000565',
      internalSerial: 'CG0156580',
      lensSerial: '0000000000',
    })
  })

  it('reads Pentax’s, Olympus’s and Panasonic’s', async () => {
    const pentax = (await open('exiftool/Pentax.jpg'))!
    expect(pentax.camera).toMatchObject({
      shutterCount: 1648,
      internalSerial: '132352',
      lens: 'Sigma AF 10-20mm F4-5.6 EX DC',
    })
    expect(pentax).toMatchObject({ orientation: 8, width: 8, height: 8 })
    expect((await open('exiftool/OlympusE1.jpg'))!.camera).toMatchObject({
      bodySerial: '143008611',
      lensSerial: '050105886',
      internalSerial: '4001310004375102',
    })
    expect((await open('exiftool/Panasonic.jpg'))!.camera).toMatchObject({
      internalSerial: '(S00) 2004:07:19 no. 0102',
      focal35: 35,
    })
  })

  it('reads a phone’s exposure, location and dates', async () => {
    const info = (await open('exiftool/Apple.jpg'))!
    expect(info.camera).toMatchObject({
      make: 'Apple',
      model: 'iPhone 7',
      exposure: { time: '1/20', aperture: 1.8, iso: 40, bias: 0 },
      focalLength: 3.99,
      focal35: 28,
      flash: 'Off, Did not fire',
      software: '10.0.2',
    })
    expect(info.gps).toMatchObject({
      lat: expect.closeTo(53.38285, 5),
      lon: expect.closeTo(-1.45668, 5),
      altitude: expect.closeTo(72.37, 2),
      direction: { degrees: expect.closeTo(342.05, 2), ref: 'true' },
      speed: 0,
      accuracy: 165,
    })
    expect(info.dates).toEqual({
      taken: { local: '2016-09-28T18:18:05', offset: null },
      digitised: { local: '2016-09-28T18:18:05', offset: null },
      modified: { local: '2016-09-28T18:18:05', offset: null },
      gpsUtc: '2016-09-28T17:17:58.65Z',
    })
  })

  it('reads dates with offsets, and raw formats’ own date tags', async () => {
    expect((await open('exiftool/CanonRaw.cr3'))!.dates.taken).toEqual({
      local: '2018-02-21T12:08:56',
      offset: '+00:00',
    })
    expect((await open('exiftool/Sigma.x3f'))!.dates.taken!.local).toBe('2001-01-01T00:36:35')
    expect((await open('exiftool/CanonRaw.crw'))!.dates.taken!.local).toBe('2003-11-10T17:39:26')
  })

  it('lists embedded thumbnails and previews', async () => {
    const kinds = async (name: string) => (await open(name))!.embedded.map((e) => e.kind)
    expect(await kinds('exiftool/Nikon.nef')).toEqual(expect.arrayContaining(['preview', 'icc-profile']))
    expect(await kinds('exiftool/FujiFilm.raf')).toEqual(expect.arrayContaining(['thumbnail', 'preview']))
    expect(await kinds('grid-420.jpg')).toEqual([])
  })
})

describe('Loupe’s own fixtures', () => {
  it('reads camera.jpg: the camera, dates with their zone, the location and the thumbnail', async () => {
    const info = (await open('camera.jpg'))!
    expect(info.camera).toEqual({
      make: 'Loupe',
      model: 'Test Camera 1',
      lens: 'Loupe 35mm F2',
      exposure: { time: '1/250', aperture: 2.8, iso: 400, bias: -0.7 },
      focalLength: 35,
      focal35: 52,
      flash: 'Off, Did not fire',
      bodySerial: 'LT0012345',
      lensSerial: 'LS0067890',
      internalSerial: null,
      owner: 'A. Photographer',
      shutterCount: null,
      software: 'Loupe fixtures',
    })
    expect(info.dates).toEqual({
      taken: { local: '2025-03-12T14:32:05', offset: '+13:00' },
      digitised: { local: '2025-03-12T14:32:05', offset: '+13:00' },
      modified: { local: '2025-03-15T09:00:00', offset: '+13:00' },
      gpsUtc: '2025-03-12T01:32:05Z',
    })
    expect(info.gps).toEqual({
      lat: expect.closeTo(-44.9405, 4),
      lon: expect.closeTo(168.8263, 4),
      altitude: 312,
      direction: { degrees: 312, ref: 'true' },
      speed: null,
      accuracy: 5,
    })
    expect(info.embedded).toEqual([
      {
        id: 'EXIF:IFD1:ThumbnailImage',
        kind: 'thumbnail',
        label: 'EXIF thumbnail',
        size: 475,
        extension: 'jpg',
        isImage: true,
        tag: { family: 'EXIF', group: 'IFD1', name: 'ThumbnailImage' },
      },
    ])
  })

  it('keeps the thumbnail of the whole in cropped-thumb.jpg', async () => {
    expect(await open('cropped-thumb.jpg')).toMatchObject({ width: 32, height: 48, embedded: [{ kind: 'thumbnail' }] })
  })

  it('stands orient-6.jpg upright', async () => {
    expect(await open('orient-6.jpg')).toMatchObject({
      width: 40,
      height: 24,
      orientation: 6,
      displayWidth: 24,
      displayHeight: 40,
    })
  })

  it('knows screenshot.png for a screenshot', async () => {
    expect((await open('screenshot.png'))!.kinds).toEqual(['screenshot'])
  })
})

describe('readBinary', () => {
  it('reads a tag’s bytes', async () => {
    const preview = await readBinary('FujiFilm.raf', fixture('exiftool/FujiFilm.raf'), 'PreviewImage')
    expect(preview!.length).toBe(12167)
    expect([...preview!.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
  })

  it('is null when the file has no such tag', async () => {
    expect(await readBinary('grid-420.jpg', fixture('grid-420.jpg'), 'PreviewImage')).toBe(null)
  })
})

describe('Digital Source Type', () => {
  it('reads IPTC’s term from XMP as the file states it', async () => {
    expect((await open('iptc-ai.jpg'))!.sourceType).toBe(
      'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
    )
  })

  it('is null when the file doesn’t state one', async () => {
    expect((await open('camera.jpg'))!.sourceType).toBe(null)
  })
})

describe('writeTags', () => {
  it('runs arguments on a copy of the file and returns the new bytes', async () => {
    const out = await writeTags('image.jpg', fixture('camera.jpg'), ['-GPS:all='])
    const info = toImageInfo(
      await readTags('camera.jpg', out),
      { name: 'camera.jpg', size: out.length, lastModified: 0 },
      'jpeg',
    )!
    expect(info.gps).toBe(null)
    expect(info.camera?.model).toBe('Test Camera 1')
  })

  it('fails with ExifTool’s reason, in a sentence', async () => {
    await expect(writeTags('image.bmp', fixture('picture.bmp'), ['-all='])).rejects.toThrow(
      'ExifTool couldn’t change this file: Writing of BMP files is not yet supported',
    )
  })
})

describe('what Forensics reads', () => {
  it('reads photoshop.jpg’s edit trail', async () => {
    expect((await open('photoshop.jpg'))!.edits).toEqual({
      software: 'Adobe Photoshop 25.0 (Windows)',
      history: [],
      settings: ['Exposure +0.70', 'Highlights −45', 'Shadows +30', 'Clarity +12', 'Vibrance +10', 'Crop'],
      settingsBy: 'Camera Raw 16.0',
      ancestors: 3,
      mismatches: [
        'The date taken differs: 12 March 2025 at 14:32 in EXIF, 12 March 2025 at 15:32 in XMP.',
        'Modified 21 days after it was taken.',
      ],
    })
  })

  it('reads photoshop.jpg’s tables and trailer-zip.jpg’s hidden data from their bytes', async () => {
    expect((await open('photoshop.jpg'))!.jpeg).toMatchObject({ tables: 'photoshop', subsampling: '4:4:4' })
    expect((await open('trailer-zip.jpg'))!.trailer).toMatchObject({ looksLike: 'zip' })
  })

  it('reads the history’s steps whole, each with only what it holds', async () => {
    const photoshop = 'Adobe Photoshop 25.0 (Windows)'
    expect(await readHistory('photoshop.jpg', fixture('photoshop.jpg'))).toEqual([
      {
        Action: 'created',
        InstanceID: 'xmp.iid:1d2c3b4a-5f6e-4d7c-8b9a-0f1e2d3c4b5a',
        SoftwareAgent: photoshop,
        When: '2025:04:02 16:10:21+13:00',
      },
      {
        Action: 'saved',
        Changed: '/',
        InstanceID: 'xmp.iid:2e3d4c5b-6a7f-4e8d-9c0b-1a2f3e4d5c6b',
        SoftwareAgent: photoshop,
        When: '2025:04:02 16:25:03+13:00',
      },
      { Action: 'converted', Parameters: 'from application/vnd.adobe.photoshop to image/jpeg' },
      { Action: 'derived', Parameters: 'converted from application/vnd.adobe.photoshop to image/jpeg' },
      {
        Action: 'saved',
        Changed: '/',
        InstanceID: 'xmp.iid:5c2e9a71-3f0b-4d8e-a1c6-7b9d0e2f4a83',
        SoftwareAgent: photoshop,
        When: '2025:04:03 09:12:44+13:00',
      },
    ])
  })

  it('reads no history from a file without one', async () => {
    expect(await readHistory('camera.jpg', fixture('camera.jpg'))).toBe(null)
  })
})
