import { describe, expect, it } from 'vitest'
import type { Tag } from '../info'
import { fakeInfo } from '../testing'
import { changedFields, destinations, fieldsOf, notWritten, OFFSETS, pinOf, planEditMetadata } from './edit-metadata'

const tag = (family: string, group: string, name: string, value: string): Tag => ({
  family,
  group,
  name,
  label: name,
  value,
})
const GPS = { lat: -44.9405, lon: 168.8263, altitude: 312, direction: null, speed: null, accuracy: null }

/** A phone photo with a caption and keywords in EXIF, IPTC and XMP, a place name and a location. */
const info = fakeInfo({
  name: 'IMG_0001.JPG',
  gps: GPS,
  tags: [
    tag('EXIF', 'IFD0', 'ImageDescription', 'Lake Hayes'),
    tag('EXIF', 'IFD0', 'Artist', 'Sam'),
    tag('EXIF', 'GPS', 'GPSLatitude', '44 deg 56\' 25.80"'),
    tag('EXIF', 'GPS', 'GPSAltitude', '312 m'),
    tag('IPTC', 'IPTC', 'ObjectName', 'Morning'),
    tag('IPTC', 'IPTC', 'Keywords', 'lake, autumn'),
    tag('IPTC', 'IPTC', 'City', 'Arrowtown'),
    tag('XMP', 'XMP-dc', 'Title', 'Morning'),
    tag('XMP', 'XMP-dc', 'Rights', '© Sam'),
    tag('XMP', 'XMP-dc', 'Subject', 'lake, autumn'),
  ],
})
const start = fieldsOf(info)

describe('fieldsOf', () => {
  it('starts each field with the file’s value', () => {
    expect(start).toEqual({
      date: '2025-03-12T14:32:05',
      offset: '+13:00',
      title: 'Morning',
      caption: 'Lake Hayes',
      creator: 'Sam',
      copyright: '© Sam',
      keywords: 'lake, autumn',
      location: 'keep',
      lat: '-44.940500',
      lon: '168.826300',
    })
  })

  it('leaves empty what the file doesn’t have, and ignores blank values', () => {
    const bare = fakeInfo({
      dates: { taken: null, digitised: null, modified: null, gpsUtc: null },
      tags: [tag('EXIF', 'IFD0', 'ImageDescription', '          ')],
    })
    expect(fieldsOf(bare)).toMatchObject({ date: '', offset: '', title: '', caption: '', lat: '', lon: '' })
  })

  it('reads XMP where EXIF has nothing, as a GIF holds it', () => {
    const gif = fakeInfo({
      format: 'gif',
      tags: [tag('XMP', 'XMP-dc', 'Description', 'A loop'), tag('XMP', 'XMP-dc', 'Creator', 'Jo')],
    })
    expect(fieldsOf(gif)).toMatchObject({ caption: 'A loop', creator: 'Jo' })
  })
})

describe('changedFields', () => {
  it('finds nothing changed in the file’s own values', () => {
    expect(changedFields(info, start)).toEqual([])
  })

  it('ignores spaces at the ends and how keywords are spaced', () => {
    expect(changedFields(info, { ...start, title: ' Morning ', keywords: 'lake,autumn,' })).toEqual([])
  })

  it('counts a date without seconds as the same minute’s', () => {
    const minute = fakeInfo({ dates: { ...info.dates, taken: { local: '2025-03-12T14:32:00', offset: null } } })
    expect(changedFields(minute, { ...fieldsOf(minute), date: '2025-03-12T14:32' })).toEqual([])
  })

  it('names each field that changed, the time zone with the date', () => {
    expect(changedFields(info, { ...start, offset: '+12:00', caption: 'Lake Hayes at dawn' })).toEqual([
      'date',
      'caption',
    ])
  })

  it('counts Remove only when there’s a location to remove', () => {
    expect(changedFields(info, { ...start, location: 'remove' })).toEqual(['location'])
    const nowhere = fakeInfo({ gps: null, tags: [] })
    expect(changedFields(nowhere, { ...fieldsOf(nowhere), location: 'remove' })).toEqual([])
  })

  it('counts Set as a change', () => {
    expect(changedFields(info, { ...start, location: 'set' })).toEqual(['location'])
  })
})

