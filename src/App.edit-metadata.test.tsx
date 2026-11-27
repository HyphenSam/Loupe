// @vitest-environment jsdom
// Edit metadata (SPEC.md 6.7): the fields, what's written, the Content Credentials warning, and Set location on
// the map.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { ImageInfo, Tag } from './lib/info'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo, fakeStore } from './lib/testing'

const photo = (name = 'holiday.jpg') => new File([new Uint8Array(2_400)], name, { type: 'image/jpeg' })
const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const strip = () => screen.getByRole('region', { name: 'Exports' })
const field = (name: string) => screen.getByRole('textbox', { name })
const save = () => screen.getByRole('button', { name: 'Save changes' })
const view = (name: string) => within(screen.getByRole('radiogroup', { name: 'View' })).getByRole('radio', { name })
const location = (name: string) =>
  within(screen.getByRole('radiogroup', { name: 'Location' })).getByRole('radio', { name })

const tag = (family: string, group: string, name: string, value: string): Tag => ({
  family,
  group,
  name,
  label: name,
  value,
})

/** A photo with a caption in EXIF, IPTC and XMP and no location. */
const captioned = (over: Partial<ImageInfo> = {}) =>
  fakeInfo({
    name: 'holiday.jpg',
    size: 2_400,
    tags: [
      tag('EXIF', 'IFD0', 'ImageDescription', 'Lake Hayes'),
      tag('IPTC', 'IPTC', 'Caption-Abstract', 'Lake Hayes'),
      tag('XMP', 'XMP-dc', 'Description', 'Lake Hayes'),
    ],
    ...over,
  })

let provenance: FakeProvenance

/** Opens a photo, lets the worker answer with `info` and the C2PA SDK with `credentials`, then opens Edit
 * metadata. */
