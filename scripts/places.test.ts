import { describe, expect, it } from 'vitest'
import type { Country } from '../src/lib/countries.ts'
import { buildPlaces, countryCodes, parseAdmin1, parseCities, type City } from './places.ts'

const line = (name: string, lat: number, lon: number, code: string, country: string, admin1: string) =>
  [
    '1',
    name,
    name,
    '',
    lat,
    lon,
    'P',
    code,
    country,
    '',
    admin1,
    '',
    '',
    '',
    '1500',
    '',
    '10',
    'Pacific/Auckland',
    '2024-01-01',
  ].join('\t')

describe('parseCities', () => {
  it('reads each place’s name, point, country and region, leaving out places that are gone', () => {
    const text = [
      line('Arrowtown', -44.93837, 168.81007, 'PPL', 'NZ', 'F7'),
      line('Old Town', -44.9, 168.8, 'PPLH', 'NZ', 'F7'),
      line('Ponsonby', -36.85, 174.74, 'PPLX', 'NZ', 'E7'),
      '',
    ].join('\n')
    expect(parseCities(text)).toEqual([
      { name: 'Arrowtown', lat: -44.93837, lon: 168.81007, country: 'NZ', admin1: 'F7' },
      { name: 'Ponsonby', lat: -36.85, lon: 174.74, country: 'NZ', admin1: 'E7' },
    ])
  })
})

describe('parseAdmin1', () => {
  it('maps each region code to its name', () => {
    expect(parseAdmin1('NZ.F7\tOtago\tOtago\t2184707\nNZ.E7\tAuckland\tAuckland\t2193733\n')).toEqual(
      new Map([
        ['NZ.F7', 'Otago'],
        ['NZ.E7', 'Auckland'],
      ]),
    )
  })
})

/** Two square outlines side by side: A from 0° to 10° east, B from 10° to 20°. */
const square = (name: string, west: number): Country => ({
  name,
  id: null,
  shapes: [
    {
      box: [west, 0, west + 10, 10],
      rings: [
        [
          [west, 0],
          [west + 10, 0],
          [west + 10, 10],
          [west, 10],
          [west, 0],
        ],
      ],
    },
  ],
})
const city = (country: string, lon: number): City => ({ name: country, lat: 5, lon, country, admin1: '01' })

describe('countryCodes', () => {
  it('puts each code with the outline holding most of its places, so stray border towns don’t count', () => {
    const cities = [city('AA', 2), city('AA', 3), city('AA', 11), city('BB', 15), city('BB', 16), city('CC', 4)]
    expect(countryCodes(cities, [square('A', 0), square('B', 10)])).toEqual({ A: ['AA', 'CC'], B: ['BB'] })
  })

  it('leaves out codes whose places fall in no outline', () => {
    expect(countryCodes([city('ZZ', 50)], [square('A', 0)])).toEqual({})
  })
})

describe('buildPlaces', () => {
  it('gives each country and region pair one index, with null for a region GeoNames doesn’t name', () => {
    const cities = [city('AA', 2), city('AA', 3), { ...city('AA', 4), admin1: '00' }]
    const { regions } = buildPlaces(cities, new Map([['AA.01', 'First']]), [square('A', 0)])
    expect(regions.regions).toEqual([
      ['AA', 'First'],
      ['AA', null],
    ])
  })
})