describe('planEditMetadata', () => {
  it('writes only what changed, with the MWG tags, into a copy named “(edited)”', () => {
    const planned = planEditMetadata(info, { ...start, caption: 'Lake Hayes at dawn' })
    expect(planned.problems).toEqual([])
    expect(planned.plan).toEqual({
      kind: 'metadata',
      name: 'IMG_0001 (edited).jpg',
      type: 'image/jpeg',
      exifName: 'image.jpg',
      args: ['-use', 'MWG', '-IPTC:CodedCharacterSet=UTF8', '-MWG:Description=Lake Hayes at dawn'],
      readBack: true,
    })
    expect(planned.caption).toBe('Only the metadata changes; the picture’s bytes are copied as they are.')
  })

  it('writes the date with its time zone, or without one when it’s not known', () => {
    const args = (date: string, offset: string) => planEditMetadata(info, { ...start, date, offset }).plan!.args
    expect(args('2024-01-02T03:04:05', '+05:30')).toContain('-MWG:DateTimeOriginal=2024:01:02 03:04:05+05:30')
    expect(args('2024-01-02T03:04', '')).toContain('-MWG:DateTimeOriginal=2024:01:02 03:04:00')
    expect(args('', '')).toContain('-MWG:DateTimeOriginal=')
  })

  it('writes a raw file’s own date too, where the reader looks first', () => {
    const crw = fakeInfo({
      name: 'CRW_0001.CRW',
      format: 'raw',
      formatName: 'CRW',
      tags: [tag('MakerNotes', 'CanonRaw', 'DateTimeOriginal', '2003:11:10 17:39:26')],
    })
    expect(planEditMetadata(crw, { ...fieldsOf(crw), date: '2024-01-02T03:04:05' }).plan!.args).toEqual([
      '-use',
      'MWG',
      '-MWG:DateTimeOriginal=2024:01:02 03:04:05+13:00',
      '-CanonRaw:DateTimeOriginal=2024:01:02 03:04:05',
    ])
  })

  it('writes the title to XMP, and to IPTC when the file has IPTC', () => {
    expect(planEditMetadata(info, { ...start, title: 'Dawn' }).plan!.args).toEqual([
      '-use',
      'MWG',
      '-IPTC:CodedCharacterSet=UTF8',
      '-XMP-dc:Title=Dawn',
      '-IPTC:ObjectName=Dawn',
    ])
    const plain = fakeInfo({ tags: [] })
    expect(planEditMetadata(plain, { ...fieldsOf(plain), title: 'Dawn' }).plan!.args).toEqual([
      '-use',
      'MWG',
      '-XMP-dc:Title=Dawn',
    ])
  })

  it('writes creator and copyright, and clears a field left empty', () => {
    expect(planEditMetadata(info, { ...start, creator: 'Jo Bloggs', copyright: ' ' }).plan!.args).toEqual([
      '-use',
      'MWG',
      '-IPTC:CodedCharacterSet=UTF8',
      '-MWG:Creator=Jo Bloggs',
      '-MWG:Copyright=',
    ])
  })

  it('writes each keyword, or clears them all', () => {
    const args = (keywords: string) => planEditMetadata(info, { ...start, keywords }).plan!.args.slice(3)
    expect(args('lake, autumn, Otago')).toEqual(['-MWG:Keywords=lake', '-MWG:Keywords=autumn', '-MWG:Keywords=Otago'])
    expect(args('')).toEqual(['-MWG:Keywords='])
  })

  it('removes the location as Privacy does: the position and the place names', () => {
    expect(planEditMetadata(info, { ...start, location: 'remove' }).plan!.args).toEqual([
      '-use',
      'MWG',
      '-GPS:GPSLatitude=',
      '-GPS:GPSAltitude=',
      '-IPTC:City=',
    ])
  })

  it('sets a new location in place of the old one', () => {
    expect(planEditMetadata(info, { ...start, location: 'set', lat: '−45.0312', lon: ' 168.6626' }).plan!.args).toEqual(
      ['-use', 'MWG', '-GPS:GPSLatitude=', '-GPS:GPSAltitude=', '-IPTC:City=', '-GPSPosition=-45.0312, 168.6626'],
    )
  })

  it('needs a change', () => {
    expect(planEditMetadata(info, start)).toMatchObject({ plan: null, problems: ['Change a field to save.'] })
  })

  it('needs a whole date and time', () => {
    expect(planEditMetadata(info, { ...start, date: 'invalid' }).problems).toEqual([
      'Date taken isn’t a whole date and time.',
    ])
    expect(planEditMetadata(info, { ...start, date: '2025-02-30T10:00' }).problems).toEqual([
      'Date taken isn’t a whole date and time.',
    ])
  })

  it('needs a latitude and longitude on the globe', () => {
    const set = (lat: string, lon: string) => planEditMetadata(info, { ...start, location: 'set', lat, lon }).problems
    expect(set('', '')).toEqual(['Place the pin on the map, or type a latitude and longitude.'])
    expect(set('91', '0')).toEqual(['Latitude must be a number from −90 to 90.'])
    expect(set('0', '-180.5')).toEqual(['Longitude must be a number from −180 to 180.'])
    expect(set('north', '')).toEqual([
      'Latitude must be a number from −90 to 90.',
      'Longitude must be a number from −180 to 180.',
    ])
  })

  it('can’t write a format ExifTool can’t write', () => {
    const bmp = fakeInfo({ format: 'bmp', formatName: 'BMP', tags: [] })
    expect(planEditMetadata(bmp, { ...fieldsOf(bmp), title: 'Dawn' })).toEqual({
      plan: null,
      problems: ['Loupe can’t change metadata in a BMP file.'],
      caption: null,
    })
  })
})

