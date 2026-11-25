/** What the Location tool shows (SPEC.md 6.2), as plain data: the place, the coordinates, altitude,
 * accuracy and speed, the direction and field of view, the sun, the links, and the other location fields
 * in the metadata. The map (phase 4) draws from the same. */
import { compass, decimal, dms, fieldOfView, mapLinks } from './geo'
import type { ImageInfo, Tag } from './info'
import { placeWords } from './places'
import { sunAt, sunCaption, sunWords } from './sun'
import type { Row } from './summary'

export type LocationView = {
  place: string | null // null when the places data couldn't be read
  decimal: string
  dms: string
  rows: Row[]
  direction: string | null
  /** The horizontal angle the picture takes in, in degrees, for the map's cone. */
  fieldOfView: number | null
  sun: { words: string; caption: string | null; azimuth: number | null }
  links: { osm: string; google: string }
  also: Row[]
}

function altitudeWords(metres: number): string {
  const m = Math.round(metres)
  if (m === 0) return 'At sea level'
  return `${Math.abs(m)} m ${m > 0 ? 'above' : 'below'} sea level`
}

const speedWords = (kmh: number) => `${kmh < 10 ? kmh.toFixed(1) : Math.round(kmh)} km/h`

// IPTC's location fields and their XMP equivalents (photoshop's, IPTC Core's and IPTC Extension's).
const PLACE_TAGS: Record<string, RegExp> = {
  IPTC: /^(City|Sub-location|Province-State|Country-PrimaryLocation(Name|Code))$/,
  XMP: /^(City|State|Country|CountryCode|Location|Location(Created|Shown)\w+)$/,
}

/** Location fields that say where in words, which can disagree with the GPS. The same field with the same
 * value in IPTC and XMP is listed once. */
function alsoInMetadata(tags: Tag[]): Row[] {
  const rows = new Map<string, Row>()
  for (const tag of tags) {
    if (!PLACE_TAGS[tag.family]?.test(tag.name)) continue
    const key = `${tag.label}\n${tag.value}`
    const row = rows.get(key)
    if (!row) rows.set(key, { label: tag.label, value: tag.value, note: tag.family })
    else if (!row.note!.split(', ').includes(tag.family)) row.note += `, ${tag.family}`
  }
  return [...rows.values()]
}

export function locationView(info: ImageInfo): LocationView | null {
  const { gps } = info
  if (!gps) return null
  const rows: Row[] = []
  if (gps.altitude !== null) rows.push({ label: 'Altitude', value: altitudeWords(gps.altitude) })
  if (gps.accuracy !== null) rows.push({ label: 'Accuracy', value: `Within ${Math.round(gps.accuracy)} m` })
  if (gps.speed) rows.push({ label: 'Speed', value: speedWords(gps.speed) })

  const { direction } = gps
  const focal35 = info.camera?.focal35
  const sun = sunAt(gps, info.dates)
  return {
    place: info.place ? placeWords(info.place) : null,
    decimal: decimal(gps.lat, gps.lon),
    dms: dms(gps.lat, gps.lon),
    rows,
    direction: direction
      ? `Facing ${compass(direction.degrees)} (${Math.round(direction.degrees) % 360}°, ${direction.ref} north)`
      : null,
    fieldOfView: focal35 ? fieldOfView(focal35, info.displayWidth >= info.displayHeight) : null,
    sun: {
      words: sunWords(sun, info.dates.taken),
      caption: sun && sunCaption(sun.time),
      azimuth: sun && sun.azimuth,
    },
    links: mapLinks(gps.lat, gps.lon),
    also: alsoInMetadata(info.tags),
  }
}
