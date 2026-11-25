/** The nearest named place to a point, worked out offline (SPEC.md 6.2), and its wording. The data is
 * GeoNames' places of 1,000 people or more and their first-level regions, as scripts/places.ts writes them
 * to public/places.bin and public/regions.json; countries are named with `Intl.DisplayNames`. */
import { countryAt, type Country } from './countries'
import { bearing, compass, distanceKm, type LatLon } from './geo'

export type RegionsFile = {
  /** [country code, region name or null] for each region index in places.bin. */
  regions: [country: string, region: string | null][]
  /** Country codes whose places fall mostly in each outline, by the outline's name, most places first. */
  countries: Record<string, string[]>
}

export type PlaceData = {
  lat: Int32Array // 1e-5 degrees
  lon: Int32Array
  region: Uint16Array
  names: string[]
  regions: RegionsFile['regions']
  countries: RegionsFile['countries']
}

/** Where a point is, in words Location and Info show (`placeWords`). `km` and `bearing` run from the place
 * to the point. */
export type Place =
  | { type: 'town'; name: string; region: string | null; country: string; km: number; bearing: number }
  | { type: 'country'; country: string }
  | { type: 'sea' }

const NEAR_KM = 3
const AROUND_KM = 50

export function decodePlaces(bytes: Uint8Array, file: RegionsFile): PlaceData {
  if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'LPL1')
    throw new Error('This isn’t a places file Loupe can read.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const n = view.getUint32(4, true)
  const lat = new Int32Array(n)
  const lon = new Int32Array(n)
  const region = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    lat[i] = view.getInt32(8 + i * 4, true)
    lon[i] = view.getInt32(8 + n * 4 + i * 4, true)
    region[i] = view.getUint16(8 + n * 8 + i * 2, true)
  }
  const names = new TextDecoder().decode(bytes.subarray(8 + n * 10)).split('\n')
  return { lat, lon, region, names, regions: file.regions, countries: file.countries }
}

const displayNames = new Intl.DisplayNames(['en-GB'], { type: 'region', fallback: 'code' })
const countryName = (code: string) => displayNames.of(code) ?? code

/** The nearest place, of the given countries when there are any. A linear scan: 170,000 places take a few
 * milliseconds, once per file. */
function nearest(data: PlaceData, point: LatLon, codes: string[] | undefined) {
  const only = codes?.length ? new Set(codes) : null
  let best = -1
  let bestKm = Infinity
  for (let i = 0; i < data.names.length; i++) {
    if (only && !only.has(data.regions[data.region[i]][0])) continue
    const km = distanceKm(point, { lat: data.lat[i] / 1e5, lon: data.lon[i] / 1e5 })
    if (km < bestKm) [best, bestKm] = [i, km]
  }
  return best < 0 ? null : { index: best, km: bestKm }
}

/** The nearest place within 50 km, keeping to the country whose outline the point falls in so a town over
 * a border isn't named; further away, the country itself, or the sea. */
export function findPlace(data: PlaceData, outlines: Country[], point: LatLon): Place {
  const outline = countryAt(outlines, point)
  const codes = outline ? data.countries[outline.name] : undefined
  const found = nearest(data, point, codes)
  if (found && found.km <= AROUND_KM) {
    const i = found.index
    const [code, region] = data.regions[data.region[i]]
    const at = { lat: data.lat[i] / 1e5, lon: data.lon[i] / 1e5 }
    return {
      type: 'town',
      name: data.names[i],
      region,
      country: countryName(code),
      km: found.km,
      bearing: bearing(at, point),
    }
  }
  if (!outline) return { type: 'sea' }
  // An outline can hold several codes (France's holds French Guiana's); the nearest place says which.
  const code = codes?.length && found ? data.regions[data.region[found.index]][0] : null
  return { type: 'country', country: code ? countryName(code) : outline.name }
}

/** 'Arrowtown, Otago, New Zealand', '12 km north-east of Arrowtown, Otago, New Zealand', 'In New Zealand, far
 * from any town' or 'At sea' (SPEC.md 6.2). */
export function placeWords(place: Place): string {
  if (place.type === 'sea') return 'At sea'
  if (place.type === 'country') return `In ${place.country}, far from any town`
  const { name, region, country, km } = place
  const parts = [name]
  if (region && region !== name) parts.push(region)
  if (!parts.includes(country)) parts.push(country)
  const named = parts.join(', ')
  return km <= NEAR_KM ? named : `${Math.round(km)} km ${compass(place.bearing)} of ${named}`
}