describe('destinations', () => {
  it('says each field goes to EXIF, IPTC and XMP where the file takes them', () => {
    expect(destinations(info)).toEqual({
      date: 'Written to EXIF, IPTC and XMP.',
      title: 'Written to IPTC and XMP.',
      caption: 'Written to EXIF, IPTC and XMP.',
      creator: 'Written to EXIF, IPTC and XMP.',
      copyright: 'Written to EXIF, IPTC and XMP.',
      keywords: 'Written to IPTC and XMP.',
      location: 'Written to EXIF.',
    })
  })

  it('leaves out IPTC when the file has none, as MWG does', () => {
    expect(destinations(fakeInfo({ tags: [] }))).toMatchObject({
      caption: 'Written to EXIF and XMP.',
      title: 'Written to XMP.',
    })
  })

  it('writes only XMP where there’s no EXIF: GIF and Canon’s CRW', () => {
    for (const file of [
      fakeInfo({ format: 'gif', tags: [] }),
      fakeInfo({ name: 'a.crw', format: 'raw', formatName: 'CRW', tags: [] }),
    ])
      expect(destinations(file)).toMatchObject({ caption: 'Written to XMP.', location: 'Written to XMP.' })
  })
})

describe('notWritten', () => {
  it('names each changed field the result doesn’t hold', () => {
    const asked = { ...start, title: 'Dawn', date: '2024-01-02T03:04:05', location: 'set' as const, lat: '1', lon: '2' }
    const after = fakeInfo({
      gps: { ...GPS, lat: 1, lon: 2.0000004 },
      dates: { ...info.dates, taken: { local: '2024-01-02T03:04:05', offset: null } },
      tags: [tag('XMP', 'XMP-dc', 'Title', 'Morning')],
    })
    expect(notWritten(info, asked, after)).toEqual([
      'Date taken: the time zone couldn’t be written to this JPEG file.',
      'Title: ExifTool couldn’t write it to this JPEG file.',
    ])
  })

  it('says nothing when every change took', () => {
    expect(
      notWritten(
        info,
        { ...start, caption: 'Dawn' },
        { ...info, tags: [tag('EXIF', 'IFD0', 'ImageDescription', 'Dawn')] },
      ),
    ).toEqual([])
  })

  it('checks a removed location is gone', () => {
    expect(notWritten(info, { ...start, location: 'remove' }, info)).toEqual([
      'Location: ExifTool couldn’t write it to this JPEG file.',
    ])
  })
})

describe('OFFSETS', () => {
  it('runs from UTC−12:00 to UTC+14:00 with the half and quarter hours in use', () => {
    expect(OFFSETS[0]).toBe('-12:00')
    expect(OFFSETS.at(-1)).toBe('+14:00')
    expect(OFFSETS).toContain('+05:45')
    expect(OFFSETS).toContain('+13:00')
    expect(OFFSETS).toContain('-03:30')
  })
})

describe('pinOf', () => {
  it('puts the pin where the typed coordinates are, while Location is Set', () => {
    expect(pinOf({ ...start, location: 'set', lat: '−45.5', lon: '170' })).toEqual({ lat: -45.5, lon: 170 })
  })

  it('has no pin while Location isn’t Set or the coordinates aren’t on the globe', () => {
    expect(pinOf(start)).toBe(null)
    expect(pinOf({ ...start, location: 'set', lat: '', lon: '' })).toBe(null)
    expect(pinOf({ ...start, location: 'set', lat: '95', lon: '0' })).toBe(null)
  })
})
