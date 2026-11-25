import { describe, expect, it } from 'vitest'
import { bearing, compass, cone, decimal, destination, distanceKm, dms, fieldOfView, mapLinks } from './geo'

const ARROWTOWN = { lat: -44.93837, lon: 168.81007 }
const QUEENSTOWN = { lat: -45.03023, lon: 168.66271 }

describe('distanceKm', () => {
  it('is zero to the same point', () => {
    expect(distanceKm(ARROWTOWN, ARROWTOWN)).toBe(0)
  })

  it('measures along the globe', () => {
    // Arrowtown to Queenstown is about 15 km as the crow flies.
    expect(distanceKm(ARROWTOWN, QUEENSTOWN)).toBeCloseTo(15.2, 0)
    // London to Paris, about 344 km.
    expect(distanceKm({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 })).toBeCloseTo(344, -1)
  })

  it('takes the short way across the antimeridian', () => {
    expect(distanceKm({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 })).toBeCloseTo(22.2, 0)
  })

  it('works at the poles, where every longitude meets', () => {
    expect(distanceKm({ lat: 90, lon: 0 }, { lat: 90, lon: 120 })).toBeCloseTo(0, 6)
    expect(distanceKm({ lat: -89.9, lon: 0 }, { lat: -89.9, lon: 180 })).toBeCloseTo(22.2, 0)
  })
})

describe('bearing', () => {
  it('gives the compass direction from one point to another, clockwise from true north', () => {
    expect(bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6)
    expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6)
    expect(bearing({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 6)
    expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 6)
  })

  it('heads east across the antimeridian rather than the long way round', () => {
    expect(bearing({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 })).toBeCloseTo(90, 3)
  })

  it('is always between 0 and 360', () => {
    expect(bearing(QUEENSTOWN, ARROWTOWN)).toBeGreaterThan(0)
    expect(bearing(QUEENSTOWN, ARROWTOWN)).toBeLessThan(90)
  })
})

describe('compass', () => {
  it('names the eight directions', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compass)).toEqual([
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
      'north-west',
    ])
  })

  it('rounds to the nearest, wrapping past 360', () => {
    expect(compass(22.4)).toBe('north')
    expect(compass(22.5)).toBe('north-east')
    expect(compass(337.5)).toBe('north')
    expect(compass(359.9)).toBe('north')
    expect(compass(360)).toBe('north')
    expect(compass(-45)).toBe('north-west')
    expect(compass(312)).toBe('north-west')
  })
})

describe('decimal', () => {
  it('gives six places with a sign, as maps take them pasted', () => {
    expect(decimal(-44.9405, 168.8263)).toBe('-44.940500, 168.826300')
    expect(decimal(51.5, -0.1278)).toBe('51.500000, -0.127800')
  })
})

describe('dms', () => {
  it('gives degrees, minutes and seconds with the hemisphere', () => {
    expect(dms(-44.9405, 168.8263)).toBe('44°56′25.8″ S, 168°49′34.7″ E')
    expect(dms(51.5, -0.1278)).toBe('51°30′00.0″ N, 0°07′40.1″ W')
  })

  it('carries rounded seconds into the minute and the minute into the degree', () => {
    // 10.999999° is 10°59′59.9996″, which rounds to 11°00′00.0″.
    expect(dms(10.999999, 0)).toBe('11°00′00.0″ N, 0°00′00.0″ E')
  })

  it('names the equator north and the prime meridian east', () => {
    expect(dms(0, 0)).toBe('0°00′00.0″ N, 0°00′00.0″ E')
  })
})

describe('destination', () => {
  it('goes the given distance along a bearing', () => {
    const north = destination({ lat: 0, lon: 0 }, 0, 111_195)
    expect(north.lat).toBeCloseTo(1, 3)
    expect(north.lon).toBeCloseTo(0, 6)
    const there = destination(ARROWTOWN, 45, 1000)
    expect(distanceKm(ARROWTOWN, there)).toBeCloseTo(1, 4)
    expect(bearing(ARROWTOWN, there)).toBeCloseTo(45, 2)
  })

  it('keeps longitude between -180 and 180 across the antimeridian', () => {
    expect(destination({ lat: 0, lon: 179.99 }, 90, 5000).lon).toBeCloseTo(-179.965, 3)
  })
})

describe('fieldOfView', () => {
  it('is the horizontal angle of a 35 mm frame: 36 mm wide in landscape, 24 mm in portrait', () => {
    expect(fieldOfView(50, true)).toBeCloseTo(39.6, 1)
    expect(fieldOfView(50, false)).toBeCloseTo(27.0, 1)
    expect(fieldOfView(26, true)).toBeCloseTo(69.4, 1)
  })
})

describe('cone', () => {
  it('starts at the camera and sweeps an arc either side of the direction, at the given length', () => {
    const points = cone(ARROWTOWN, 312, 60, 300, 6)
    expect(points[0]).toEqual(ARROWTOWN)
    expect(points).toHaveLength(8)
    const arc = points.slice(1)
    for (const p of arc) expect(distanceKm(ARROWTOWN, p) * 1000).toBeCloseTo(300, 3)
    expect(bearing(ARROWTOWN, arc[0])).toBeCloseTo(282, 1)
    expect(bearing(ARROWTOWN, arc.at(-1)!)).toBeCloseTo(342, 1)
  })

  it('wraps the arc through north', () => {
    const arc = cone({ lat: 0, lon: 0 }, 10, 40, 300, 2).slice(1)
    expect(bearing({ lat: 0, lon: 0 }, arc[0])).toBeCloseTo(350, 1)
    expect(bearing({ lat: 0, lon: 0 }, arc[2])).toBeCloseTo(30, 1)
  })
})

describe('mapLinks', () => {
  it('opens OpenStreetMap and Google Maps at the point', () => {
    expect(mapLinks(-44.9405, 168.8263)).toEqual({
      osm: 'https://www.openstreetmap.org/?mlat=-44.940500&mlon=168.826300#map=16/-44.940500/168.826300',
      google: 'https://www.google.com/maps/search/?api=1&query=-44.940500%2C168.826300',
    })
  })
})
