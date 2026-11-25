import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import { describe, expect, it } from 'vitest'
import { encodePlaces } from '../../scripts/places'
import { countryAt, prepareCountries, type Outlines } from './countries'
import { decodePlaces, findPlace, placeWords, type Place, type PlaceData, type RegionsFile } from './places'

const require = createRequire(import.meta.url)
const topology = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8')) as Topology
const outlines = prepareCountries(feature(topology, topology.objects.countries) as Outlines)

/** A few real places, as GeoNames has them, to look points up against. */
function sample(): PlaceData {
  const regions: RegionsFile = {
    regions: [
      ['NZ', 'Otago'],
      ['CH', 'Basel-City'],
      ['DE', 'Baden-Wurttemberg'],
      ['FJ', 'Northern'],
      ['RU', 'Chukotka'],
      ['SG', null],
      ['GF', 'Guyane'],
      ['NZ', null],
    ],
    countries: {
      'New Zealand': ['NZ'],
      Switzerland: ['CH'],
      Germany: ['DE'],
      Fiji: ['FJ'],
      Russia: ['RU'],
      Singapore: ['SG'],
      France: ['FR', 'GF'],
    },
  }
  const bin = encodePlaces([
    { name: 'Arrowtown', lat: -44.93837, lon: 168.81007, region: 0 },
    { name: 'Queenstown', lat: -45.03023, lon: 168.66271, region: 0 },
    { name: 'Basel', lat: 47.55839, lon: 7.57327, region: 1 },
    { name: 'Weil am Rhein', lat: 47.59331, lon: 7.62082, region: 2 },
    { name: 'Lörrach', lat: 47.61497, lon: 7.66457, region: 2 },
    { name: 'Waiyevo', lat: -16.8, lon: 179.99, region: 3 },
    { name: 'Uelen', lat: 66.15985, lon: -169.80946, region: 4 },
    { name: 'Singapore', lat: 1.28967, lon: 103.85007, region: 5 },
    { name: 'Saül', lat: 3.62, lon: -53.21, region: 6 },
    { name: 'Waitangi', lat: -43.9535, lon: -176.5597, region: 7 },
    { name: 'Dunedin', lat: -45.87389, lon: 170.50361, region: 0 },
  ])
  return decodePlaces(bin, regions)
}

const data = sample()
const lookUp = (lat: number, lon: number) => findPlace(data, outlines, { lat, lon })
const words = (lat: number, lon: number) => placeWords(lookUp(lat, lon))

describe('decodePlaces', () => {
  it('reads back what scripts/places.ts wrote, to a metre or so', () => {
    expect(data.names).toEqual([
      'Arrowtown',
      'Queenstown',
      'Basel',
      'Weil am Rhein',
      'Lörrach',
      'Waiyevo',
      'Uelen',
      'Singapore',
      'Saül',
      'Waitangi',
      'Dunedin',
    ])
    expect(data.lat[0] / 1e5).toBeCloseTo(-44.93837, 5)
    expect(data.lon[6] / 1e5).toBeCloseTo(-169.80946, 5)
    expect(Array.from(data.region)).toEqual([0, 0, 1, 2, 2, 3, 4, 5, 6, 7, 0])
  })

  it('refuses a file it doesn’t recognise', () => {
    expect(() => decodePlaces(new Uint8Array(16), { regions: [], countries: {} })).toThrow(/places/)
  })
})

