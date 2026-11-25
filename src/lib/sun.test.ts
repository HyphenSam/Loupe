import { describe, expect, it } from 'vitest'
import type { Dates } from './info'
import { sunAt, sunCaption, sunWords, type Sun } from './sun'

const ARROWTOWN = { lat: -44.9405, lon: 168.8263 }
const none: Dates = { taken: null, digitised: null, modified: null, gpsUtc: null }

describe('sunAt', () => {
  it('uses the GPS time, which is always UTC', () => {
    const sun = sunAt(ARROWTOWN, { ...none, gpsUtc: '2025-03-12T01:32:05Z' })
    expect(sun?.time).toEqual({ from: 'gps', utc: '2025-03-12T01:32:05Z', words: '12 March 2025 at 01:32 (UTC)' })
  })

  it('prefers the GPS time to the time taken', () => {
    const dates: Dates = {
      ...none,
      taken: { local: '2025-03-12T09:00:00', offset: '+13:00' },
      gpsUtc: '2025-03-12T01:32:05Z',
    }
    expect(sunAt(ARROWTOWN, dates)?.time.from).toBe('gps')
  })

  it('otherwise uses the time taken with its UTC offset', () => {
    const sun = sunAt(ARROWTOWN, { ...none, taken: { local: '2025-03-12T14:32:05', offset: '+13:00' } })
    expect(sun?.time).toEqual({
      from: 'taken',
      utc: '2025-03-12T01:32:05Z',
      words: '12 March 2025 at 14:32 (UTC+13:00)',
    })
  })

  it('gives nothing without a UTC time: a time taken with no offset could be any zone', () => {
    expect(sunAt(ARROWTOWN, { ...none, taken: { local: '2025-03-12T14:32:05', offset: null } })).toBeNull()
    expect(sunAt(ARROWTOWN, none)).toBeNull()
  })

  it('puts the sun high in the north at midday in a southern summer, clockwise from true north', () => {
    // 14:32 NZDT on 12 March in Arrowtown: solar noon was about 13:55, when the sun stood 48° up (90° less
    // the latitude, 44.9°, plus the declination, -3°). Just past it, a little west of north.
    const sun = sunAt(ARROWTOWN, { ...none, gpsUtc: '2025-03-12T01:32:05Z' })!
    expect(sun.altitude).toBeGreaterThan(45)
    expect(sun.altitude).toBeLessThan(48.1)
    expect(sun.azimuth).toBeGreaterThan(340)
    expect(sun.azimuth).toBeLessThan(355)
  })

  it('puts the sun below the horizon at night', () => {
    // Midnight in London in winter.
    const sun = sunAt({ lat: 51.5, lon: -0.13 }, { ...none, gpsUtc: '2025-01-01T00:00:00Z' })!
    expect(sun.altitude).toBeLessThan(-50)
  })

  it('works at the poles and across the antimeridian', () => {
    // Midsummer at the South Pole: the sun circles about 23° up all day.
    const pole = sunAt({ lat: -90, lon: 0 }, { ...none, gpsUtc: '2025-12-21T12:00:00Z' })!
    expect(pole.altitude).toBeCloseTo(23.5, 0)
    // Noon in Fiji (UTC+12) on either side of 180°: the sun at much the same place.
    const west = sunAt({ lat: -16.8, lon: 179.99 }, { ...none, gpsUtc: '2025-06-01T00:00:00Z' })!
    const east = sunAt({ lat: -16.8, lon: -179.99 }, { ...none, gpsUtc: '2025-06-01T00:00:00Z' })!
    expect(Math.abs(west.altitude - east.altitude)).toBeLessThan(0.1)
    expect(west.altitude).toBeGreaterThan(45)
  })
})

describe('sunWords', () => {
  const at = (altitude: number, azimuth: number): Sun => ({
    altitude,
    azimuth,
    time: { from: 'gps', utc: '2025-03-12T01:32:05Z', words: '' },
  })

  it('says how high the sun was and which way, above the horizon', () => {
    expect(sunWords(at(23.4, 305.2))).toBe('The sun was 23° above the horizon, to the north-west (305°).')
    expect(sunWords(at(0.3, 271))).toBe('The sun was on the horizon, to the west (271°).')
    expect(sunWords(at(89.6, 359.7))).toBe('The sun was 90° above the horizon, to the north (0°).')
  })

  it('says twilight just after sunset, and night once the sun is more than 6° down', () => {
    expect(sunWords(at(-0.4, 250))).toBe('The sun was on the horizon, to the west (250°).')
    expect(sunWords(at(-3.2, 250))).toBe('The sun was 3° below the horizon: it was twilight.')
    expect(sunWords(at(-6.4, 250))).toBe('The sun was 6° below the horizon: it was twilight.')
    expect(sunWords(at(-6.6, 250))).toBe('The sun was 7° below the horizon: it was night.')
    expect(sunWords(at(-12, 10))).toBe('The sun was 12° below the horizon: it was night.')
  })

  it('says why without a UTC time', () => {
    expect(sunWords(null, { local: '2025-03-12T14:32:05', offset: null })).toBe(
      'The time zone isn’t recorded, so the sun’s position can’t be worked out.',
    )
    expect(sunWords(null, null)).toBe('No time taken is recorded, so the sun’s position can’t be worked out.')
  })
})

describe('sunCaption', () => {
  it('says which time it used', () => {
    expect(sunCaption({ from: 'gps', utc: '', words: '12 March 2025 at 01:32 (UTC)' })).toBe(
      'Worked out for the GPS time, 12 March 2025 at 01:32 (UTC).',
    )
    expect(sunCaption({ from: 'taken', utc: '', words: '12 March 2025 at 14:32 (UTC+13:00)' })).toBe(
      'Worked out for the time taken, 12 March 2025 at 14:32 (UTC+13:00).',
    )
  })
})
