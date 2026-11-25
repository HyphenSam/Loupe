import { describe, expect, it } from 'vitest'
import { finding } from './ai/finding'
import type { Tag } from './info'
import { EVERYTHING_ARGS, leftAfter, privacyFindings, removalArgs, type PrivacyFinding } from './privacy'
import { fakeInfo } from './testing'

const tag = (family: string, group: string, name: string, value: string, label = name): Tag => ({
  family,
  group,
  name,
  label,
  value,
})

const GPS = [
  tag('EXIF', 'GPS', 'GPSLatitude', '44 deg 56\' 25.80" S', 'GPS Latitude'),
  tag('EXIF', 'GPS', 'GPSLongitude', '168 deg 49\' 34.68" E', 'GPS Longitude'),
  tag('EXIF', 'GPS', 'GPSDateStamp', '2025:03:12', 'GPS Date Stamp'),
  tag('EXIF', 'GPS', 'GPSTimeStamp', '01:32:05', 'GPS Time Stamp'),
  tag('Composite', 'Composite', 'GPSPosition', "44 deg 56' S, 168 deg 49' E", 'GPS Position'),
]
const gps = { lat: -44.9405, lon: 168.8263, altitude: null, direction: null, speed: null, accuracy: null }

const byId = (list: PrivacyFinding[], id: string) => list.find((f) => f.id === id)

