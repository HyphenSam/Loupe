// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { Capabilities } from './lib/capabilities'
import { ALL_CAPABLE, FakeClient, fakeCamera, fakeInfo } from './lib/testing'

const photo = () => new File([new Uint8Array(2_400)], 'holiday.jpg', { type: 'image/jpeg' })
const rail = () => screen.getByRole('radiogroup', { name: 'Tools' })
const tool = (name: string) => within(rail()).getByRole('radio', { name })
const tools = (group: string) =>
  within(within(rail()).getByRole('group', { name: group }))
    .getAllByRole('radio')
    .map((t) => t.textContent)
const card = () => screen.getByRole('region', { name: 'Open file' })

function renderApp({ supported = true, capabilities = ALL_CAPABLE }: { supported?: boolean; capabilities?: Capabilities } = {}) {
  const client = new FakeClient()
  render(<App supported={supported} client={client} capabilities={capabilities} />)
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

describe('The tool rail', () => {
  it('shows the eleven tools in two groups, Inspect and Edit', () => {
    renderApp()
    expect(tools('Inspect')).toEqual(['Info', 'Location', 'AI check', 'Privacy', 'Forensics', 'Extract'])
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
    expect(tool('Adjust')).toHaveAccessibleDescription(
      'Loupe can’t edit TIFF or raw pictures. Extract the preview to edit that instead.',
    )
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
    const message = 'Loupe can’t open this file. It reads JPEG, PNG, WebP, AVIF, HEIC, JPEG XL, GIF, BMP, TIFF and camera raw files.'
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

  it('says why there’s no picture, and marks a raw file’s embedded preview', async () => {
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    act(() => client.last.picture({ type: 'none', message: 'Loupe can’t show TIFF pictures yet. Its metadata is listed.' }))
    expect(screen.getByText('Loupe can’t show TIFF pictures yet. Its metadata is listed.')).toBeInTheDocument()

    fireEvent.paste(window, { clipboardData: { files: [new File(['r'], 'a.nef')] } })
    act(() => client.last.picture({ type: 'pixels', pixels: client.image, scaled: false, preview: true }))
    expect(screen.getByText('Embedded preview')).toBeInTheDocument()
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
    for (const name of ['Picture', 'Camera', 'Dates', 'Histogram']) expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    expect(screen.getByText('4032 × 3024, 12.2 MP, 4:3')).toBeInTheDocument()
    expect(screen.getByText('Apple iPhone 15 Pro')).toBeInTheDocument()
  })

  it('opens Location from its finding', async () => {
    const client = renderApp()
    await openWith(client, fakeInfo({ gps: { lat: 1, lon: 2, altitude: null, direction: null, speed: null, accuracy: null } }))
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
    expect(writeText).toHaveBeenLastCalledWith('IFD0: Make: Apple\nIFD0: Model: iPhone 15 Pro\nXMP-xmp: CreatorTool: 17.4')
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
    expect(within(about).getByText(/OpenStreetMap/)).toBeInTheDocument()
    expect(within(about).getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/HyphenSam/Loupe',
    )
  })

  it('credits ExifTool, zeroperl, jSquash and its decoders, and libheif', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    for (const name of ['ExifTool', 'zeroperl', 'jSquash', 'MozJPEG', 'libwebp', 'libjxl', 'libheif'])
      expect(within(about).getByRole('link', { name })).toBeInTheDocument()
  })
})
