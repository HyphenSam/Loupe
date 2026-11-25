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
})
