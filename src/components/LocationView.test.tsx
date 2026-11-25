// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Gps, ImageInfo } from '@/lib/info'
import { fakeCamera, fakeInfo } from '@/lib/testing'
import { LocationView } from './LocationView'

const gps: Gps = {
  lat: -44.9405,
  lon: 168.8263,
  altitude: 312,
  direction: { degrees: 312, ref: 'true' },
  speed: null,
  accuracy: 5,
}
const arrowtown = {
  type: 'town' as const,
  name: 'Arrowtown',
  region: 'Otago',
  country: 'New Zealand',
  km: 1.3,
  bearing: 120,
}

const show = (over: Partial<ImageInfo> = {}) =>
  render(<LocationView info={fakeInfo({ gps, place: arrowtown, camera: fakeCamera({ focal35: 50 }), ...over })} />)
const section = (name: string) => screen.getByRole('region', { name })

describe('LocationView', () => {
  it('names the place and says it was worked out offline', () => {
    show()
    expect(within(section('Place')).getByText('Arrowtown, Otago, New Zealand')).toBeInTheDocument()
    expect(within(section('Place')).getByText(/GeoNames/)).toBeInTheDocument()
  })

  it('says so when the place couldn’t be worked out', () => {
    show({ place: null })
    expect(
      within(section('Place')).getByText('Loupe couldn’t load its places data, so the place isn’t named.'),
    ).toBeInTheDocument()
  })

  it('gives the coordinates both ways, each with a copy button that copies it', async () => {
    const user = userEvent.setup()
    show()
    const coordinates = section('Coordinates')
    expect(within(coordinates).getByText('-44.940500, 168.826300')).toBeInTheDocument()
    expect(within(coordinates).getByText('44°56′25.8″ S, 168°49′34.7″ E')).toBeInTheDocument()
    expect(within(coordinates).getByText('312 m above sea level')).toBeInTheDocument()
    expect(within(coordinates).getByText('Within 5 m')).toBeInTheDocument()
    await user.click(within(coordinates).getByRole('button', { name: 'Copy degrees, minutes and seconds' }))
    expect(await navigator.clipboard.readText()).toBe('44°56′25.8″ S, 168°49′34.7″ E')
    await user.click(within(coordinates).getByRole('button', { name: 'Copy decimal coordinates' }))
    expect(await navigator.clipboard.readText()).toBe('-44.940500, 168.826300')
  })

  it('says which way the camera faced and how wide its view was', () => {
    show()
    const direction = section('Direction')
    expect(within(direction).getByText('Facing north-west (312°, true north)')).toBeInTheDocument()
    expect(within(direction).getByText(/About 40° across/)).toBeInTheDocument()
  })

  it('leaves out the direction when it isn’t recorded', () => {
    show({ gps: { ...gps, direction: null } })
    expect(screen.queryByRole('region', { name: 'Direction' })).toBeNull()
  })

  it('says where the sun was and which time it used', () => {
    show()
    const sun = section('Sun')
    expect(within(sun).getByText('The sun was 48° above the horizon, to the north (346°).')).toBeInTheDocument()
    expect(
      within(sun).getByText('Worked out for the time taken, 12 March 2025 at 14:32 (UTC+13:00).'),
    ).toBeInTheDocument()
  })

  it('links to OpenStreetMap and Google Maps in a new tab', () => {
    show()
    const osm = within(section('Open elsewhere')).getByRole('link', { name: /OpenStreetMap/ })
    expect(osm).toHaveAttribute('href', expect.stringContaining('mlat=-44.940500&mlon=168.826300'))
    expect(osm).toHaveAttribute('target', '_blank')
    expect(within(section('Open elsewhere')).getByRole('link', { name: /Google Maps/ })).toHaveAttribute(
      'href',
      expect.stringContaining('query=-44.940500%2C168.826300'),
    )
  })

  it('lists other location fields from the metadata, which can disagree with the GPS', () => {
    show({ tags: [{ family: 'IPTC', group: 'IPTC', name: 'City', label: 'City', value: 'Queenstown' }] })
    const also = section('Also in the metadata')
    expect(within(also).getByText('Queenstown')).toBeInTheDocument()
    expect(within(also).getByText('IPTC')).toBeInTheDocument()
  })

  it('leaves out Also in the metadata when there’s nothing more', () => {
    show({ tags: [] })
    expect(screen.queryByRole('region', { name: 'Also in the metadata' })).toBeNull()
  })
})