describe('findPlace', () => {
  it('names a place within 3 km', () => {
    expect(lookUp(-44.9405, 168.8263)).toMatchObject({
      type: 'town',
      name: 'Arrowtown',
      region: 'Otago',
      country: 'New Zealand',
    })
    expect(words(-44.9405, 168.8263)).toBe('Arrowtown, Otago, New Zealand')
  })

  it('says how far and which way from a place within 50 km, from the place to the point', () => {
    expect(words(-45.04, 168.76)).toBe('8 km east of Queenstown, Otago, New Zealand')
    expect(words(-44.85, 168.93)).toBe('14 km north-east of Arrowtown, Otago, New Zealand')
  })

  it('keeps to the country the point is in, even when a place over the border is nearer', () => {
    // In Switzerland's outline, but nearer Weil am Rhein than Basel's own centre.
    expect(countryAt(outlines, { lat: 47.583, lon: 7.6 })?.name).toBe('Switzerland')
    expect(lookUp(47.583, 7.6)).toMatchObject({ name: 'Basel', country: 'Switzerland' })
  })

  it('looks across the antimeridian', () => {
    // On Taveuni, which the 180th meridian crosses: the point is west of it, the place east.
    expect(words(-16.81, -179.99)).toBe('Waiyevo, Northern, Fiji')
    expect(words(-43.95, -176.53)).toBe('Waitangi, New Zealand')
  })

  it('says which country when no place is within 50 km', () => {
    expect(lookUp(-44.0, 170.5)).toEqual({ type: 'country', country: 'New Zealand' })
    expect(words(-44.0, 170.5)).toBe('In New Zealand, far from any town')
    expect(words(-89.5, 0)).toBe('In Antarctica, far from any town')
  })

  it('names an overseas territory by its own code, not the outline it shares', () => {
    // French Guiana is part of France’s outline in Natural Earth; GeoNames gives it its own code.
    expect(words(4.5, -53.0)).toBe('In French Guiana, far from any town')
  })

  it('says "At sea" far from any land or town', () => {
    expect(lookUp(0, -150)).toEqual({ type: 'sea' })
    expect(words(0, -150)).toBe('At sea')
    expect(words(90, 0)).toBe('At sea')
  })

  it('still names a place near the coast for a point the outlines put at sea', () => {
    // Off the Otago Peninsula.
    expect(countryAt(outlines, { lat: -45.9, lon: 170.85 })).toBeNull()
    expect(words(-45.9, 170.85)).toBe('27 km east of Dunedin, Otago, New Zealand')
  })
})

describe('placeWords', () => {
  const town = (p: Partial<Extract<Place, { type: 'town' }>>): Place => ({
    type: 'town',
    name: 'Arrowtown',
    region: 'Otago',
    country: 'New Zealand',
    km: 0.4,
    bearing: 0,
    ...p,
  })

  it('leaves out a region that repeats the place’s name, and a country that repeats either', () => {
    expect(placeWords(town({ name: 'Singapore', region: null, country: 'Singapore' }))).toBe('Singapore')
    expect(placeWords(town({ name: 'Otago', region: 'Otago' }))).toBe('Otago, New Zealand')
    expect(placeWords(town({ name: 'Monaco', region: 'Monaco', country: 'Monaco' }))).toBe('Monaco')
  })

  it('names the place itself up to 3 km, then gives whole kilometres with one of eight compass words', () => {
    expect(placeWords(town({ km: 3 }))).toBe('Arrowtown, Otago, New Zealand')
    expect(placeWords(town({ km: 3.4, bearing: 225 }))).toBe('3 km south-west of Arrowtown, Otago, New Zealand')
    expect(placeWords(town({ km: 49.6, bearing: 95 }))).toBe('50 km east of Arrowtown, Otago, New Zealand')
  })
})

describe('the committed places file', () => {
  it('is under 5 MB and finds camera.jpg’s place', () => {
    const root = join(import.meta.dirname, '../..')
    const bin = new Uint8Array(readFileSync(join(root, 'public/places.bin')))
    const regions = JSON.parse(readFileSync(join(root, 'public/regions.json'), 'utf8')) as RegionsFile
    expect(bin.length).toBeLessThan(5 * 1024 * 1024)
    const real = decodePlaces(bin, regions)
    expect(real.names.length).toBeGreaterThan(150_000)
    expect(placeWords(findPlace(real, outlines, { lat: -44.9405, lon: 168.8263 }))).toBe(
      'Arrowtown, Otago, New Zealand',
    )
    expect(placeWords(findPlace(real, outlines, { lat: 51.5007, lon: -0.1246 }))).toMatch(/, England, United Kingdom$/)
  })
})