async function openEditor(info: ImageInfo = captioned(), credentials = false) {
  const client = new FakeClient()
  provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), photo())
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
    provenance.last.resolve(credentials ? { store: fakeStore(), thumbnails: {} } : null)
  })
  await userEvent.click(tool('Edit metadata'))
  return client
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:loupe/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('Edit metadata', () => {
  it('starts each field with the file’s value and says where it’s written', async () => {
    await openEditor()
    expect(screen.getByLabelText('Date taken')).toHaveValue('2025-03-12T14:32:05')
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue('+13:00')
    expect(field('Caption')).toHaveValue('Lake Hayes')
    expect(field('Caption')).toHaveAccessibleDescription('Written to EXIF, IPTC and XMP.')
    expect(field('Title')).toHaveValue('')
    expect(field('Title')).toHaveAccessibleDescription('Written to IPTC and XMP.')
    expect(location('Keep')).toBeChecked()
  })

  it('needs a change, then writes only what changed into “(edited)”, losslessly', async () => {
    const client = await openEditor()
    expect(save()).toBeDisabled()
    expect(screen.getByText('Change a field to save.')).toBeInTheDocument()

    await userEvent.clear(field('Caption'))
    await userEvent.paste('Mist on the lake')
    await userEvent.click(field('Keywords'))
    await userEvent.paste('lake, autumn')
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(
      screen.getByText('Only the metadata changes; the picture’s bytes are copied as they are.'),
    ).toBeInTheDocument()
    await userEvent.click(save())
    expect(client.runs[0].plan).toMatchObject({
      name: 'holiday (edited).jpg',
      args: [
        '-use',
        'MWG',
        '-IPTC:CodedCharacterSet=UTF8',
        '-MWG:Description=Mist on the lake',
        '-MWG:Keywords=lake',
        '-MWG:Keywords=autumn',
      ],
    })
    expect(screen.getByRole('progressbar', { name: 'Saving holiday (edited).jpg' })).toBeInTheDocument()
  })

  it('writes the date taken with its time zone, or clears it', async () => {
    const client = await openEditor()
    fireEvent.change(screen.getByLabelText('Date taken'), { target: { value: '2024-01-02T03:04:05' } })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time zone' }), 'UTC+05:30')
    await userEvent.click(save())
    expect(client.runs[0].plan.args).toContain('-MWG:DateTimeOriginal=2024:01:02 03:04:05+05:30')
    await act(async () => client.runs[0].reject('stop'))

    await userEvent.click(screen.getByRole('button', { name: 'Clear the date taken' }))
    expect(screen.getByLabelText('Date taken')).toHaveValue('')
    await userEvent.click(save())
    expect(client.runs[1].plan.args).toContain('-MWG:DateTimeOriginal=')
  })

  it('says what the result doesn’t hold of what was asked', async () => {
    const client = await openEditor()
    await userEvent.type(field('Title'), 'Dawn')
    await userEvent.click(save())
    await act(async () =>
      client.runs[0].resolve({ blob: new Blob(['x']), info: captioned({ name: 'holiday (edited).jpg' }) }),
    )
    expect(within(strip()).getByRole('listitem')).toHaveTextContent(
      'Title: ExifTool couldn’t write it to this JPEG file.',
    )
  })

  it('takes back every change', async () => {
    await openEditor()
    await userEvent.type(field('Title'), 'Dawn')
    await userEvent.click(screen.getByRole('button', { name: 'Undo changes' }))
    expect(field('Title')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Undo changes' })).not.toBeInTheDocument()
  })

  it('keeps the changes while another tool is open, and starts afresh for the next file', async () => {
    const client = await openEditor()
    await userEvent.type(field('Title'), 'Dawn')
    await userEvent.click(tool('Info'))
    await userEvent.click(tool('Edit metadata'))
    expect(field('Title')).toHaveValue('Dawn')

    await userEvent.upload(screen.getByLabelText('Choose file'), photo('lake.jpg'))
    await act(async () => {
      client.last.resolve(captioned({ name: 'lake.jpg' }))
      provenance.last.resolve(null)
    })
    await userEvent.click(tool('Edit metadata'))
    expect(field('Title')).toHaveValue('')
  })

  it('keeps the changes when the next file can’t be opened', async () => {
    const client = await openEditor()
    await userEvent.type(field('Title'), 'Dawn')
    await userEvent.upload(screen.getByLabelText('Choose file'), photo('notes.txt'))
    await act(async () => client.last.reject('Loupe can’t open this file.'))
    expect(field('Title')).toHaveValue('Dawn')
  })

  it('warns that changing metadata breaks Content Credentials, and points to Privacy', async () => {
    await openEditor(captioned(), true)
    expect(
      screen.getByText(
        /Changing metadata breaks this file’s Content Credentials: they’ll show as changed after signing\./,
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Privacy' }))
    expect(tool('Privacy')).toBeChecked()
  })

  it('gives no warning for a file without Content Credentials', async () => {
    await openEditor()
    expect(screen.queryByText(/Content Credentials/)).not.toBeInTheDocument()
  })

  it('says it can’t write a BMP', async () => {
    await openEditor(captioned({ format: 'bmp', formatName: 'BMP' }))
    expect(screen.getByText('Loupe can’t change metadata in a BMP file.')).toBeInTheDocument()
    expect(save()).toBeDisabled()
  })
})

describe('Edit metadata’s location', () => {
  beforeEach(() => {
    // jsdom has no layout; give the map a size so Leaflet can place things. No tiles: the outlines only.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  })

  it('removes the location', async () => {
    const gps = { lat: -44.9405, lon: 168.8263, altitude: null, direction: null, speed: null, accuracy: null }
    const client = await openEditor(captioned({ gps, tags: [tag('EXIF', 'GPS', 'GPSLatitude', '44 deg S')] }))
    await userEvent.click(location('Remove'))
    expect(view('Picture')).toBeChecked()
    await userEvent.click(save())
    expect(client.runs[0].plan.args).toEqual(['-use', 'MWG', '-GPS:GPSLatitude='])
  })

  it('switches the stage to the map while Set is chosen, even for a picture without a location', async () => {
    await openEditor()
    await userEvent.click(location('Set'))
    // The map loads on first use.
    expect(await screen.findByRole('region', { name: 'Map' })).toBeInTheDocument()
    expect(view('Map')).toBeChecked()
    expect(screen.getByText('Place the pin on the map, or type a latitude and longitude.')).toBeInTheDocument()
    await userEvent.click(location('Keep'))
    expect(view('Picture')).toBeChecked()
    expect(screen.queryByRole('region', { name: 'Map' })).not.toBeInTheDocument()
  })

  it('goes back to Picture on leaving the tool, and to the map on coming back', async () => {
    await openEditor()
    await userEvent.click(location('Set'))
    await userEvent.click(tool('Info'))
    expect(view('Picture')).toBeChecked()
    await userEvent.click(tool('Edit metadata'))
    expect(await screen.findByRole('region', { name: 'Map' })).toBeInTheDocument()
    expect(view('Map')).toBeChecked()
  })

  it('places the pin where the map is clicked, and moves it with the arrow keys', async () => {
    const client = await openEditor()
    await userEvent.click(location('Set'))
    const map = await screen.findByRole('region', { name: 'Map' })
    // The middle of the map, which starts on the whole world.
    fireEvent.click(map, { clientX: 400, clientY: 300 })
    // Leaflet rounds the map's pixel origin, so the middle is within a pixel of 20° N, 0°.
    const value = (name: string) => Number((field(name) as HTMLInputElement).value)
    expect(value('Latitude')).toBeCloseTo(20, 0)
    expect(value('Longitude')).toBeCloseTo(0, 5)
    expect((field('Latitude') as HTMLInputElement).value).toMatch(/^\d+\.\d{6}$/)

    const pin = await waitFor(() => within(map).getByRole('button', { name: 'New location' }))
    fireEvent.keyDown(pin, { key: 'ArrowRight' })
    // One pixel at zoom 2 is 360° / 1024.
    expect(value('Longitude')).toBeCloseTo(0.3516, 3)
    fireEvent.keyDown(pin, { key: 'ArrowUp', shiftKey: true })
    expect(value('Latitude')).toBeGreaterThan(22)

    await userEvent.click(save())
    expect(client.runs[0].plan.args.at(-1)).toMatch(/^-GPSPosition=2\d\.\d+, 0\.35\d+$/)
  })

  it('moves the pin to coordinates typed in, and checks they’re on the globe', async () => {
    await openEditor()
    await userEvent.click(location('Set'))
    const map = await screen.findByRole('region', { name: 'Map' })
    await userEvent.type(field('Latitude'), '-45.03')
    await userEvent.type(field('Longitude'), '168.66')
    expect(within(map).getByRole('button', { name: 'New location' })).toBeInTheDocument()
    expect(save()).toBeEnabled()
    await userEvent.clear(field('Latitude'))
    await userEvent.type(field('Latitude'), '-95')
    expect(screen.getByText('Latitude must be a number from −90 to 90.')).toBeInTheDocument()
    expect(within(map).queryByRole('button', { name: 'New location' })).not.toBeInTheDocument()
  })
})
