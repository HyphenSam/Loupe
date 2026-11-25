// Rebuilds public/places.bin and public/regions.json (SPEC.md section 12) from GeoNames' cities1000 (places
// of 1,000 people or more) and admin1CodesASCII (their first-level regions). The output is committed; run
// `pnpm places` only to refresh it. GeoNames' data is CC BY 4.0, credited in About.
//
// places.bin, little-endian: 'LPL1', the count n (u32), n latitudes then n longitudes (i32, 1e-5 degrees,
// about a metre), n region indexes (u16, into regions.json's `regions`), then the names in UTF-8, one per
// line. regions.json: `regions`, [country code, region name or null] for each index, and `countries`, the
// GeoNames country codes whose places fall mostly in each world-atlas outline, most places first (France's
// outline holds French Guiana, GF, and Réunion, RE, too). src/lib/places.ts reads both.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import { countryAt, prepareCountries, type Country, type Outlines } from '../src/lib/countries.ts'
import type { RegionsFile } from '../src/lib/places.ts'

const GEONAMES = 'https://download.geonames.org/export/dump'

export type City = { name: string; lat: number; lon: number; country: string; admin1: string }
export type Entry = { name: string; lat: number; lon: number; region: number }

// Historical, abandoned and destroyed places, and the seat of a former capital: not where anyone is now.
const GONE = new Set(['PPLH', 'PPLQ', 'PPLW', 'PPLCH'])

/** cities1000.txt: one place per line, tab-separated (geonameid, name, asciiname, alternatenames, latitude,
 * longitude, feature class, feature code, country code, cc2, admin1 code, …). */
export function parseCities(text: string): City[] {
  const cities: City[] = []
  for (const line of text.split('\n')) {
    const f = line.split('\t')
    if (f.length < 11 || GONE.has(f[7])) continue
    cities.push({ name: f[1], lat: Number(f[4]), lon: Number(f[5]), country: f[8], admin1: f[10] })
  }
  return cities
}

/** admin1CodesASCII.txt: 'NZ.F7', its name, its ASCII name and its geonameid, tab-separated. */
export function parseAdmin1(text: string): Map<string, string> {
  const names = new Map<string, string>()
  for (const line of text.split('\n')) {
    const [code, name] = line.split('\t')
    if (code && name) names.set(code, name)
  }
  return names
}

/** Each country code goes with the outline holding most of its places, so a few towns that the 1:50m
 * borders put on the wrong side don't count. */
export function countryCodes(cities: City[], outlines: Country[]): Record<string, string[]> {
  const counts = new Map<string, Map<string, number>>() // code → outline name → places
  for (const city of cities) {
    const outline = countryAt(outlines, city)
    if (!outline) continue
    const byOutline = counts.get(city.country) ?? new Map<string, number>()
    byOutline.set(outline.name, (byOutline.get(outline.name) ?? 0) + 1)
    counts.set(city.country, byOutline)
  }
  const held = new Map<string, [code: string, places: number][]>()
  for (const [code, byOutline] of counts) {
    const [name, places] = [...byOutline].sort((a, b) => b[1] - a[1])[0]
    held.set(name, [...(held.get(name) ?? []), [code, places]])
  }
  return Object.fromEntries(
    [...held]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, codes]) => [name, codes.sort((a, b) => b[1] - a[1]).map(([c]) => c)]),
  )
}

export function buildPlaces(cities: City[], admin1: Map<string, string>, outlines: Country[]) {
  const regions: RegionsFile['regions'] = []
  const index = new Map<string, number>()
  const entries = cities.map(({ name, lat, lon, country, admin1: code }) => {
    const key = `${country}.${code}`
    let region = index.get(key)
    if (region === undefined) {
      region = regions.length
      index.set(key, region)
      regions.push([country, admin1.get(key) ?? null])
    }
    return { name, lat, lon, region }
  })
  if (regions.length > 0xffff) throw new Error(`Too many regions for a u16: ${regions.length}`)
  const file: RegionsFile = { regions, countries: countryCodes(cities, outlines) }
  return { bin: encodePlaces(entries), regions: file }
}

export function encodePlaces(entries: Entry[]): Uint8Array {
  const n = entries.length
  const names = new TextEncoder().encode(entries.map((e) => e.name).join('\n'))
  const bytes = new Uint8Array(8 + n * 10 + names.length)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('LPL1'))
  view.setUint32(4, n, true)
  entries.forEach((e, i) => {
    view.setInt32(8 + i * 4, Math.round(e.lat * 1e5), true)
    view.setInt32(8 + n * 4 + i * 4, Math.round(e.lon * 1e5), true)
    view.setUint16(8 + n * 8 + i * 2, e.region, true)
  })
  bytes.set(names, 8 + n * 10)
  return bytes
}

async function download(name: string): Promise<Uint8Array> {
  const response = await fetch(`${GEONAMES}/${name}`)
  if (!response.ok) throw new Error(`${name}: ${response.status} ${response.statusText}`)
  return new Uint8Array(await response.arrayBuffer())
}

if (import.meta.main) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const require = createRequire(import.meta.url)
  const topology = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8')) as Topology
  const outlines = prepareCountries(feature(topology, topology.objects.countries) as Outlines)

  console.log('Downloading cities1000.zip and admin1CodesASCII.txt from GeoNames…')
  const [zip, admin1] = await Promise.all([download('cities1000.zip'), download('admin1CodesASCII.txt')])
  const cities = parseCities(strFromU8(unzipSync(zip)['cities1000.txt']))
  const { bin, regions } = buildPlaces(cities, parseAdmin1(strFromU8(admin1)), outlines)

  writeFileSync(join(root, 'public/places.bin'), bin)
  writeFileSync(join(root, 'public/regions.json'), JSON.stringify(regions))
  console.log(`${cities.length} places in ${regions.regions.length} regions: places.bin is ${bin.length} bytes.`)
}