describe('privacyFindings', () => {
  it('finds nothing in a file with no identifying metadata', () => {
    const info = fakeInfo({ tags: [tag('File', 'File', 'FileType', 'JPEG')], camera: null, dates: noDates() })
    expect(privacyFindings(info, null)).toEqual([])
  })

  // A Pixel 9 writes a GPS block with its version and nothing else when location is off.
  it('lists no GPS position when the GPS tags hold none', () => {
    const empty = [
      tag('EXIF', 'GPS', 'GPSVersionID', '0.0.0.0', 'GPS Version ID'),
      tag('EXIF', 'GPS', 'GPSImgDirectionRef', 'Unknown ()', 'GPS Img Direction Ref'),
      tag('EXIF', 'GPS', 'GPSImgDirection', 'undef', 'GPS Img Direction'),
    ]
    expect(byId(privacyFindings(fakeInfo({ tags: empty, gps: null, dates: noDates() }), null), 'gps')).toBe(undefined)
  })

  it('lists the GPS position once, apart from the GPS time, and never the composite tags', () => {
    const list = privacyFindings(fakeInfo({ tags: GPS, gps, dates: noDates() }), null)
    const position = byId(list, 'gps')!
    expect(position).toMatchObject({ group: 'location', label: 'GPS position', value: '-44.94050, 168.82630' })
    expect(position.args).toEqual(['-GPS:GPSLatitude=', '-GPS:GPSLongitude='])
    expect(byId(list, 'date:gps')).toMatchObject({ group: 'dates', label: 'GPS time' })
    expect(byId(list, 'date:gps')!.args).toEqual(['-GPS:GPSDateStamp=', '-GPS:GPSTimeStamp='])
  })

  it('lists place fields in IPTC and XMP, one row a field, with the copies in every group behind it', () => {
    const list = privacyFindings(
      fakeInfo({
        tags: [
          tag('IPTC', 'IPTC', 'City', 'Arrowtown'),
          tag('XMP', 'XMP-photoshop', 'City', 'Arrowtown'),
          tag('XMP', 'XMP-iptcExt', 'LocationShownCity', 'Queenstown', 'Location Shown City'),
        ],
        dates: noDates(),
        camera: null,
      }),
      null,
    )
    expect(list.map((f) => [f.group, f.label, f.value])).toEqual([
      ['location', 'City', 'Arrowtown'],
      ['location', 'Location Shown City', 'Queenstown'],
    ])
    expect(list[0].args).toEqual(['-IPTC:City=', '-XMP-photoshop:City='])
  })

  it('lists serial numbers, unique IDs, people and software', () => {
    const list = privacyFindings(
      fakeInfo({
        tags: [
          tag('EXIF', 'ExifIFD', 'SerialNumber', 'LT0012345', 'Serial Number'),
          tag('EXIF', 'ExifIFD', 'LensSerialNumber', 'LS0067890', 'Lens Serial Number'),
          tag('MakerNotes', 'Canon', 'InternalSerialNumber', 'H1234', 'Internal Serial Number'),
          tag('EXIF', 'ExifIFD', 'ImageUniqueID', 'ab12cd', 'Image Unique ID'),
          tag('EXIF', 'ExifIFD', 'OwnerName', 'A. Photographer', 'Owner Name'),
          tag('EXIF', 'IFD0', 'Artist', 'Sam', 'Artist'),
          tag('XMP', 'XMP-mwg-rs', 'RegionName', 'Alice, Bob', 'Region Name'),
          tag('EXIF', 'IFD0', 'Software', '17.4', 'Software'),
          tag('XMP', 'XMP-xmpMM', 'DocumentID', 'xmp.did:0123', 'Document ID'),
        ],
        dates: noDates(),
      }),
      null,
    )
    expect(list.map((f) => [f.group, f.label])).toEqual([
      ['device', 'Serial Number'],
      ['device', 'Lens Serial Number'],
      ['device', 'Internal Serial Number'],
      ['device', 'Image Unique ID'],
      ['people', 'Owner Name'],
      ['people', 'Artist'],
      ['people', 'Region Name'],
      ['software', 'Software'],
      ['software', 'Document IDs and edit history'],
    ])
    // Document IDs and the history that links edited copies go together.
    expect(byId(list, 'history')!.args).toEqual(['-XMP-xmpMM:all='])
    // Maker notes can't lose one tag, only all of them.
    expect(byId(list, 'tag:InternalSerialNumber')!.args).toEqual(['-MakerNotes:all='])
  })

  it('quotes a Windows path with a user name in it', () => {
    const list = privacyFindings(
      fakeInfo({
        tags: [tag('XMP', 'XMP-photoshop', 'DocumentAncestors', 'C:\\Users\\sam\\Pictures\\shoot\\a.psd')],
        dates: noDates(),
        camera: null,
      }),
      null,
    )
    expect(list[0]).toMatchObject({ group: 'software', note: 'Contains the path C:\\Users\\sam\\…' })
  })

  it('shortens long values, keeping the full one for the tooltip', () => {
    const long = 'x'.repeat(200)
    const [only] = privacyFindings(
      fakeInfo({ tags: [tag('EXIF', 'IFD0', 'Artist', long)], dates: noDates(), camera: null }),
      null,
    )
    expect(only.value.length).toBeLessThanOrEqual(60)
    expect(only.value.endsWith('…')).toBe(true)
    expect(only.full).toBe(long)
  })

  it('lists dates taken, digitised and modified as one row each, in that order', () => {
    const list = privacyFindings(
      fakeInfo({
        tags: [
          // IFD0 comes first in a JPEG, so its date modified is read before the date taken.
          tag('EXIF', 'IFD0', 'ModifyDate', '2025:03:15 09:00:00'),
          tag('EXIF', 'ExifIFD', 'DateTimeOriginal', '2025:03:12 14:32:05'),
          tag('EXIF', 'ExifIFD', 'OffsetTimeOriginal', '+13:00'),
          tag('XMP', 'XMP-photoshop', 'DateCreated', '2025:03:12 14:32:05'),
          tag('EXIF', 'ExifIFD', 'CreateDate', '2025:03:12 14:32:05'),
          tag('ICC_Profile', 'ICC-header', 'ProfileDateTime', '2022:01:01 00:00:00'),
        ],
        camera: null,
      }),
      null,
    )
    expect(list.map((f) => [f.id, f.label, f.value])).toEqual([
      ['date:taken', 'Date taken', '12 March 2025 at 14:32 (UTC+13:00)'],
      ['date:digitised', 'Date digitised', '12 March 2025 at 14:32 (UTC+13:00)'],
      ['date:modified', 'Date modified', '12 March 2025 at 14:32 (UTC+13:00)'],
    ])
    expect(byId(list, 'date:taken')!.args).toEqual([
      '-ExifIFD:DateTimeOriginal=',
      '-ExifIFD:OffsetTimeOriginal=',
      '-XMP-photoshop:DateCreated=',
    ])
  })

  it('lists embedded thumbnails and previews, which may show the picture before it was cropped', () => {
    const list = privacyFindings(
      fakeInfo({
        tags: [],
        camera: null,
        dates: noDates(),
        embedded: [
          {
            id: 'EXIF:IFD1:ThumbnailImage',
            kind: 'thumbnail',
            label: 'EXIF thumbnail',
            size: 475,
            extension: 'jpg',
            isImage: true,
          },
          {
            id: 'icc-profile',
            kind: 'icc-profile',
            label: 'Colour profile',
            size: null,
            extension: 'icc',
            isImage: false,
          },
        ],
      }),
      null,
    )
    expect(list).toEqual([
      {
        id: 'embedded:EXIF:IFD1:ThumbnailImage',
        group: 'embedded',
        label: 'EXIF thumbnail',
        value: '475 B',
        full: '475 B',
        note: 'May show the picture before it was cropped.',
        args: ['-IFD1:all='],
      },
    ])
  })

  it('lists generation settings, apart from the rest of the PNG’s text', () => {
    const list = privacyFindings(
      fakeInfo({
        format: 'png',
        tags: [tag('PNG', 'PNG', 'Parameters', 'a lighthouse\nSteps: 20'), tag('PNG', 'PNG', 'Software', 'NovelAI')],
        camera: null,
        dates: noDates(),
        generators: [finding('AUTOMATIC1111', 'the PNG text chunk “parameters”', { prompt: 'a lighthouse' })],
      }),
      null,
    )
    expect(byId(list, 'generation')).toMatchObject({
      group: 'generation',
      label: 'AUTOMATIC1111',
      value: 'a lighthouse',
      args: ['-PNG:Parameters='],
    })
    expect(byId(list, 'tag:Software')).toBeTruthy()
  })

  it('reads ComfyUI’s graphs out of a WebP’s EXIF Make and Model', () => {
    const list = privacyFindings(
      fakeInfo({
        format: 'webp',
        tags: [tag('EXIF', 'IFD0', 'Make', 'workflow:{}'), tag('EXIF', 'IFD0', 'Model', 'prompt:{}')],
        camera: null,
        dates: noDates(),
        generators: [finding('ComfyUI', 'EXIF Model')],
      }),
      null,
    )
    expect(byId(list, 'generation')!.args).toEqual(['-IFD0:Make=', '-IFD0:Model='])
  })

  it('leaves stealth metadata out: it lives in the pixels', () => {
    const list = privacyFindings(
      fakeInfo({
        format: 'png',
        tags: [],
        camera: null,
        dates: noDates(),
        generators: [finding('NovelAI', 'the lowest bits of the alpha channel')],
      }),
      null,
    )
    expect(list).toEqual([])
  })

  it('lists Content Credentials with who signed them', () => {
    const list = privacyFindings(
      fakeInfo({ tags: [tag('JUMBF', 'JUMBF', 'JUMDLabel', 'c2pa')], camera: null, dates: noDates() }),
      { signer: 'OpenAI' } as never,
    )
    expect(list).toEqual([
      {
        id: 'credentials',
        group: 'credentials',
        label: 'Content Credentials',
        value: 'Signed by OpenAI',
        full: 'Signed by OpenAI',
        note: 'Can name a person or an account.',
        args: ['-JUMBF:all='],
      },
    ])
  })
})

