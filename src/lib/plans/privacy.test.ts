import { describe, expect, it } from 'vitest'
import { EVERYTHING_ARGS, privacyFindings } from '../privacy'
import { fakeInfo } from '../testing'
import { planPrivacy, quickPick } from './privacy'

const info = fakeInfo({
  name: 'IMG_0001.JPG',
  tags: [
    { family: 'EXIF', group: 'GPS', name: 'GPSLatitude', label: 'GPS Latitude', value: '44 deg S' },
    { family: 'EXIF', group: 'IFD0', name: 'Artist', label: 'Artist', value: 'Sam' },
  ],
  dates: { taken: null, digitised: null, modified: null, gpsUtc: null },
})
const findings = privacyFindings(info, null)

describe('quickPick', () => {
  it('ticks everything, or only what gives the location away', () => {
    expect(quickPick(findings, 'everything')).toEqual(['gps', 'tag:Artist'])
    expect(quickPick(findings, 'location')).toEqual(['gps'])
  })
})

describe('planPrivacy: hidden data', () => {
  const hidden = { ...info, trailer: { offset: 709, length: 149, looksLike: 'zip' as const } }
  const list = privacyFindings(hidden, null)

  it('cuts it out on its own, without running ExifTool', () => {
    expect(planPrivacy(hidden, list, ['hidden'])).toMatchObject({
      problems: [],
      plan: { args: [], cut: [{ offset: 709, length: 149 }] },
    })
  })

  it('cuts it out with everything else', () => {
    expect(planPrivacy(hidden, list, quickPick(list, 'everything')).plan).toMatchObject({
      args: EVERYTHING_ARGS,
      cut: [{ offset: 709, length: 149 }],
    })
  })

  it('leaves it when it isn’t ticked', () => {
    expect(planPrivacy(hidden, list, ['gps']).plan).not.toHaveProperty('cut')
  })
})

describe('planPrivacy: Samsung Gallery’s edit data', () => {
  const samsung = {
    offset: 858,
    length: 5000,
    blocks: [{ type: 0x0ba1, name: 'PhotoEditor_Re_Edit_Data', offset: 900, length: 10 }],
  }
  const edited = { ...info, trailer: { offset: 709, length: 149, looksLike: 'zip' as const }, samsung }
  const list = privacyFindings(edited, null)

  it('cuts Samsung’s trailer out, and the hidden data before it when that’s ticked too', () => {
    expect(planPrivacy(edited, list, ['samsung-edits']).plan).toMatchObject({
      args: [],
      cut: [{ offset: 858, length: 5000 }],
    })
    expect(planPrivacy(edited, list, ['hidden', 'samsung-edits']).plan).toMatchObject({
      args: [],
      cut: [
        { offset: 709, length: 149 },
        { offset: 858, length: 5000 },
      ],
    })
  })
})

describe('planPrivacy: a Motion Photo video’s location', () => {
  const blank = [{ offset: 5000, length: 30 }]
  const motion = {
    offset: 4000,
    length: 2233,
    duration: 1,
    location: { lat: -44.9405, lon: 168.8263, boxes: blank },
    box: null,
  }
  const photo = { ...info, kinds: ['motion-photo' as const], motion }
  const list = privacyFindings(photo, null)

  it('blanks it on its own, without running ExifTool', () => {
    expect(planPrivacy(photo, list, ['motion-location'])).toMatchObject({ problems: [], plan: { args: [], blank } })
  })

  it('blanks it with the picture’s GPS on Location only', () => {
    expect(planPrivacy(photo, list, quickPick(list, 'location')).plan).toMatchObject({
      args: ['-GPS:GPSLatitude='],
      blank,
    })
  })

  it('leaves it when it isn’t ticked', () => {
    expect(planPrivacy(photo, list, ['gps']).plan).not.toHaveProperty('blank')
  })

  it('says the video goes when everything is removed', () => {
    expect(planPrivacy(photo, list, quickPick(list, 'everything')).caption).toBe(
      'Only metadata is removed; the picture’s bytes are copied as they are. The Motion Photo’s video is removed too.',
    )
    expect(planPrivacy(photo, list, quickPick(list, 'location')).caption).not.toContain('video')
  })

  it('says nothing of the video in a HEIC file’s mpvd box, which ExifTool keeps', () => {
    const heic = { ...photo, name: 'photo.heic', format: 'heic' as const, motion: { ...motion, box: 'mpvd' as const } }
    expect(planPrivacy(heic, list, quickPick(list, 'everything')).caption).not.toContain('video')
  })

  it('says the video goes from Samsung’s sefd box, which ExifTool takes for Samsung’s trailer', () => {
    const heic = { ...photo, name: 'photo.heic', format: 'heic' as const, motion: { ...motion, box: 'sefd' as const } }
    expect(planPrivacy(heic, list, quickPick(list, 'everything')).caption).toContain(
      'The Motion Photo’s video is removed too.',
    )
  })
})

