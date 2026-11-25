import { describe, expect, it } from 'vitest'
import type { Gps, Tag } from './info'
import { locationView } from './location'
import { fakeCamera, fakeInfo } from './testing'

const gps = (over: Partial<Gps> = {}): Gps => ({
  lat: -44.9405,
  lon: 168.8263,
  altitude: 312,
  direction: { degrees: 312, ref: 'true' },
  speed: null,
  accuracy: 5,
  ...over,
})

const arrowtown = {
  type: 'town' as const,
  name: 'Arrowtown',
  region: 'Otago',
  country: 'New Zealand',
  km: 1.3,
  bearing: 120,
}

describe('locationView', () => {
  it('is nothing without GPS', () => {
    expect(locationView(fakeInfo({ gps: null }))).toBeNull()
  })

  it('gives the place, the coordinates both ways, altitude and accuracy', () => {
    const view = locationView(fakeInfo({ gps: gps(), place: arrowtown }))!
    expect(view.place).toBe('Arrowtown, Otago, New Zealand')
    expect(view.decimal).toBe('-44.940500, 168.826300')
    expect(view.dms).toBe('44°56′25.8″ S, 168°49′34.7″ E')
    expect(view.rows).toEqual([
      { label: 'Altitude', value: '312 m above sea level' },
      { label: 'Accuracy', value: 'Within 5 m' },
    ])
  })

  it('has no place when the places data couldn’t be read', () => {
    expect(locationView(fakeInfo({ gps: gps(), place: null }))!.place).toBeNull()
  })

  it('words altitude below sea level, and speed only when moving', () => {
    const rows = (g: Partial<Gps>) => locationView(fakeInfo({ gps: gps({ accuracy: null, ...g }) }))!.rows
    expect(rows({ altitude: -12.4 })).toEqual([{ label: 'Altitude', value: '12 m below sea level' }])
    expect(rows({ altitude: 0.2 })).toEqual([{ label: 'Altitude', value: 'At sea level' }])
    expect(rows({ altitude: null, speed: 0 })).toEqual([])
    expect(rows({ altitude: null, speed: 3.24 })).toEqual([{ label: 'Speed', value: '3.2 km/h' }])
    expect(rows({ altitude: null, speed: 87.6 })).toEqual([{ label: 'Speed', value: '88 km/h' }])
  })

  it('says which way the camera faced, and against which north', () => {
    expect(locationView(fakeInfo({ gps: gps() }))!.direction).toBe('Facing north-west (312°, true north)')
    expect(locationView(fakeInfo({ gps: gps({ direction: { degrees: 90.4, ref: 'magnetic' } }) }))!.direction).toBe(
      'Facing east (90°, magnetic north)',
    )
    expect(locationView(fakeInfo({ gps: gps({ direction: null }) }))!.direction).toBeNull()
  })

  it('gives the field of view from the 35 mm focal length, wider across a landscape picture', () => {
    const view = (over: Parameters<typeof fakeInfo>[0]) => locationView(fakeInfo({ gps: gps(), ...over }))!
    expect(view({ camera: fakeCamera({ focal35: 50 }) }).fieldOfView).toBeCloseTo(39.6, 1)
    expect(
      view({ camera: fakeCamera({ focal35: 50 }), displayWidth: 3024, displayHeight: 4032 }).fieldOfView,
    ).toBeCloseTo(27, 1)
    expect(view({ camera: fakeCamera({ focal35: null }) }).fieldOfView).toBeNull()
    expect(view({ camera: null }).fieldOfView).toBeNull()
  })

  it('works out the sun from the time taken with its offset, and says which time it used', () => {
    const view = locationView(fakeInfo({ gps: gps() }))!
    expect(view.sun.words).toBe('The sun was 48° above the horizon, to the north (346°).')
    expect(view.sun.caption).toBe('Worked out for the time taken, 12 March 2025 at 14:32 (UTC+13:00).')
    expect(view.sun.azimuth).toBeCloseTo(346, 0)
  })

  it('says why there’s no sun without a UTC time', () => {
    const dates = {
      taken: { local: '2025-03-12T14:32:05', offset: null },
      digitised: null,
      modified: null,
      gpsUtc: null,
    }
    const view = locationView(fakeInfo({ gps: gps(), dates }))!
    expect(view.sun).toEqual({
      words: 'The time zone isn’t recorded, so the sun’s position can’t be worked out.',
      caption: null,
      azimuth: null,
    })
  })

  it('links to the point on OpenStreetMap and Google Maps', () => {
    expect(locationView(fakeInfo({ gps: gps() }))!.links.osm).toContain('mlat=-44.940500&mlon=168.826300')
  })

  it('lists the other location fields in the metadata, once for each value, saying where each is', () => {
    const tag = (family: string, group: string, name: string, label: string, value: string): Tag => ({
      family,
      group,
      name,
      label,
      value,
    })
    const tags = [
      tag('IPTC', 'IPTC', 'City', 'City', 'Queenstown'),
      tag('XMP', 'XMP-photoshop', 'City', 'City', 'Queenstown'),
      tag('IPTC', 'IPTC', 'Province-State', 'Province-State', 'Otago'),
      tag('XMP', 'XMP-iptcCore', 'Location', 'Location', 'Lake Wakatipu'),
      tag('XMP', 'XMP-iptcExt', 'LocationShownCountryName', 'Location Shown Country Name', 'New Zealand'),
      tag('XMP', 'XMP-photoshop', 'Country', 'Country', 'New Zealand'),
      tag('EXIF', 'IFD0', 'Make', 'Make', 'Apple'),
      tag('XMP', 'XMP-dc', 'Title', 'Title', 'City'),
    ]
    expect(locationView(fakeInfo({ gps: gps(), tags }))!.also).toEqual([
      { label: 'City', value: 'Queenstown', note: 'IPTC, XMP' },
      { label: 'Province-State', value: 'Otago', note: 'IPTC' },
      { label: 'Location', value: 'Lake Wakatipu', note: 'XMP' },
      { label: 'Location Shown Country Name', value: 'New Zealand', note: 'XMP' },
      { label: 'Country', value: 'New Zealand', note: 'XMP' },
    ])
  })
})
