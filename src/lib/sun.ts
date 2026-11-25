/** Where the sun was when the picture was taken (SPEC.md 6.2), from SunCalc. It needs a UTC time: the GPS
 * time, which is always UTC, or else the time taken with its offset. A time taken with no offset could be
 * any of 26 hours, so it isn't guessed at. */
import { getPosition } from 'suncalc'
import { compass, type LatLon } from './geo'
import type { Dates, LocalTime } from './info'
import { dateWords, instant } from './words'

export type SunTime = { from: 'gps' | 'taken'; utc: string; words: string }
/** `altitude` in degrees above the horizon (refraction-corrected), `azimuth` clockwise from true north. */
export type Sun = { altitude: number; azimuth: number; time: SunTime }

function sunTime({ gpsUtc, taken }: Dates): SunTime | null {
  if (gpsUtc) return { from: 'gps', utc: gpsUtc, words: dateWords({ local: gpsUtc.slice(0, 19), offset: '+00:00' }) }
  if (taken?.offset) {
    const utc = new Date(instant(taken)).toISOString().replace(/\.\d+Z$/, 'Z')
    return { from: 'taken', utc, words: dateWords(taken) }
  }
  return null
}

export function sunAt(point: LatLon, dates: Dates): Sun | null {
  const time = sunTime(dates)
  if (!time) return null
  const { altitude, azimuth } = getPosition(new Date(time.utc), point.lat, point.lon)
  return { altitude, azimuth, time }
}

/** Civil twilight: the sky stays light until the sun is 6° down. */
const TWILIGHT = -6

/** 'The sun was 23° above the horizon, to the north-west (305°).', or below it, twilight or night; or why
 * it can't be said (`taken` is the time taken, to tell a missing zone from a missing time). */
export function sunWords(sun: Sun | null, taken?: LocalTime | null): string {
  if (!sun)
    return taken
      ? 'The time zone isn’t recorded, so the sun’s position can’t be worked out.'
      : 'No time taken is recorded, so the sun’s position can’t be worked out.'
  const up = Math.round(sun.altitude)
  const way = `to the ${compass(sun.azimuth)} (${Math.round(sun.azimuth) % 360}°)`
  if (up === 0) return `The sun was on the horizon, ${way}.`
  if (up > 0) return `The sun was ${up}° above the horizon, ${way}.`
  return `The sun was ${-up}° below the horizon: it was ${up >= TWILIGHT ? 'twilight' : 'night'}.`
}

export function sunCaption(time: SunTime): string {
  return `Worked out for the ${time.from === 'gps' ? 'GPS time' : 'time taken'}, ${time.words}.`
}
