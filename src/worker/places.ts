/** The places data in the worker: public/places.bin, public/regions.json and the country outlines, fetched
 * and read once, on the first picture with GPS. The service worker precaches all three, so this works
 * offline. If they can't be read, the place is left out and the next picture tries again. */
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import outlinesUrl from 'world-atlas/countries-50m.json?url'
import { prepareCountries, type Country, type Outlines } from '@/lib/countries'
import type { LatLon } from '@/lib/geo'
import { decodePlaces, findPlace, type Place, type PlaceData, type RegionsFile } from '@/lib/places'

export type PlacesFiles = { bin: Uint8Array; regions: RegionsFile; topology: Topology }

async function got(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response
}

let source = async (): Promise<PlacesFiles> => {
  const [bin, regions, topology] = await Promise.all([
    got('/places.bin').then(async (r) => new Uint8Array(await r.arrayBuffer())),
    got('/regions.json').then((r) => r.json() as Promise<RegionsFile>),
    got(outlinesUrl).then((r) => r.json() as Promise<Topology>),
  ])
  return { bin, regions, topology }
}

/** Node's tests read the files from disk instead (src/media/node.ts). */
export function setPlacesSource(next: () => Promise<PlacesFiles>) {
  source = next
  loaded = null
}

let loaded: Promise<{ data: PlaceData; outlines: Country[] }> | null = null

export async function placeAt(point: LatLon): Promise<Place | null> {
  loaded ??= source().then(({ bin, regions, topology }) => ({
    data: decodePlaces(bin, regions),
    outlines: prepareCountries(feature(topology, topology.objects.countries) as Outlines),
  }))
  try {
    const { data, outlines } = await loaded
    return findPlace(data, outlines, point)
  } catch {
    loaded = null
    return null
  }
}
