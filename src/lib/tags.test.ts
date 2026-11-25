import { describe, expect, it } from 'vitest'
import { parseExifTool, toImageInfo } from './tags'

/** A list value, as ExifTool gives one (Subject, DirectoryItemSemantic…). */
const list = (...items: string[]) => ({ list: items })
type Raw = string | number | boolean | { list: string[] }
/** ExifTool's long JSON (`-json -l -G0:1`) for `tags`: each value printed, or [printed, number]. */
function long(tags: Record<string, Raw | [Raw, Raw]>): string {
  const object: Record<string, unknown> = { SourceFile: '/in.jpg' }
  const plain = (v: Raw) => (typeof v === 'object' ? v.list : v)
  for (const [key, value] of Object.entries(tags)) {
    const [val, num] = Array.isArray(value) ? value.map(plain) : [plain(value)]
    object[key] = { desc: key.split(':').at(-1), val, ...(num === undefined ? {} : { num }) }
  }
  return JSON.stringify([object])
}

const file = { name: 'IMG_0001.JPG', size: 2_400_000, lastModified: 1_700_000_000_000 }
const info = (tags: Record<string, Raw | [Raw, Raw]>, sniffed: Parameters<typeof toImageInfo>[2] = 'jpeg', name = file.name) =>
  toImageInfo(long({ 'File:FileType': 'JPEG', 'Composite:ImageSize': ['4032x3024', '4032 3024'], ...tags }), { ...file, name }, sniffed)!

describe('parseExifTool', () => {
  it('splits each key into its two groups and name, keeping the description, printed value and number', () => {
    const entries = parseExifTool(long({ 'EXIF:IFD0:Orientation': ['Rotate 90 CW', 6], 'Composite:ImageSize': ['8x8', '8 8'] }))
    expect(entries).toEqual([
      { family: 'EXIF', group: 'IFD0', name: 'Orientation', label: 'Orientation', val: 'Rotate 90 CW', num: 6 },
      { family: 'Composite', group: 'Composite', name: 'ImageSize', label: 'ImageSize', val: '8x8', num: '8 8' },
    ])
  })
})

