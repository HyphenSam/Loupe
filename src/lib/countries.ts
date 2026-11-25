/** Which country a point falls in, from the bundled outlines (world-atlas's Natural Earth countries at 1:50m,
 * as GeoJSON). Answers Location's "far from any town" (SPEC.md 6.2) and keeps the nearest place on the right
 * side of a border. Even-odd ray casting in longitude and latitude, once each ring is unwrapped onto the
 * plane. No runtime imports, so scripts/places.ts can use it from Node as it is. */
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { LatLon } from './geo'

export type Outlines = FeatureCollection<Polygon | MultiPolygon, { name: string }>

type Box = [minLon: number, minLat: number, maxLon: number, maxLat: number]
type Shape = { box: Box; rings: number[][][] }
/** One outline, ready to test points against. `id` is its ISO 3166-1 number, absent for a few (Kosovo). */
export type Country = { name: string; id: string | null; shapes: Shape[] }

function boxOf(ring: number[][]): Box {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of ring) {
    box[0] = Math.min(box[0], lon)
    box[1] = Math.min(box[1], lat)
    box[2] = Math.max(box[2], lon)
    box[3] = Math.max(box[3], lat)
  }
  return box
}

/** A ring as one continuous line on the plane. The outlines are drawn for the sphere, so a ring crossing the
 * antimeridian jumps from +180 to -180 in one edge; shifting what follows by 360° each time keeps it in one
 * piece (Russia runs to 190°). A ring around a pole (Antarctica's coast) ends 360° from where it began, and
 * is closed along the pole. */
function unwrap(ring: number[][]): number[][] {
  let shift = 0
  const out = ring.map(([lon, lat], i) => {
    if (i > 0) {
      const step = lon - ring[i - 1][0]
      if (step > 180) shift -= 360
      else if (step < -180) shift += 360
    }
    return [lon + shift, lat]
  })
  const first = out[0]
  const last = out.at(-1)!
  if (Math.abs(last[0] - first[0]) > 180) {
    const pole = ring.reduce((sum, [, lat]) => sum + lat, 0) < 0 ? -90 : 90
    out.push([last[0], pole], [first[0], pole], first)
  }
  return out
}

export function prepareCountries(outlines: Outlines): Country[] {
  return outlines.features.map((f) => {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    return {
      name: f.properties.name,
      id: f.id == null ? null : String(f.id),
      shapes: polygons.map((polygon) => {
        const rings = polygon.map(unwrap)
        return { box: boxOf(rings.flat()), rings }
      }),
    }
  })
}

/** Even-odd over every ring of a polygon, so its holes count as outside. */
function inside(rings: number[][][], x: number, y: number): boolean {
  let odd = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd
    }
  }
  return odd
}

/** Unwrapped outlines can run past ±180°, so a point is tried a turn either side too. */
export function countryAt(countries: Country[], { lat, lon }: LatLon): Country | null {
  for (const country of countries) {
    for (const { box, rings } of country.shapes) {
      for (const x of [lon, lon + 360, lon - 360]) {
        if (x < box[0] || x > box[2] || lat < box[1] || lat > box[3]) continue
        if (inside(rings, x, lat)) return country
      }
    }
  }
  return null
}