describe('planPrivacy', () => {
  it('removes everything from a copy named “(cleaned)”, losslessly', () => {
    const planned = planPrivacy(info, findings, ['gps', 'tag:Artist'])
    expect(planned.problems).toEqual([])
    expect(planned.plan).toEqual({
      kind: 'metadata',
      name: 'IMG_0001 (cleaned).jpg',
      type: 'image/jpeg',
      exifName: 'image.jpg',
      args: EVERYTHING_ARGS,
      readBack: true,
    })
    expect(planned.caption).toBe('Only metadata is removed; the picture’s bytes are copied as they are.')
  })

  it('names the format from the bytes, not the name', () => {
    const misnamed = { ...info, name: 'photo.png' }
    expect(planPrivacy(misnamed, findings, ['gps']).plan).toMatchObject({
      name: 'photo (cleaned).jpg',
      exifName: 'image.jpg',
      args: ['-GPS:GPSLatitude='],
    })
  })

  it('keeps a raw file’s own extension', () => {
    const nef = { ...info, name: 'DSC_0001.NEF', format: 'raw' as const, formatName: 'NEF' }
    expect(planPrivacy(nef, findings, ['gps']).plan).toMatchObject({
      name: 'DSC_0001 (cleaned).nef',
      type: 'image/x-nikon-nef',
      exifName: 'image.nef',
    })
  })

  it('says the gain map goes when everything is removed from Ultra HDR', () => {
    const hdr = { ...info, kinds: ['ultra-hdr' as const] }
    expect(planPrivacy(hdr, findings, ['gps', 'tag:Artist']).caption).toBe(
      'Only metadata is removed; the picture’s bytes are copied as they are. The HDR gain map is removed too.',
    )
    expect(planPrivacy(hdr, findings, ['gps']).caption).not.toContain('gain map')
  })

  it('needs something ticked', () => {
    expect(planPrivacy(info, findings, [])).toMatchObject({ plan: null, problems: ['Tick what to remove.'] })
  })

  it('has nothing to do when nothing is found', () => {
    expect(planPrivacy(info, [], [])).toEqual({ plan: null, problems: [], caption: null })
  })

  it('says when all that’s ticked is in a raw file’s maker notes', () => {
    const crw = {
      ...info,
      name: 'CRW_0001.CRW',
      format: 'raw' as const,
      formatName: 'CRW',
      tags: [{ family: 'MakerNotes', group: 'Canon', name: 'SerialNumber', label: 'Serial Number', value: '1' }],
    }
    const found = privacyFindings(crw, null)
    expect(planPrivacy(crw, found, ['tag:SerialNumber'])).toMatchObject({
      plan: null,
      problems: ['What’s ticked is in the camera’s maker notes, which a CRW file needs to be developed.'],
    })
  })

  it('can’t write a format ExifTool can’t write', () => {
    const bmp = { ...info, format: 'bmp' as const, formatName: 'BMP' }
    expect(planPrivacy(bmp, findings, ['gps'])).toMatchObject({
      plan: null,
      problems: ['Loupe can’t change metadata in a BMP file.'],
    })
  })

  it('can’t write a raw format ExifTool only reads', () => {
    const fff = { ...info, name: 'H5D.3FR', format: 'raw' as const, formatName: '3FR' }
    expect(planPrivacy(fff, findings, ['gps'])).toMatchObject({
      plan: null,
      problems: ['Loupe can’t change metadata in a 3FR file.'],
    })
  })
})