describe('privacyFindings: hidden data', () => {
  const trailer = { offset: 709, length: 149, looksLike: 'zip' as const }

  it('lists data after the end of the picture last, to be cut out by Loupe rather than removed by ExifTool', () => {
    const list = privacyFindings(
      fakeInfo({ tags: [tag('EXIF', 'IFD0', 'Artist', 'Sam')], dates: noDates(), trailer }),
      null,
    )
    expect(list.at(-1)).toEqual({
      id: 'hidden',
      group: 'hidden',
      label: 'Data after the end of the picture',
      value: '149 B',
      full: '149 B of data after the end of the picture. It starts like a ZIP archive.',
      note: 'It starts like a ZIP archive.',
      args: [],
      cut: { offset: 709, length: 149 },
    })
    expect(removalArgs(list, ['hidden'], 'jpeg')).toEqual([])
  })

  it('says when it’s still there after the job', () => {
    const before = fakeInfo({ tags: [], camera: null, dates: noDates(), trailer })
    expect(leftAfter(['hidden'], before, before)).toEqual([
      'Data after the end of the picture: it’s still in the result.',
    ])
  })
})

describe('privacyFindings: a Motion Photo video’s own location (SPEC.md 6.4)', () => {
  const boxes = [{ offset: 5000, length: 30 }]
  const motion = {
    offset: 4000,
    length: 2233,
    duration: 1,
    location: { lat: -44.9405, lon: 168.8263, boxes },
    box: null,
  }
  const info = fakeInfo({ kinds: ['motion-photo'], motion, dates: noDates(), camera: null, tags: [] })

  it('lists it under Location, to be blanked inside the video by Loupe', () => {
    expect(privacyFindings(info, null)).toEqual([
      {
        id: 'motion-location',
        group: 'location',
        label: 'Motion Photo video’s location',
        value: '-44.94050, 168.82630',
        full: '-44.94050, 168.82630',
        note: 'Removing it blanks the location inside the video, which plays as before.',
        args: [],
        blank: boxes,
      },
    ])
  })

  it('isn’t listed when the video records no location', () => {
    expect(privacyFindings({ ...info, motion: { ...motion, location: null } }, null)).toEqual([])
  })

  it('leaves ExifTool’s arguments to the metadata findings', () => {
    const both = privacyFindings({ ...info, gps, tags: GPS.slice(0, 2) }, null)
    expect(removalArgs(both, ['gps', 'motion-location'], 'jpeg')).toEqual(EVERYTHING_ARGS)
    expect(removalArgs(both, ['motion-location'], 'jpeg')).toEqual([])
  })
})