describe('toImageInfo', () => {
  it('is null for a file that isn’t a picture', () => {
    expect(toImageInfo(long({ 'File:FileType': 'TXT' }), file, null)).toBe(null)
  })

  it('lists every tag as ExifTool prints it, and keeps its JSON as it came', () => {
    const json = long({ 'File:FileType': 'JPEG', 'EXIF:IFD0:Make': 'Apple', 'XMP:XMP-dc:Subject': list('sea', 'sky') })
    const result = toImageInfo(json, file, 'jpeg')!
    expect(result.json).toBe(json)
    expect(result.tags).toContainEqual({ family: 'EXIF', group: 'IFD0', name: 'Make', label: 'Make', value: 'Apple' })
    expect(result.tags).toContainEqual({ family: 'XMP', group: 'XMP-dc', name: 'Subject', label: 'Subject', value: 'sea, sky' })
  })

  it('names the format for display and notes an extension that doesn’t fit', () => {
    expect(info({}).formatName).toBe('JPEG')
    expect(info({}).extension).toBe(null)
    expect(info({}, 'jpeg', 'misnamed.png').extension).toEqual({ given: 'png', expected: 'jpg' })
    expect(info({ 'File:FileType': 'WEBP (lossless)' }, 'webp', 'a.webp').formatName).toBe('WebP')
    expect(info({ 'File:FileType': 'JXL Codestream' }, 'jxl', 'a.jxl').formatName).toBe('JPEG XL')
    expect(info({ 'File:FileType': 'NEF' }, 'tiff', 'a.nef')).toMatchObject({ format: 'raw', formatName: 'NEF' })
  })

  describe('size and orientation', () => {
    it('takes the stored size, and the upright size from Orientation', () => {
      expect(info({})).toMatchObject({ width: 4032, height: 3024, orientation: 1, displayWidth: 4032, displayHeight: 3024 })
      expect(info({ 'EXIF:IFD0:Orientation': ['Rotate 90 CW', 6] })).toMatchObject({
        orientation: 6,
        displayWidth: 3024,
        displayHeight: 4032,
      })
      expect(info({ 'EXIF:IFD0:Orientation': ['Rotate 180', 3] })).toMatchObject({ displayWidth: 4032 })
    })

    it('ignores an Orientation outside 1 to 8', () => {
      expect(info({ 'EXIF:IFD0:Orientation': ['Unknown (9)', 9] }).orientation).toBe(1)
    })
  })

  describe('picture', () => {
    it('reads the bit depth per channel from whichever tag the format has', () => {
      expect(info({ 'File:BitsPerSample': 8 }).bitDepth).toBe(8)
      expect(info({ 'PNG:PNG:BitDepth': 16 }, 'png').bitDepth).toBe(16)
      expect(info({ 'QuickTime:QuickTime:BitDepthLuma': 10 }, 'heic').bitDepth).toBe(10)
      expect(info({ 'EXIF:IFD0:BitsPerSample': '16 16 16' }, 'tiff').bitDepth).toBe(16)
      expect(info({ 'File:BitDepth': 24 }, 'bmp').bitDepth).toBe(8)
      expect(info({}).bitDepth).toBe(null)
    })

    it('knows transparency from PNG colour types and WebP’s flag', () => {
      expect(info({ 'PNG:PNG:ColorType': ['RGB with Alpha', 6] }, 'png').alpha).toBe(true)
      expect(info({ 'PNG:PNG:ColorType': ['RGB', 2] }, 'png').alpha).toBe(false)
      expect(info({ 'RIFF:RIFF:AlphaIsUsed': ['Yes', 1] }, 'webp').alpha).toBe(true)
      expect(info({}).alpha).toBe(false)
    })

    it('names the colour space from the ICC profile, or EXIF and nclx without one', () => {
      const profile = (description: string, data = 'RGB ') =>
        info({ 'ICC_Profile:ICC_Profile:ProfileDescription': description, 'ICC_Profile:ICC-header:ColorSpaceData': data }).colour
      expect(profile('Display P3')).toEqual({ profile: 'Display P3', space: 'display-p3', hdr: null })
      expect(profile('sRGB IEC61966-2.1').space).toBe('srgb')
      expect(profile('Adobe RGB (1998)').space).toBe('adobe-rgb')
      expect(profile('Nikon Adobe RGB 4.0.0.3000').space).toBe('adobe-rgb')
      expect(profile('ProPhoto RGB').space).toBe('prophoto')
      expect(profile('ITU-R BT.2020').space).toBe('rec2020')
      expect(profile('Dot Gain 20%', 'GRAY').space).toBe('grey')
      expect(profile('U.S. Web Coated (SWOP) v2', 'CMYK').space).toBe('cmyk')
      expect(profile('My scanner').space).toBe('other')
      expect(info({ 'EXIF:ExifIFD:ColorSpace': ['sRGB', 1] }).colour.space).toBe('srgb')
      expect(info({ 'QuickTime:QuickTime:ColorPrimaries': ['BT.709', 1] }, 'heic').colour.space).toBe('srgb')
      expect(info({ 'QuickTime:QuickTime:ColorPrimaries': ['P3 (D65)', 12] }, 'heic').colour.space).toBe('display-p3')
      expect(info({ 'QuickTime:QuickTime:ColorPrimaries': ['BT.2020', 9] }, 'avif').colour.space).toBe('rec2020')
      expect(info({ 'File:ColorComponents': 1 }).colour.space).toBe('grey')
      expect(info({}).colour).toEqual({ profile: null, space: null, hdr: null })
    })

    it('finds HDR: a gain map, or PQ and HLG transfer', () => {
      expect(info({ 'XMP:XMP-hdrgm:Version': 1 }).colour.hdr).toBe('gain-map')
      expect(info({ 'APP2:APP2:UniformResourceName': 'urn:iso:std:iso:ts:21496:-1' }).colour.hdr).toBe('gain-map')
      expect(info({ 'QuickTime:QuickTime:TransferCharacteristics': ['SMPTE ST 2084 (PQ)', 16] }, 'avif').colour.hdr).toBe('pq')
      expect(info({ 'QuickTime:QuickTime:TransferCharacteristics': ['HLG', 18] }, 'heic').colour.hdr).toBe('hlg')
    })

    it('reads an animation’s frames, length and loops', () => {
      const gif = info({ 'GIF:GIF:FrameCount': 24, 'GIF:GIF:Duration': ['2.40 s', 2.4], 'GIF:GIF:AnimationIterations': ['Infinite', 0] }, 'gif')
      expect(gif.animation).toEqual({ frames: 24, duration: 2.4, loops: 'forever' })
      const png = info({ 'PNG:PNG:AnimationFrames': 3, 'PNG:PNG:AnimationPlays': 2, 'Composite:Duration': ['0.30 s', 0.3] }, 'png')
      expect(png.animation).toEqual({ frames: 3, duration: 0.3, loops: 2 })
      expect(info({ 'GIF:GIF:FrameCount': 1 }, 'gif').animation).toBe(null)
    })
  })

  describe('camera', () => {
    it('is null when nothing about a camera is recorded', () => {
      expect(info({}).camera).toBe(null)
    })

    it('reads make, model, lens, exposure and focal lengths', () => {
      const camera = info({
        'EXIF:IFD0:Make': 'Apple',
        'EXIF:IFD0:Model': 'iPhone 7',
        'EXIF:ExifIFD:ExposureTime': ['1/20', 0.05],
        'EXIF:ExifIFD:FNumber': 1.8,
        'EXIF:ExifIFD:ISO': 40,
        'EXIF:ExifIFD:ExposureCompensation': ['-2/3', -0.666666666666667],
        'EXIF:ExifIFD:FocalLength': ['4.0 mm', 3.99],
        'EXIF:ExifIFD:FocalLengthIn35mmFormat': ['28 mm', 28],
        'EXIF:ExifIFD:Flash': ['Off, Did not fire', 16],
        'EXIF:IFD0:Software': '10.0.2',
        'Composite:LensID': 'iPhone 7 back camera 3.99mm f/1.8',
      }).camera
      expect(camera).toMatchObject({
        make: 'Apple',
        model: 'iPhone 7',
        lens: 'iPhone 7 back camera 3.99mm f/1.8',
        exposure: { time: '1/20', aperture: 1.8, iso: 40, bias: -0.666666666666667 },
        focalLength: 3.99,
        focal35: 28,
        flash: 'Off, Did not fire',
        software: '10.0.2',
      })
    })

    it('prefers a lens ExifTool identified, then the lens model, then its range', () => {
      const lens = (tags: Record<string, Raw>) => info({ 'EXIF:IFD0:Make': 'Canon', ...tags }).camera!.lens
      expect(lens({ 'Composite:LensID': 'Unknown 18-55mm', 'Composite:Lens': '18.0 - 55.0 mm' })).toBe('18.0 - 55.0 mm')
      expect(lens({ 'Composite:LensID': 'Unknown 18-55mm' })).toBe('Unknown 18-55mm')
      expect(lens({ 'EXIF:ExifIFD:LensModel': 'EF-S18-55mm', 'Composite:LensID': 'Canon EF-S 18-55mm f/3.5-5.6 IS II' })).toBe(
        'Canon EF-S 18-55mm f/3.5-5.6 IS II',
      )
      expect(lens({ 'Composite:LensID': 'Unknown 18-55mm', 'EXIF:ExifIFD:LensModel': 'EF-S18-55mm' })).toBe('EF-S18-55mm')
    })

    it('reads serial numbers and the owner from EXIF, XMP or the maker notes, ignoring blanks', () => {
      const camera = info({
        'EXIF:IFD0:Make': 'Canon',
        'MakerNotes:Canon:SerialNumber': ['0560018150', 560018150],
        'MakerNotes:Canon:InternalSerialNumber': 'G002669',
        'EXIF:ExifIFD:LensSerialNumber': '000023990c',
        'MakerNotes:Canon:OwnerName': 'Phil Harvey',
        'EXIF:ExifIFD:OwnerName': '',
      }).camera
      expect(camera).toMatchObject({
        bodySerial: '0560018150',
        internalSerial: 'G002669',
        lensSerial: '000023990c',
        owner: 'Phil Harvey',
      })
      const blank = info({ 'EXIF:IFD0:Make': 'Canon', 'MakerNotes:Canon:OwnerName': '  ' }).camera
      expect(blank!.owner).toBe(null)
      expect(info({ 'EXIF:IFD0:CameraSerialNumber': '012345678' }).camera!.bodySerial).toBe('012345678')
      expect(info({ 'XMP:XMP-aux:SerialNumber': '062062059949' }).camera!.bodySerial).toBe('062062059949')
    })

    it('reads a shutter count from the maker notes, and Fujifilm’s image count as one', () => {
      expect(info({ 'MakerNotes:Nikon:ShutterCount': 3619 }).camera!.shutterCount).toBe(3619)
      expect(info({ 'MakerNotes:FujiFilm:ImageCount': 1201 }).camera!.shutterCount).toBe(1201)
      // Nikon's ImageCount counts pictures saved, not shutter actuations.
      expect(info({ 'EXIF:IFD0:Make': 'NIKON', 'MakerNotes:Nikon:ImageCount': 2 }).camera!.shutterCount).toBe(null)
    })
  })

  describe('dates', () => {
    it('reads taken, digitised and modified with their offsets, and GPS time in UTC', () => {
      const dates = info({
        'EXIF:ExifIFD:DateTimeOriginal': '2025:03:12 14:32:05',
        'EXIF:ExifIFD:OffsetTimeOriginal': '+13:00',
        'EXIF:ExifIFD:CreateDate': '2025:03:12 14:32:05',
        'EXIF:IFD0:ModifyDate': '2025:03:15 09:00:00',
        'EXIF:ExifIFD:OffsetTime': '+13:00',
        'Composite:GPSDateTime': '2025:03:12 01:32:04.5Z',
      }).dates
      expect(dates).toEqual({
        taken: { local: '2025-03-12T14:32:05', offset: '+13:00' },
        digitised: { local: '2025-03-12T14:32:05', offset: null },
        modified: { local: '2025-03-15T09:00:00', offset: '+13:00' },
        gpsUtc: '2025-03-12T01:32:04.5Z',
      })
    })

    it('takes an offset written into an XMP date, and falls back to XMP and QuickTime dates', () => {
      expect(info({ 'XMP:XMP-exif:DateTimeOriginal': '2005:08:03 18:59:18-04:00' }).dates.taken).toEqual({
        local: '2005-08-03T18:59:18',
        offset: '-04:00',
      })
      expect(info({ 'XMP:XMP-photoshop:DateCreated': '2005:08:03' }).dates.taken).toEqual({
        local: '2005-08-03T00:00:00',
        offset: null,
      })
      expect(info({ 'QuickTime:QuickTime:CreateDate': '2024:01:02 03:04:05' }).dates.taken!.local).toBe('2024-01-02T03:04:05')
    })

    it('takes the offset from another copy of the same moment when the first has none', () => {
      // A Canon CRW's own date has no zone; XMP's copy of it, written by Loupe, has one.
      expect(
        info({
          'MakerNotes:CanonRaw:DateTimeOriginal': '2024:01:02 03:04:05',
          'XMP:XMP-photoshop:DateCreated': '2024:01:02 03:04:05+05:30',
        }).dates.taken,
      ).toEqual({ local: '2024-01-02T03:04:05', offset: '+05:30' })
      // Another moment's zone isn't this one's.
      expect(
        info({
          'EXIF:ExifIFD:DateTimeOriginal': '2024:01:02 03:04:05',
          'XMP:XMP-photoshop:DateCreated': '2023:12:31 10:00:00+05:30',
        }).dates.taken,
      ).toEqual({ local: '2024-01-02T03:04:05', offset: null })
    })

    it('ignores empty and zero dates', () => {
      const dates = info({ 'EXIF:ExifIFD:DateTimeOriginal': '0000:00:00 00:00:00', 'EXIF:IFD0:ModifyDate': '    :  :     :  :  ' }).dates
      expect(dates).toEqual({ taken: null, digitised: null, modified: null, gpsUtc: null })
    })
  })

  describe('GPS', () => {
    it('reads signed coordinates, altitude, direction, speed and accuracy', () => {
      const gps = info({
        'Composite:GPSLatitude': ['53 deg 22\' 58.25" N', 53.3828472222222],
        'Composite:GPSLongitude': ['1 deg 27\' 24.04" W', -1.45667777777778],
        'Composite:GPSAltitude': ['72.3 m Above Sea Level', 72.36649215],
        'EXIF:GPS:GPSImgDirection': 342.0498753,
        'EXIF:GPS:GPSImgDirectionRef': ['True North', 'T'],
        'EXIF:GPS:GPSSpeed': 36,
        'EXIF:GPS:GPSSpeedRef': ['mph', 'M'],
        'EXIF:GPS:GPSHPositioningError': ['165 m', 165],
      }).gps
      expect(gps).toEqual({
        lat: 53.3828472222222,
        lon: -1.45667777777778,
        altitude: 72.36649215,
        direction: { degrees: 342.0498753, ref: 'true' },
        speed: expect.closeTo(57.936384),
        accuracy: 165,
      })
    })

    it('reads XMP coordinates when there are no EXIF ones, and is null without a position', () => {
      const gps = info({ 'XMP:XMP-exif:GPSLatitude': ['36 deg S', -36.5], 'XMP:XMP-exif:GPSLongitude': ['174 deg E', 174.75] }).gps
      expect(gps).toMatchObject({ lat: -36.5, lon: 174.75, direction: null, speed: null })
      expect(info({ 'EXIF:GPS:GPSVersionID': '2.3.0.0' }).gps).toBe(null)
    })

    it('reads a magnetic direction, and knots as km/h', () => {
      const gps = info({
        'Composite:GPSLatitude': ['', 1],
        'Composite:GPSLongitude': ['', 2],
        'EXIF:GPS:GPSImgDirection': 90,
        'EXIF:GPS:GPSImgDirectionRef': ['Magnetic North', 'M'],
        'EXIF:GPS:GPSSpeed': 10,
        'EXIF:GPS:GPSSpeedRef': ['knots', 'N'],
      }).gps
      expect(gps!.direction).toEqual({ degrees: 90, ref: 'magnetic' })
      expect(gps!.speed).toBeCloseTo(18.52)
    })
  })

  describe('kinds', () => {
    it('finds each special kind by its marker', () => {
      expect(info({ 'XMP:XMP-exif:UserComment': 'Screenshot' }, 'png').kinds).toEqual(['screenshot'])
      expect(info({ 'EXIF:ExifIFD:UserComment': 'Screenshot' }).kinds).toEqual(['screenshot'])
      expect(info({ 'XMP:XMP-GCamera:MotionPhoto': 1 }).kinds).toEqual(['motion-photo'])
      expect(info({ 'XMP:XMP-GCamera:MicroVideo': 1 }).kinds).toEqual(['motion-photo'])
      expect(info({ 'MakerNotes:Apple:ContentIdentifier': 'A1B2' }).kinds).toEqual(['live-photo'])
      expect(info({ 'XMP:XMP-hdrgm:Version': 1 }).kinds).toEqual(['ultra-hdr'])
      expect(info({ 'XMP:XMP-GDepth:Format': 'RangeInverse' }).kinds).toEqual(['portrait-depth'])
      expect(info({ 'XMP:XMP-GPano:ProjectionType': 'equirectangular' }).kinds).toEqual(['panorama-360'])
      expect(info({ 'MakerNotes:Apple:BurstUUID': 'X' }).kinds).toEqual(['burst'])
      expect(info({ 'GIF:GIF:FrameCount': 3 }, 'gif').kinds).toEqual(['animated'])
      expect(info({ 'File:FileType': 'CR3' }, null, 'a.cr3').kinds).toEqual(['raw'])
      expect(info({}).kinds).toEqual([])
    })

    it('finds a Motion Photo and a depth map from Google’s container directory', () => {
      const semantic = (s: string[]) => info({ 'XMP:XMP-GContainer:DirectoryItemSemantic': list(...s) }).kinds
      expect(semantic(['Primary', 'MotionPhoto'])).toEqual(['motion-photo'])
      expect(semantic(['Primary', 'Depth'])).toEqual(['portrait-depth'])
      expect(semantic(['Primary', 'GainMap'])).toEqual(['ultra-hdr'])
    })
  })

  describe('embedded', () => {
    it('lists thumbnails, previews and other pictures with their sizes', () => {
      const embedded = info(
        {
          'File:FileType': 'NEF',
          'EXIF:IFD1:ThumbnailImage': '(Binary data 9362 bytes, use -b option to extract)',
          'EXIF:PreviewIFD:PreviewImage': '(Binary data 120000 bytes, use -b option to extract)',
          'EXIF:SubIFD:JpgFromRaw': '(Binary data 1400000 bytes, use -b option to extract)',
          'ICC_Profile:ICC_Profile:ProfileDescription': 'Nikon Adobe RGB 4.0.0.3000',
          'XMP:XMP-x:XMPToolkit': 'Adobe XMP Core',
        },
        'tiff',
        'a.nef',
      ).embedded
      expect(embedded).toEqual([
        { id: 'EXIF:IFD1:ThumbnailImage', kind: 'thumbnail', label: 'EXIF thumbnail', size: 9362, extension: 'jpg', isImage: true },
        { id: 'EXIF:PreviewIFD:PreviewImage', kind: 'preview', label: 'Preview', size: 120000, extension: 'jpg', isImage: true },
        { id: 'EXIF:SubIFD:JpgFromRaw', kind: 'preview', label: 'Full-size preview', size: 1400000, extension: 'jpg', isImage: true },
        { id: 'icc-profile', kind: 'icc-profile', label: 'Colour profile: Nikon Adobe RGB 4.0.0.3000', size: null, extension: 'icc', isImage: false },
        { id: 'xmp', kind: 'xmp', label: 'XMP metadata', size: null, extension: 'xmp', isImage: false },
      ])
    })

    it('tells an Ultra HDR gain map from other MPF pictures', () => {
      const embedded = info({
        'XMP:XMP-hdrgm:Version': 1,
        'MPF:MPImage2:MPImage2': '(Binary data 1218 bytes, use -b option to extract)',
        'MakerNotes:Google:GainMapImage': '(Binary data 1218 bytes, use -b option to extract)',
        'MPF:MPImage3:MPImage3': '(Binary data 5000 bytes, use -b option to extract)',
      }).embedded
      expect(embedded.map((e) => [e.id, e.kind, e.size])).toEqual([
        ['MakerNotes:Google:GainMapImage', 'gain-map', 1218],
        ['MPF:MPImage3:MPImage3', 'mpf-image', 5000],
        ['xmp', 'xmp', null],
      ])
    })

    it('lists a Motion Photo’s video and Content Credentials', () => {
      const embedded = info({
        'Trailer:Google:MotionPhotoVideo': '(Binary data 2400000 bytes, use -b option to extract)',
        'JUMBF:JUMBF:JUMDLabel': 'c2pa',
      }).embedded
      expect(embedded.map((e) => [e.kind, e.extension, e.isImage])).toEqual([
        ['motion-video', 'mp4', false],
        ['c2pa-manifest', 'json', false],
      ])
    })
  })
})
