// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { Capabilities } from './lib/capabilities'
import { finding, type GeneratorFinding } from './lib/ai/finding'
import { pixelAt } from './lib/pixels'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeCamera, fakeInfo, fakeStore } from './lib/testing'

const photo = () => new File([new Uint8Array(2_400)], 'holiday.jpg', { type: 'image/jpeg' })
const rail = () => screen.getByRole('radiogroup', { name: 'Tools' })
const tool = (name: string) => within(rail()).getByRole('radio', { name })
const tools = (group: string) =>
  within(within(rail()).getByRole('group', { name: group }))
    .getAllByRole('radio')
    .map((t) => t.textContent)
const card = () => screen.getByRole('region', { name: 'Open file' })

/** The fake C2PA SDK of the latest renderApp. */
let provenance: FakeProvenance

function renderApp({
  supported = true,
  capabilities = ALL_CAPABLE,
}: { supported?: boolean; capabilities?: Capabilities } = {}) {
  const client = new FakeClient()
  provenance = new FakeProvenance()
  render(<App supported={supported} client={client} capabilities={capabilities} provenance={provenance} />)
  return client
}

/** Opens `file` with Choose file and lets the fake worker answer with `info`. */
async function openWith(client: FakeClient, info = fakeInfo({ name: 'holiday.jpg' }), file = photo()) {
  await userEvent.upload(screen.getByLabelText('Choose file'), file)
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

/** What's saved through a download link from now on: its name, its text and its type. */
function saving() {
  const saved: { name: string; text: string; type: string }[] = []
  const blobs = new Map<string, Blob>()
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:saved/${++n}`
    blobs.set(url, blob as Blob)
    return url
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href)!
    const entry = { name: this.download, text: '', type: blob.type }
    saved.push(entry)
    void blob.text().then((text) => (entry.text = text))
  })
  return saved
}

describe('The tool rail', () => {
  it('shows the twelve tools in two groups, Inspect and Edit', () => {
    renderApp()
    expect(tools('Inspect')).toEqual(['Info', 'Location', 'AI check', 'Privacy', 'Forensics', 'Text', 'Extract'])
    expect(tools('Edit')).toEqual(['Edit metadata', 'Crop and rotate', 'Redact', 'Adjust', 'Export'])
  })

  it('keeps every tool disabled until a file is open, then starts on Info', async () => {
    const client = renderApp()
    for (const t of within(rail()).getAllByRole('radio')) expect(t).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'No image open' })).toBeInTheDocument()
    await openWith(client)
    for (const t of within(rail()).getAllByRole('radio')) expect(t).toBeEnabled()
    expect(tool('Info')).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Info' })).toBeInTheDocument()
  })

  it('switches the settings column to the chosen tool', async () => {
    const client = renderApp()
    await openWith(client)
    await userEvent.click(tool('Crop and rotate'))
    expect(screen.getByRole('heading', { name: 'Crop and rotate' })).toBeInTheDocument()
  })

  it('dims tools that can’t apply, saying why, and keeps them focusable', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps: null, embedded: [], format: 'raw', formatName: 'NEF' }))
    expect(tool('Location')).toHaveAccessibleDescription('This picture has no location.')
    expect(tool('Extract')).toHaveAccessibleDescription('Nothing is embedded in this file.')
    expect(tool('Adjust')).toHaveAccessibleDescription('Loupe can’t edit NEF pictures.')
    expect(tool('Location')).toHaveAttribute('data-dimmed')
    expect(tool('Location')).toBeEnabled()
    expect(tool('Info')).not.toHaveAttribute('data-dimmed')
  })

  it('shows a dimmed tool’s reason when it is opened', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps: null }))
    await userEvent.click(tool('Location'))
    expect(screen.getByRole('heading', { name: 'Location' })).toBeInTheDocument()
    expect(screen.getAllByText('This picture has no location.').length).toBeGreaterThan(0)
  })
})

describe('Opening a file', () => {
  it('shows the empty stage with its drop target and Choose file', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: 'Drop an image here' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument()
  })

  it('shows the file card at once, reading its metadata, then its size, dimensions, format and kinds', async () => {
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    expect(card()).toHaveTextContent('holiday.jpg')
    expect(card()).toHaveTextContent('2 kB')
    expect(card()).toHaveTextContent('Reading metadata…')
    expect(client.last.shows).toEqual(ALL_CAPABLE.shows)
    await act(async () => client.last.resolve(fakeInfo({ name: 'holiday.jpg', kinds: ['motion-photo', 'ultra-hdr'] })))
    expect(card()).toHaveTextContent('2 kB · 4032 × 3024 · JPEG')
    expect(within(card()).getByText('Motion Photo')).toBeInTheDocument()
    expect(within(card()).getByText('Ultra HDR')).toBeInTheDocument()
    expect(card()).not.toHaveTextContent('Reading metadata…')
  })

  it('tells a screen reader what opening is waiting for, and when the findings are in', async () => {
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    const status = screen.getByRole('status', { name: 'Opening' })
    expect(status).toHaveTextContent('Opening holiday.jpg. Reading metadata…')
    await act(async () => client.last.resolve(fakeInfo({ name: 'holiday.jpg' })))
    expect(status).toHaveTextContent('Metadata read. Reading Content Credentials…')
    await act(async () => provenance.last.resolve(null))
    expect(status).toHaveTextContent('holiday.jpg is open. Its findings are listed.')
  })

  it('takes the accept list from the file types table', () => {
    renderApp()
    expect(screen.getByLabelText('Choose file')).toHaveAttribute('accept', expect.stringContaining('image/heic'))
    expect(screen.getByLabelText('Choose file')).toHaveAttribute('accept', expect.stringContaining('.nef'))
  })

  it('accepts a file dropped anywhere on the window, whatever it is called', () => {
    const client = renderApp()
    const file = new File(['x'], 'IMG_0001.weird')
    fireEvent.dragOver(window, { dataTransfer: { types: ['Files'], files: [file] } })
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } })
    expect(client.last.file).toBe(file)
    expect(card()).toHaveTextContent('IMG_0001.weird')
  })

  it('accepts a file pasted anywhere on the page', () => {
    const client = renderApp()
    fireEvent.paste(window, { clipboardData: { files: [photo()] } })
    expect(client.last.file.name).toBe('holiday.jpg')
  })

  it('leaves a paste with no file alone', () => {
    const client = renderApp()
    fireEvent.paste(window, { clipboardData: { files: [] } })
    expect(client.opens).toHaveLength(0)
  })

  it('opens a file the installed app was launched with', async () => {
    let consumer: ((params: { files: { getFile(): Promise<File> }[] }) => void) | null = null
    Object.assign(window, { launchQueue: { setConsumer: (fn: typeof consumer) => (consumer = fn) } })
    const client = renderApp()
    const file = photo()
    await act(async () => consumer!({ files: [{ getFile: async () => file }] }))
    expect(client.last.file).toBe(file)
    delete (window as { launchQueue?: unknown }).launchQueue
  })

  it('says why a file can’t be opened, keeping the one already open', async () => {
    const client = renderApp()
    await openWith(client)
    fireEvent.paste(window, { clipboardData: { files: [new File(['y'], 'notes.txt')] } })
    const message =
      'Loupe can’t open this file. It reads JPEG, PNG, WebP, AVIF, HEIC, JPEG XL, GIF, BMP, TIFF and camera raw files.'
    await act(async () => client.last.reject(message))
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(card()).toHaveTextContent('holiday.jpg')
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('The stage', () => {
  it('has a toolbar with the Picture view, zoom, the background menu and the magnifier', async () => {
    const client = renderApp()
    await openWith(client)
    const toolbar = screen.getByRole('toolbar', { name: 'Stage' })
    expect(within(toolbar).getByRole('radio', { name: 'Picture' })).toBeChecked()
    expect(within(toolbar).getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(toolbar).getByRole('button', { name: '100%' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Magnifier' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('remembers the background chosen', async () => {
    const client = renderApp()
    await openWith(client)
    await userEvent.click(screen.getByRole('button', { name: 'Background' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Checkerboard' }))
    expect(JSON.parse(localStorage.getItem('loupe.stage')!).background).toBe('checker')
  })

  it('toggles the magnifier with L, but not while typing', async () => {
    const client = renderApp()
    await openWith(client)
    const magnifier = () => screen.getByRole('button', { name: 'Magnifier' })
    await userEvent.keyboard('l')
    expect(magnifier()).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('loupe.stage')!).magnifier).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'All tags' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tags' }), 'l')
    await userEvent.keyboard('{Escape}')
    expect(magnifier()).toHaveAttribute('aria-pressed', 'true')
  })

  // The page shows a new picture at once, while the worker still holds the previous file.
  it('reads out no colour until the file has opened', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    act(() => client.last.picture({ type: 'pixels', pixels: client.image, scaled: false, preview: false }))
    // The 4 × 3 picture sits at 100% in the middle of the 800 × 600 stage.
    const stage = document.querySelector<HTMLElement>('[aria-roledescription="picture"]')!
    fireEvent.pointerMove(stage, { clientX: 399, clientY: 299 })
    await act(async () => {})
    expect(client.pixelAsks).toEqual([])
    expect(screen.queryByText(/^x 1, y 0/)).not.toBeInTheDocument()

    await act(async () => client.last.resolve(fakeInfo({ name: 'holiday.jpg', width: 4, height: 3 })))
    fireEvent.pointerMove(stage, { clientX: 399, clientY: 299 })
    await act(async () => {})
    expect(client.pixelAsks).toEqual([{ x: 1, y: 0 }])
    expect(screen.getByText(/^x 1, y 0 · #3C0064/)).toBeInTheDocument()
  })

  it('reads out the point the pointer moved to while a read failed', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    const client = new FakeClient()
    const reads: { resolve: () => void; reject: () => void }[] = []
    client.pixel = (x, y) => {
      client.pixelAsks.push({ x, y })
      return new Promise((resolve, reject) =>
        reads.push({ resolve: () => resolve(pixelAt(client.image, x, y)), reject: () => reject(new Error('gone')) }),
      )
    }
    render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={new FakeProvenance()} />)
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    await act(async () => {
      client.last.picture({ type: 'pixels', pixels: client.image, scaled: false, preview: false })
      client.last.resolve(fakeInfo({ name: 'holiday.jpg', width: 4, height: 3 }))
    })
    const stage = document.querySelector<HTMLElement>('[aria-roledescription="picture"]')!
    fireEvent.pointerMove(stage, { clientX: 399, clientY: 299 })
    fireEvent.pointerMove(stage, { clientX: 400, clientY: 299 })
    expect(client.pixelAsks).toEqual([{ x: 1, y: 0 }])

    await act(async () => reads[0].reject())
    expect(client.pixelAsks).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ])
    await act(async () => reads[1].resolve())
    expect(screen.getByText(/^x 2, y 0 · #780064/)).toBeInTheDocument()
  })

  it('says why there’s no picture, and marks a raw file’s embedded preview', async () => {
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    act(() =>
      client.last.picture({ type: 'none', message: 'Loupe can’t show TIFF pictures yet. Its metadata is listed.' }),
    )
    expect(screen.getByText('Loupe can’t show TIFF pictures yet. Its metadata is listed.')).toBeInTheDocument()

    fireEvent.paste(window, { clipboardData: { files: [new File(['r'], 'a.nef')] } })
    act(() => client.last.picture({ type: 'pixels', pixels: client.image, scaled: false, preview: true }))
    expect(screen.getByText('Embedded preview')).toBeInTheDocument()
  })
})

describe('Location', () => {
  it('shows the place, coordinates and sun in the settings column, leaving the stage on Picture', async () => {
    const client = renderApp()
    const gps = { lat: -44.9405, lon: 168.8263, altitude: 312, direction: null, speed: null, accuracy: 5 }
    const place = {
      type: 'town' as const,
      name: 'Arrowtown',
      region: 'Otago',
      country: 'New Zealand',
      km: 1.3,
      bearing: 0,
    }
    await openWith(client, fakeInfo({ gps, place }))
    expect(screen.getByRole('list', { name: 'Summary' })).toHaveTextContent(
      'Location recorded: Arrowtown, Otago, New Zealand',
    )
    await userEvent.click(tool('Location'))
    expect(screen.getByRole('heading', { name: 'Location' })).toBeInTheDocument()
    expect(screen.getByText('Arrowtown, Otago, New Zealand')).toBeInTheDocument()
    expect(screen.getByText('-44.940500, 168.826300')).toBeInTheDocument()
    expect(screen.getByText(/^The sun was 48° above the horizon/)).toBeInTheDocument()
  })
})

describe('The stage’s views', () => {
  const gps = {
    lat: -44.9405,
    lon: 168.8263,
    altitude: 312,
    direction: { degrees: 312, ref: 'true' as const },
    speed: null,
    accuracy: 5,
  }
  const views = () => within(screen.getByRole('radiogroup', { name: 'View' }))
  const view = (name: string) => views().getByRole('radio', { name })
  const map = () => screen.queryByRole('region', { name: 'Map' })

  afterEach(() => vi.restoreAllMocks())

  it('offers Map only when the picture has a location', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps: null }))
    expect(
      views()
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Picture'])
    await openWith(client, fakeInfo({ gps }))
    expect(
      views()
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Picture', 'Map'])
    expect(view('Picture')).toBeChecked()
  })

  it('switches to Map on opening Location, and back to Picture on leaving it', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps }))
    await userEvent.click(tool('Location'))
    expect(view('Map')).toBeChecked()
    expect(await screen.findByRole('region', { name: 'Map' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /holiday\.jpg/ })).not.toBeInTheDocument()
    await userEvent.click(tool('Privacy'))
    expect(view('Picture')).toBeChecked()
    expect(map()).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /holiday\.jpg/ })).toBeInTheDocument()
  })

  it('switches with the chips, whatever the tool', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps }))
    await userEvent.click(view('Map'))
    expect(view('Map')).toBeChecked()
    expect(await screen.findByRole('region', { name: 'Map' })).toBeInTheDocument()
    await userEvent.click(view('Picture'))
    expect(map()).not.toBeInTheDocument()
  })

  it('keeps the chosen view when a dropped file can’t be opened', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps }))
    await userEvent.click(view('Map'))
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'notimage.txt')] } })
    await act(async () => client.last.reject('Loupe can’t open this file.'))
    expect(await screen.findByRole('radio', { name: 'Map' })).toBeChecked()
  })

  it('goes back to Picture for the next file', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps }))
    await userEvent.click(tool('Location'))
    await openWith(client, fakeInfo({ gps }))
    expect(view('Picture')).toBeChecked()
  })

  it('says the tiles come from OpenStreetMap only once one has loaded', async () => {
    // jsdom has no layout; give the map a size so Leaflet asks for tiles.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    const client = renderApp()
    await openWith(client, fakeInfo({ gps }))
    await userEvent.click(tool('Location'))
    const region = await screen.findByRole('region', { name: 'Map' })
    const caption = 'Map tiles come from OpenStreetMap, which sees the area shown.'
    expect(screen.queryByText(caption)).not.toBeInTheDocument()
    const tiles = await waitFor(() => {
      const found = region.querySelectorAll<HTMLImageElement>('img.leaflet-tile')
      expect(found.length).toBeGreaterThan(0)
      return found
    })
    expect(tiles[0].src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/)
    expect(tiles[0].crossOrigin).toBe('anonymous')
    fireEvent.load(tiles[0])
    expect(await screen.findByText(caption)).toBeInTheDocument()
    expect(region).toHaveTextContent('© OpenStreetMap contributors')
  })

  it('draws the bundled outlines beneath the cone and the sun line', async () => {
    // One square "country" around the pin, as world-atlas's TopoJSON gives it.
    const topology = {
      type: 'Topology',
      objects: {
        countries: {
          type: 'GeometryCollection',
          geometries: [{ type: 'Polygon', arcs: [[0]], id: '554', properties: { name: 'New Zealand' } }],
        },
      },
      arcs: [
        [
          [166, -47],
          [179, -47],
          [179, -34],
          [166, -34],
          [166, -47],
        ],
      ],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(topology)))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    const client = renderApp()
    await openWith(
      client,
      fakeInfo({ gps: { ...gps, lat: -44.9405, lon: 168.8263 }, camera: fakeCamera({ focal35: 52 }) }),
    )
    await userEvent.click(tool('Location'))
    const region = await screen.findByRole('region', { name: 'Map' })
    const land = await waitFor(() => region.querySelector('path.map-land')!)
    const cone = region.querySelector('path.map-cone')!
    const sun = region.querySelector('path.map-sun')!
    // Later in the document is drawn on top.
    expect(land.compareDocumentPosition(cone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(land.compareDocumentPosition(sun) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('asks for no tiles while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    const client = renderApp()
    await openWith(client, fakeInfo({ gps }))
    await userEvent.click(tool('Location'))
    const region = await screen.findByRole('region', { name: 'Map' })
    expect(region.querySelectorAll('img.leaflet-tile')).toHaveLength(0)
    expect(screen.queryByText(/Map tiles come from OpenStreetMap/)).not.toBeInTheDocument()
  })
})

describe('Info', () => {
  it('shows the summary findings and the sections', async () => {
    const client = renderApp()
    await openWith(
      client,
      fakeInfo({ gps: { lat: -44.9405, lon: 168.8263, altitude: null, direction: null, speed: null, accuracy: null } }),
    )
    const findings = screen.getByRole('list', { name: 'Summary' })
    expect(findings).toHaveTextContent('Taken on 12 March 2025 at 14:32 (UTC+13:00)')
    expect(findings).toHaveTextContent('Location recorded')
    expect(findings).toHaveTextContent('Stated in the file’s metadata')
    for (const name of ['Picture', 'Camera', 'Dates', 'Histogram'])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    expect(screen.getByText('4032 × 3024, 12.2 MP, 4:3')).toBeInTheDocument()
    expect(screen.getByText('Apple iPhone 15 Pro')).toBeInTheDocument()
  })

  it('lists what wasn’t found last, as a line of small print rather than a finding', async () => {
    const client = renderApp()
    const gps = { lat: 1, lon: 2, altitude: null, direction: null, speed: null, accuracy: null }
    await openWith(client, fakeInfo({ gps, dates: { taken: null, digitised: null, modified: null, gpsUtc: null } }))
    const items = within(screen.getByRole('list', { name: 'Summary' })).getAllByRole('listitem')
    const last = items.at(-1)!
    expect(items[0]).toHaveTextContent('Location recorded')
    expect(last).toHaveTextContent(/^No date taken recorded\. The file itself is dated .+\.$/)
    expect(last).not.toHaveTextContent('Nothing found in the file’s metadata.')
    expect(last).toHaveClass('text-xs')
  })

  it('opens Location from its finding', async () => {
    const client = renderApp()
    await openWith(
      client,
      fakeInfo({ gps: { lat: 1, lon: 2, altitude: null, direction: null, speed: null, accuracy: null } }),
    )
    await userEvent.click(screen.getByRole('button', { name: /Location recorded/ }))
    expect(tool('Location')).toBeChecked()
  })

  it('marks serial numbers as identifying the camera', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ camera: fakeCamera({ bodySerial: 'SN-123' }) }))
    expect(screen.getByText('SN-123')).toBeInTheDocument()
    expect(screen.getByText('Identifies this camera.')).toBeInTheDocument()
  })

  it('says “Reading metadata…” until ImageInfo arrives', async () => {
    renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    expect(screen.getByRole('heading', { name: 'Info' })).toBeInTheDocument()
    expect(screen.getAllByText('Reading metadata…').length).toBeGreaterThan(0)
  })

  it('draws the histogram once the pixels arrive, with how much is clipped', async () => {
    const client = renderApp()
    await openWith(client)
    await waitFor(() => expect(screen.getByRole('img', { name: /Histogram/ })).toBeInTheDocument())
    expect(screen.getByText(/clipped/)).toBeInTheDocument()
  })

  it('copies the summary as text', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const client = renderApp()
    await openWith(client)
    await userEvent.click(screen.getByRole('button', { name: 'Copy summary' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('File: holiday.jpg\nTaken: Taken on 12 March 2025'))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})

describe('All tags', () => {
  it('lists every tag by group, filters by name or value, and copies as text or JSON', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const client = renderApp()
    await openWith(client)
    await userEvent.click(screen.getByRole('button', { name: 'All tags' }))
    const sheet = screen.getByRole('dialog', { name: 'All tags' })
    expect(within(sheet).getByRole('heading', { name: 'EXIF' })).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: 'XMP' })).toBeInTheDocument()
    expect(within(sheet).getByText('Camera Model Name')).toBeInTheDocument()

    await userEvent.type(within(sheet).getByRole('searchbox', { name: 'Search tags' }), '17.4')
    expect(within(sheet).queryByText('Camera Model Name')).not.toBeInTheDocument()
    expect(within(sheet).getByText('Creator Tool')).toBeInTheDocument()
    expect(within(sheet).queryByRole('heading', { name: 'EXIF' })).not.toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: 'Copy as text' }))
    expect(writeText).toHaveBeenLastCalledWith(
      'IFD0: Make: Apple\nIFD0: Model: iPhone 15 Pro\nXMP-xmp: CreatorTool: 17.4',
    )
    await userEvent.click(within(sheet).getByRole('button', { name: 'Copy as JSON' }))
    expect(writeText).toHaveBeenLastCalledWith('[{"SourceFile":"/image.jpg"}]')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'All tags' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All tags' })).toHaveFocus()
  })
})

describe('In a browser without WebAssembly or Web Workers', () => {
  it('says the browser is too old and shows nothing else on the stage', () => {
    renderApp({ supported: false })
    expect(screen.getByRole('heading', { name: 'This browser is too old for Loupe' })).toBeInTheDocument()
    expect(screen.getByText(/needs WebAssembly and Web Workers/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Drop an image here' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose file' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Choose file')).not.toBeInTheDocument()
  })

  it('ignores dropped and pasted files', () => {
    const client = renderApp({ supported: false })
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [photo()] } })
    fireEvent.paste(window, { clipboardData: { files: [photo()] } })
    expect(client.opens).toHaveLength(0)
  })
})

describe('About', () => {
  it('says in two sentences what leaves the device, and links the source', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    expect(within(about).getByText(/never sends your pictures anywhere/)).toBeInTheDocument()
    expect(within(about).getByText(/fetches only OpenStreetMap’s map tiles/)).toBeInTheDocument()
    expect(within(about).getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/HyphenSam/Loupe',
    )
  })

  it('says how much the first visit downloads to work offline', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    expect(within(about).getByRole('heading', { name: 'Working offline' })).toBeInTheDocument()
    expect(
      within(about).getByText(/The first visit downloads everything Loupe needs, about 19 MB,/),
    ).toBeInTheDocument()
  })

  it('credits ExifTool, zeroperl, jSquash and its decoders, libheif, Leaflet, OpenStreetMap and the C2PA SDK', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    for (const name of [
      'ExifTool',
      'zeroperl',
      'jSquash',
      'MozJPEG',
      'libwebp',
      'libjxl',
      'libheif',
      'Leaflet',
      'OpenStreetMap',
    ])
      expect(within(about).getByRole('link', { name })).toBeInTheDocument()
    for (const name of ['C2PA SDK', 'C2PA trust list', 'Interim trust list'])
      expect(within(about).getByRole('link', { name })).toBeInTheDocument()
  })

  it('credits Export’s encoders: MozJPEG, libwebp, libavif, libjxl and oxipng (SPEC.md 6.11)', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    const credit = (name: string) => within(about).getByRole('link', { name }).closest('li')?.textContent ?? ''
    expect(credit('MozJPEG')).toMatch(/encodes JPEG/)
    expect(credit('libwebp')).toMatch(/encodes WebP/)
    expect(credit('libavif')).toMatch(/encodes AVIF/)
    expect(credit('libjxl')).toMatch(/encodes JPEG XL/)
    expect(credit('oxipng')).toMatch(/PNG/)
    expect(within(about).getByRole('link', { name: 'oxipng' })).toHaveAttribute(
      'href',
      'https://github.com/oxipng/oxipng',
    )
  })

  it('credits libjpeg-turbo with the notice its licence asks for', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    expect(within(about).getByRole('link', { name: 'libjpeg-turbo' })).toHaveAttribute(
      'href',
      'https://libjpeg-turbo.org/',
    )
    expect(
      within(about).getByText('This software is based in part on the work of the Independent JPEG Group.'),
    ).toBeInTheDocument()
  })

  it('credits PaddleOCR and ONNX Runtime, and says what text recognition downloads (SPEC.md 6.12)', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    const credit = (name: string) => within(about).getByRole('link', { name }).closest('li')?.textContent ?? ''
    expect(credit('PaddleOCR')).toMatch(/Apache-2.0/)
    expect(credit('ONNX Runtime')).toMatch(/MIT/)
    expect(within(about).getByRole('heading', { name: 'Text recognition' })).toBeInTheDocument()
    expect(
      within(about).getByText(
        /downloaded from Loupe’s own site only when you ask for it in the Text tool, 25 to 38 MB/,
      ),
    ).toHaveTextContent(/the picture never leaves your device/)
  })

  it('says when the bundled trust lists were fetched', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Loupe' })).toHaveTextContent('bundled on 25 November 2026'),
    )
  })
})

describe('AI check', () => {
  const read = (store = fakeStore()) => ({ store, thumbnails: { 'self#jumbf=ingredient.jpg': new Blob(['j']) } })
  const withIngredient = () =>
    fakeStore({
      manifests: {
        'urn:c2pa:1': {
          ...fakeStore().manifests!['urn:c2pa:1'],
          ingredients: [
            {
              title: 'sketch.png',
              relationship: 'parentOf',
              thumbnail: { format: 'image/jpeg', identifier: 'self#jumbf=ingredient.jpg' },
            },
          ],
        },
      },
    })

  it('reads the file’s Content Credentials as it opens, and waits for them', async () => {
    const client = renderApp()
    await openWith(client)
    expect(provenance.last.file.name).toBe('holiday.jpg')
    await userEvent.click(tool('AI check'))
    expect(screen.getByText('Reading Content Credentials…')).toBeInTheDocument()
  })

  it('shows the verdict, who signed them, when, with what, the actions, ingredients and the trust list caption', async () => {
    const client = renderApp()
    await openWith(client)
    await act(async () => provenance.last.resolve(read(withIngredient())))
    await userEvent.click(tool('AI check'))
    const verdict = screen.getByRole('list', { name: 'Verdict' })
    expect(verdict).toHaveTextContent('Made with AI')
    expect(verdict).toHaveTextContent('Signed by OpenAI and verified.')
    const credentials = screen.getByRole('region', { name: 'Content Credentials' })
    expect(credentials).toHaveTextContent('OpenAI')
    expect(credentials).toHaveTextContent('20 November 2026 at 10:00 (UTC)')
    expect(credentials).toHaveTextContent('ChatGPT')
    expect(credentials).toHaveTextContent('Verified')
    expect(credentials).toHaveTextContent(
      'Its signer is on the C2PA trust list. Checked against the trust list bundled on 25 November 2026.',
    )
    expect(screen.getByRole('region', { name: 'Actions' })).toHaveTextContent(
      'CreatedMade with generative AIBy GPT-4o.',
    )
    const ingredients = screen.getByRole('region', { name: 'Ingredients' })
    expect(ingredients).toHaveTextContent('sketch.png')
    expect(ingredients).toHaveTextContent('Edited from')
    expect(within(ingredients).getByRole('img', { name: 'sketch.png' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^blob:/),
    )
  })

  it('says when there are none, resting the verdict on there being nothing', async () => {
    const client = renderApp()
    await openWith(client)
    await act(async () => provenance.last.resolve(null))
    await userEvent.click(tool('AI check'))
    expect(screen.getByRole('list', { name: 'Verdict' })).toHaveTextContent('No AI markers found')
    expect(screen.getByRole('region', { name: 'Content Credentials' })).toHaveTextContent('None in this file.')
  })

  it('shows the Digital Source Type in plain words, with the term as stated', async () => {
    const client = renderApp()
    const term = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
    await openWith(client, fakeInfo({ name: 'holiday.jpg', sourceType: term }))
    await act(async () => provenance.last.resolve(null))
    await userEvent.click(tool('AI check'))
    expect(screen.getByRole('list', { name: 'Verdict' })).toHaveTextContent('Says it was made with AI')
    const section = screen.getByRole('region', { name: 'Digital Source Type' })
    expect(section).toHaveTextContent('Made with generative AI')
    expect(section).toHaveTextContent(term)
  })

  it('still gives the metadata’s verdict when the credentials can’t be read, and says why', async () => {
    const client = renderApp()
    await openWith(client)
    await act(async () => provenance.last.reject('no wasm'))
    await userEvent.click(tool('AI check'))
    expect(screen.getByRole('list', { name: 'Verdict' })).toHaveTextContent('No AI markers found')
    expect(screen.getByRole('region', { name: 'Content Credentials' })).toHaveTextContent(
      'Loupe couldn’t read the Content Credentials: no wasm',
    )
  })

  /** Opens a file whose metadata names `generators`, past the Content Credentials, on the AI check. */
  async function openGenerated(client: FakeClient, generators: GeneratorFinding[]) {
    await openWith(client, fakeInfo({ name: 'holiday.png', generators }))
    await act(async () => provenance.last.resolve(null))
    await userEvent.click(tool('AI check'))
  }

  const comfy = finding('ComfyUI', 'the PNG text chunks “prompt” and “workflow”', {
    prompt: 'a lighthouse at dusk',
    negative: 'blurry',
    model: 'sdxl.safetensors',
    seed: '42',
    steps: '30',
    loras: [{ name: 'film.safetensors', weight: '0.8' }],
    rest: [{ label: 'Scheduler', value: 'karras' }],
    workflow: { json: '{"nodes": []}', nodes: 25 },
  })

  it('shows a generator’s prompts and settings, where they were found, and the verdict naming it', async () => {
    const client = renderApp()
    await openGenerated(client, [comfy])
    expect(screen.getByRole('list', { name: 'Verdict' })).toHaveTextContent('Says it was made with AI in ComfyUI')
    const section = screen.getByRole('region', { name: 'ComfyUI' })
    expect(within(section).getByRole('region', { name: 'Prompt' })).toHaveTextContent('a lighthouse at dusk')
    expect(within(section).getByRole('region', { name: 'Negative prompt' })).toHaveTextContent('blurry')
    expect(section).toHaveTextContent('Modelsdxl.safetensors')
    expect(section).toHaveTextContent('Seed42')
    expect(section).toHaveTextContent('LoRAfilm.safetensorsWeight 0.8.')
    expect(section).toHaveTextContent('Schedulerkarras')
    expect(section).toHaveTextContent(
      'Found in the PNG text chunks “prompt” and “workflow”. Stated in the file’s metadata; anyone can add or remove it.',
    )
  })

  it('copies the prompt, and expands a long one', async () => {
    const user = userEvent.setup()
    const client = renderApp()
    const long = 'masterpiece, best quality, '.repeat(20).trim()
    await openGenerated(client, [{ ...comfy, prompt: long }])
    const prompt = screen.getByRole('region', { name: 'Prompt' })
    await user.click(within(prompt).getByRole('button', { name: 'Copy prompt' }))
    expect(await navigator.clipboard.readText()).toBe(long)
    const more = within(prompt).getByRole('button', { name: 'Show all' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(within(prompt).getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('doesn’t offer to expand a short prompt', async () => {
    const client = renderApp()
    await openGenerated(client, [comfy])
    const prompt = screen.getByRole('region', { name: 'Prompt' })
    expect(within(prompt).queryByRole('button', { name: 'Show all' })).toBeNull()
  })

  it('saves ComfyUI’s workflow as the file’s stem and “workflow.json”, saying how many nodes it holds', async () => {
    const client = renderApp()
    const saved = saving()
    await openGenerated(client, [comfy])
    const section = screen.getByRole('region', { name: 'ComfyUI' })
    expect(section).toHaveTextContent('Its workflow holds 25 nodes.')
    await userEvent.click(within(section).getByRole('button', { name: 'Save workflow' }))
    await waitFor(() =>
      expect(saved).toEqual([{ name: 'holiday workflow.json', text: '{"nodes": []}', type: 'application/json' }]),
    )
  })

  describe('Check on SynthID', () => {
    const CAPTION =
      'Opens synthid.com in a new tab with the picture copied, ready to paste. Google sees the picture there; it asks you to sign in and limits checks a day.'
    let written: ClipboardItem[][]
    let opened: unknown[][]
    // userEvent's setup may have made the clipboard a getter.
    const clipboard = (value: object) =>
      Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true })

    beforeEach(() => {
      written = []
      opened = []
      vi.stubGlobal(
        'ClipboardItem',
        class {
          constructor(public items: Record<string, Blob | Promise<Blob>>) {}
        },
      )
      clipboard({ write: async (items: ClipboardItem[]) => void written.push(items) })
      vi.spyOn(window, 'open').mockImplementation((...args: unknown[]) => {
        opened.push(args)
        return null
      })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('makes the PNG when the tool opens, then copies it and opens synthid.com', async () => {
      const client = renderApp()
      await openGenerated(client, [])
      expect(client.pngRequests).toBe(1)
      const section = screen.getByRole('region', { name: 'Check for a watermark' })
      expect(section).toHaveTextContent(CAPTION)
      await userEvent.click(within(section).getByRole('button', { name: 'Check on SynthID' }))
      const [[item]] = written
      expect(await (item as unknown as { items: Record<string, Promise<Blob> | Blob> }).items['image/png']).toBe(
        client.pngResult,
      )
      expect(opened).toEqual([['https://synthid.com/', '_blank', 'noopener']])
    })

    it('still opens the site when copying fails, and offers a PNG copy to save instead', async () => {
      const client = renderApp()
      const saved = saving()
      clipboard({ write: async () => Promise.reject(new DOMException('denied')) })
      await openGenerated(client, [])
      const section = screen.getByRole('region', { name: 'Check for a watermark' })
      await userEvent.click(within(section).getByRole('button', { name: 'Check on SynthID' }))
      expect(opened).toHaveLength(1)
      expect(section).toHaveTextContent('Copying didn’t work here. Save a PNG copy and upload it there instead.')
      await userEvent.click(within(section).getByRole('button', { name: 'Save a PNG copy' }))
      await waitFor(() => expect(saved).toEqual([{ name: 'holiday.png', text: 'png', type: 'image/png' }]))
    })

    it('saves the PNG, then opens the site, where the clipboard can’t take pictures', async () => {
      const client = renderApp({ capabilities: { ...ALL_CAPABLE, clipboardImage: false } })
      const saved = saving()
      await openGenerated(client, [])
      const section = screen.getByRole('region', { name: 'Check for a watermark' })
      expect(section).toHaveTextContent('Saves a PNG copy and opens synthid.com in a new tab, to upload it there.')
      await userEvent.click(within(section).getByRole('button', { name: 'Check on SynthID' }))
      await waitFor(() => expect(saved).toEqual([{ name: 'holiday.png', text: 'png', type: 'image/png' }]))
      expect(written).toEqual([])
      expect(opened).toHaveLength(1)
    })

    it('can’t check a picture Loupe can’t show, and says why', async () => {
      const client = renderApp()
      client.pngResult = 'Loupe can’t show TIFF pictures yet. Its metadata is listed.'
      await openGenerated(client, [])
      const section = screen.getByRole('region', { name: 'Check for a watermark' })
      await waitFor(() => expect(section).toHaveTextContent('Loupe can’t show TIFF pictures yet.'))
      expect(within(section).getByRole('button', { name: 'Check on SynthID' })).toBeDisabled()
    })
  })

  it('puts its verdict in Info’s summary once read, opening the AI check', async () => {
    const client = renderApp()
    await openWith(client)
    const summary = screen.getByRole('list', { name: 'Summary' })
    expect(summary).toHaveTextContent('Reading Content Credentials…')
    await act(async () => provenance.last.resolve(read()))
    expect(summary).not.toHaveTextContent('Reading Content Credentials…')
    await userEvent.click(within(summary).getByRole('button', { name: /Made with AI/ }))
    expect(tool('AI check')).toBeChecked()
  })
})