describe('removalArgs', () => {
  const list = () =>
    privacyFindings(
      fakeInfo({
        tags: [...GPS, tag('EXIF', 'IFD0', 'Artist', 'Sam'), tag('MakerNotes', 'Nikon', 'SerialNumber', '123')],
        gps,
        dates: noDates(),
        camera: null,
      }),
      null,
    )

  it('removes everything but the colour profile and the orientation when every finding is ticked', () => {
    const all = list()
    expect(
      removalArgs(
        all,
        all.map((f) => f.id),
        'jpeg',
      ),
    ).toEqual(EVERYTHING_ARGS)
    expect(EVERYTHING_ARGS).toEqual(['-all=', '-tagsFromFile', '@', '-ICC_Profile', '-Orientation'])
  })

  it('removes nothing when nothing is found', () => {
    expect(removalArgs([], [], 'jpeg')).toEqual([])
  })

  it('removes only what is ticked, once each', () => {
    expect(removalArgs(list(), ['gps', 'tag:Artist'], 'jpeg')).toEqual([
      '-GPS:GPSLatitude=',
      '-GPS:GPSLongitude=',
      '-IFD0:Artist=',
    ])
  })

  it('never wipes a raw or TIFF file: its maker notes are needed to develop it', () => {
    const all = list()
    expect(
      removalArgs(
        all,
        all.map((f) => f.id),
        'raw',
      ),
    ).toEqual(['-GPS:GPSLatitude=', '-GPS:GPSLongitude=', '-IFD0:Artist=', '-GPS:GPSDateStamp=', '-GPS:GPSTimeStamp='])
  })
})

describe('leftAfter', () => {
  it('says nothing is left when the result has none of what was ticked', () => {
    const after = fakeInfo({ tags: [], camera: null, dates: noDates() })
    expect(leftAfter(['gps'], fakeInfo({ tags: GPS, gps }), after)).toEqual([])
  })

  it('names what is left and why', () => {
    const before = fakeInfo({
      format: 'raw',
      formatName: 'NEF',
      tags: [tag('MakerNotes', 'Nikon', 'SerialNumber', '123', 'Serial Number'), tag('EXIF', 'IFD0', 'Artist', 'Sam')],
      dates: noDates(),
      camera: null,
    })
    expect(leftAfter(['tag:SerialNumber', 'tag:Artist'], before, before)).toEqual([
      'Serial Number: kept in the camera’s maker notes, which a raw file needs to be developed.',
      'Artist: ExifTool couldn’t remove it from this NEF file.',
    ])
  })

  it('says stealth metadata stays in the pixels', () => {
    const before = fakeInfo({
      format: 'png',
      tags: [],
      camera: null,
      dates: noDates(),
      generators: [finding('NovelAI', 'the lowest bits of the alpha channel')],
    })
    expect(leftAfter([], before, before)).toEqual([
      'NovelAI’s settings in the picture’s pixels: removing them would change the picture.',
    ])
  })
})

function noDates() {
  return { taken: null, digitised: null, modified: null, gpsUtc: null }
}
