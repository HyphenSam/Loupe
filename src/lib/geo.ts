/** Geometry on the globe for Location (SPEC.md 6.2): distances and bearings between points, compass words,
 * coordinates as decimal and degrees-minutes-seconds, and the camera's field of view cone. A sphere is
 * plenty at the scale of towns. No imports, so scripts/places.ts can use it from Node as it is. */

export type LatLon = { lat: number; lon: number }

const EARTH_KM = 6371.0088
const rad = (degrees: number) => (degrees * Math.PI) / 180
const deg = (radians: number) => (radians * 180) / Math.PI
const wrap360 = (degrees: number) => ((degrees % 360) + 360) % 360
const wrap180 = (degrees: number) => wrap360(degrees + 180) - 180

/** Great-circle distance (haversine), in km. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The initial bearing from one point towards another, in degrees clockwise from true north, 0–360. */
export function bearing(from: LatLon, to: LatLon): number {
  const φ1 = rad(from.lat)
  const φ2 = rad(to.lat)
  const dLon = rad(to.lon - from.lon)
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return wrap360(deg(Math.atan2(y, x)))
}

/** The point a distance away along a bearing. */
export function destination(from: LatLon, bearingDegrees: number, metres: number): LatLon {
  const δ = metres / 1000 / EARTH_KM
  const θ = rad(bearingDegrees)
  const φ1 = rad(from.lat)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ = Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: deg(φ2), lon: wrap180(from.lon + deg(λ)) }
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const
export type Compass = (typeof COMPASS)[number]

/** The nearest of the eight compass words. */
export const compass = (degrees: number): Compass => COMPASS[Math.floor(wrap360(degrees + 22.5) / 45) % 8]

/** '-44.940500, 168.826300': signed, six places, the way maps take a pasted point. */
export const decimal = (lat: number, lon: number) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`

function dmsOne(value: number, positive: string, negative: string): string {
  // Round to tenths of a second first, so 59.96″ carries into the minute rather than showing as 60.0″.
  const tenths = Math.round(Math.abs(value) * 36_000)
  const d = Math.floor(tenths / 36_000)
  const m = Math.floor((tenths % 36_000) / 600)
  const s = (tenths % 600) / 10
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″ ${value < 0 ? negative : positive}`
}

/** '44°56′25.8″ S, 168°49′34.7″ E'. */
export const dms = (lat: number, lon: number) => `${dmsOne(lat, 'N', 'S')}, ${dmsOne(lon, 'E', 'W')}`

/** The horizontal angle a 35 mm-equivalent focal length takes in, in degrees: the frame is 36 mm wide in
 * landscape and 24 mm in portrait (SPEC.md 6.2). */
export const fieldOfView = (focal35: number, landscape: boolean) =>
  deg(2 * Math.atan((landscape ? 36 : 24) / (2 * focal35)))

/** The field of view as a closed shape for the map: the camera's point, then `steps + 1` points along an
 * arc `metres` away, from one edge of the view to the other. */
export function cone(at: LatLon, direction: number, angle: number, metres: number, steps = 16): LatLon[] {
  const start = direction - angle / 2
  const arc = Array.from({ length: steps + 1 }, (_, i) => destination(at, wrap360(start + (angle * i) / steps), metres))
  return [at, ...arc]
}

/** How long the map draws the cone at a zoom level: 300 m at street zoom (16), and the same size on screen
 * at other zooms, so it still shows the way from a country away. Capped at 1,000 km, past which an arc
 * stops looking like a cone on the map. */
export const mapMetres = (zoom: number) => Math.min(1_000_000, 300 * 2 ** (16 - zoom))

/** Open elsewhere's links (SPEC.md 6.2): the point on OpenStreetMap and Google Maps. */
export function mapLinks(lat: number, lon: number) {
  const [a, b] = [lat.toFixed(6), lon.toFixed(6)]
  return {
    osm: `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=16/${a}/${b}`,
    google: `https://www.google.com/maps/search/?api=1&query=${a}%2C${b}`,
  }
}
