import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import { describe, expect, it } from 'vitest'
import { countryAt, prepareCountries, type Outlines } from './countries'

const require = createRequire(import.meta.url)
const topology = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8')) as Topology
const countries = prepareCountries(feature(topology, topology.objects.countries) as Outlines)
const at = (lat: number, lon: number) => countryAt(countries, { lat, lon })?.name ?? null

describe('countryAt', () => {
  it('finds the country a point falls in', () => {
    expect(at(-44.9405, 168.8263)).toBe('New Zealand')
    expect(at(51.5074, -0.1278)).toBe('United Kingdom')
    expect(at(35.6762, 139.6503)).toBe('Japan')
  })

  it('tells neighbours apart near a border', () => {
    expect(at(47.5596, 7.5886)).toBe('Switzerland') // Basel
    expect(at(47.6, 7.65)).toBe('Germany') // Weil am Rhein
    expect(at(47.586, 7.555)).toBe('France') // Saint-Louis
    expect(at(49.05, -122.3)).toBe('Canada') // Abbotsford, just north of the 49th parallel
    expect(at(48.946, -122.452)).toBe('United States of America') // Lynden
  })

  it('leaves out a country’s holes: Lesotho inside South Africa', () => {
    expect(at(-29.31, 27.48)).toBe('Lesotho') // Maseru
    expect(at(-26.2, 28.05)).toBe('South Africa') // Johannesburg
  })

  it('finds land either side of the antimeridian', () => {
    expect(at(-17.8, 178.0)).toBe('Fiji') // Viti Levu
    expect(at(-16.81, -179.97)).toBe('Fiji') // Taveuni, which the 180th meridian crosses
    expect(at(66.1, -170.5)).toBe('Russia') // Chukotka, east of 180°
    expect(at(65.0, 177.0)).toBe('Russia')
  })

  it('finds Antarctica at the South Pole, and nothing at the North Pole', () => {
    expect(at(-89.5, 0)).toBe('Antarctica')
    expect(at(-89.5, 179.9)).toBe('Antarctica')
    expect(at(90, 0)).toBeNull()
    expect(at(89.5, 45)).toBeNull()
  })

  it('finds nothing at sea', () => {
    expect(at(0, -150)).toBeNull() // the Pacific
    expect(at(-44.9, 172.0)).toBeNull() // off Canterbury
    expect(at(30, -40)).toBeNull() // the Atlantic
  })

  it('carries the outline’s ISO number when it has one', () => {
    expect(countryAt(countries, { lat: -44.9405, lon: 168.8263 })?.id).toBe('554')
    expect(countryAt(countries, { lat: 42.6, lon: 20.9 })).toMatchObject({ name: 'Kosovo', id: null })
  })
})
