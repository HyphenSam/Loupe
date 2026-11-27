// @vitest-environment jsdom
// Privacy (SPEC.md 6.4), and the job slot and exports strip it's the first tool to use (section 7).
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { Capabilities } from './lib/capabilities'
import type { ImageInfo, Tag } from './lib/info'
import { EVERYTHING_ARGS } from './lib/privacy'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo, fakeStore } from './lib/testing'

const photo = () => new File([new Uint8Array(2_400)], 'holiday.jpg', { type: 'image/jpeg' })
const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const strip = () => screen.getByRole('region', { name: 'Exports' })

const tag = (family: string, group: string, name: string, value: string, label = name): Tag => ({
  family,
  group,
  name,
  label,
  value,
})
const GPS = { lat: -44.9405, lon: 168.8263, altitude: null, direction: null, speed: null, accuracy: null }
const NO_DATES = { taken: null, digitised: null, modified: null, gpsUtc: null }
/** A photo with a location, a serial number and an artist. */
const located = (over: Partial<ImageInfo> = {}) =>
  fakeInfo({
    name: 'holiday.jpg',
    size: 2_400,
    camera: null,
    dates: NO_DATES,
    gps: GPS,
    tags: [
      tag('EXIF', 'GPS', 'GPSLatitude', '44 deg S', 'GPS Latitude'),
      tag('EXIF', 'ExifIFD', 'SerialNumber', 'LT0012345', 'Serial Number'),
      tag('EXIF', 'IFD0', 'Artist', 'Sam'),
    ],
    ...over,
  })

let provenance: FakeProvenance

function renderApp(capabilities: Capabilities = ALL_CAPABLE) {
  const client = new FakeClient()
  provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={capabilities} provenance={provenance} />)
  return client
}

/** Opens a photo, lets the worker answer with `info` and the C2PA SDK find nothing, then opens Privacy. */
async function openPrivacy(client: FakeClient, info: ImageInfo = located(), credentials = false) {
  await userEvent.upload(screen.getByLabelText('Choose file'), photo())
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
    provenance.last.resolve(credentials ? { store: fakeStore(), thumbnails: {} } : null)
  })
  await userEvent.click(tool('Privacy'))
}

const remove = () => screen.getByRole('button', { name: 'Remove' })
const box = (name: RegExp) => screen.getByRole('checkbox', { name })

let urls = 0
beforeEach(() => {
  localStorage.clear()
  urls = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:loupe/${++urls}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Privacy', () => {
  it('waits for the Content Credentials, as the AI check does', async () => {
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    await act(async () => client.last.resolve(located()))
    await userEvent.click(tool('Privacy'))
    expect(screen.getByText('Reading Content Credentials…')).toBeInTheDocument()
    await act(async () => provenance.last.resolve({ store: fakeStore(), thumbnails: {} }))
    expect(screen.queryByText('Reading Content Credentials…')).not.toBeInTheDocument()
    expect(box(/Content Credentials/)).toBeChecked()
  })

  it('lists what could identify someone, grouped, every finding ticked', async () => {
    const client = renderApp()
    await openPrivacy(client)
    for (const group of ['Location', 'Device', 'People'])
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Location' })).getByRole('checkbox')).toHaveAccessibleName(
      'GPS position -44.94050, 168.82630',
    )
    for (const b of screen.getAllByRole('checkbox')) expect(b).toBeChecked()
    expect(screen.getByText(/Always kept: the colour profile and the picture’s orientation/)).toBeInTheDocument()
  })

  it('has quick picks for everything and for the location only; unticking keeps a finding', async () => {
    const client = renderApp()
    await openPrivacy(client)
    await userEvent.click(screen.getByRole('button', { name: 'Location only' }))
    expect(box(/GPS position/)).toBeChecked()
    expect(box(/Serial Number/)).not.toBeChecked()
    expect(box(/Artist/)).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Everything' }))
    expect(box(/Artist/)).toBeChecked()
    await userEvent.click(box(/Artist/))
    await userEvent.click(remove())
    expect(client.runs[0].plan.args).toEqual(['-GPS:GPSLatitude=', '-ExifIFD:SerialNumber='])
  })

  it('removes losslessly into “(cleaned)”, then says nothing identifying is left', async () => {
    const client = renderApp()
    await openPrivacy(client)
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(
      screen.getByText('Only metadata is removed; the picture’s bytes are copied as they are.'),
    ).toBeInTheDocument()
    await userEvent.click(remove())
    expect(client.runs[0].plan).toMatchObject({ name: 'holiday (cleaned).jpg', args: EVERYTHING_ARGS })
    expect(screen.getByRole('progressbar', { name: 'Removing holiday (cleaned).jpg' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    const blob = new Blob([new Uint8Array(800)], { type: 'image/jpeg' })
    const after = fakeInfo({ name: 'holiday (cleaned).jpg', tags: [], camera: null, dates: NO_DATES })
    await act(async () => client.runs[0].resolve({ blob, info: after }))
    const card = within(strip()).getByRole('listitem')
    expect(card).toHaveTextContent('holiday (cleaned).jpg')
    expect(card).toHaveTextContent('800 B · −67%')
    expect(card).toHaveTextContent('Nothing identifying is left.')
    expect(screen.getByRole('status', { name: 'Latest export' })).toHaveTextContent(
      'holiday (cleaned).jpg is ready to download.',
    )
    expect(remove()).toHaveFocus()
  })

  it('lists what the result still holds, and why', async () => {
    const client = renderApp()
    await openPrivacy(client)
    await userEvent.click(remove())
    const after = located({ name: 'holiday (cleaned).jpg', tags: [tag('EXIF', 'IFD0', 'Artist', 'Sam')], gps: null })
    await act(async () => client.runs[0].resolve({ blob: new Blob(['x']), info: after }))
    expect(within(strip()).getByRole('listitem')).toHaveTextContent(
      'Artist: ExifTool couldn’t remove it from this JPEG file.',
    )
  })

  it('says when nothing identifies anyone, and offers no action', async () => {
    const client = renderApp()
    await openPrivacy(client, fakeInfo({ tags: [], camera: null, dates: NO_DATES }))
    expect(screen.getByText('Nothing in this file identifies a person or a place.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('says it can’t write a BMP', async () => {
    const client = renderApp()
    await openPrivacy(client, located({ format: 'bmp', formatName: 'BMP' }))
    expect(screen.getByText('Loupe can’t change metadata in a BMP file.')).toBeInTheDocument()
    expect(remove()).toBeDisabled()
  })

  it('cancels a running job: “Cancelling…” until the new worker is ready, and nothing is added', async () => {
    const client = renderApp()
    await openPrivacy(client)
    await userEvent.click(remove())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Cancelling…')
    await act(async () => client.cancels[0].resolve())
    expect(remove()).toBeEnabled()
    expect(screen.queryByRole('region', { name: 'Exports' })).not.toBeInTheDocument()
  })

  it('says so when the file couldn’t be opened again after cancelling', async () => {
    const client = renderApp()
    await openPrivacy(client)
    await userEvent.click(remove())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const sentence = 'Loupe couldn’t open “holiday.jpg” again. No. Choose the file again to carry on.'
    await act(async () => client.cancels[0].reject(sentence))
    expect(screen.getByRole('alert')).toHaveTextContent(sentence)
    expect(remove()).toBeEnabled()
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks before opening another file while a job runs', async () => {
    const client = renderApp()
    await openPrivacy(client)
    await userEvent.click(remove())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    expect(confirm).toHaveBeenCalledWith('Cancel the running job and open the new file?')
    expect(client.opens).toHaveLength(1)
    confirm.mockReturnValue(true)
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    expect(client.cancels).toHaveLength(1)
    expect(client.opens).toHaveLength(2)
  })
})

describe('The exports strip', () => {
  async function cleaned(client: FakeClient) {
    await openPrivacy(client)
    await userEvent.click(remove())
    const blob = new Blob([new Uint8Array(800)], { type: 'image/jpeg' })
    const after = fakeInfo({ name: 'holiday (cleaned).jpg', orientation: 6, tags: [], camera: null, dates: NO_DATES })
    await act(async () => client.runs[0].resolve({ blob, info: after }))
    return blob
  }

  const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('downloads a result, after which leaving no longer asks', async () => {
    const client = renderApp()
    await cleaned(client)
    expect(leaving()).toBe(true)
    const link = within(strip()).getByRole('link', { name: 'Download' })
    expect(link.getAttribute('href')).toMatch(/^blob:loupe\//)
    expect(link).toHaveAttribute('download', 'holiday (cleaned).jpg')
    link.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(link)
    expect(leaving()).toBe(false)
  })

  it('copies a result as a PNG', async () => {
    const client = renderApp()
    const blob = await cleaned(client)
    const write = vi.fn(() => Promise.resolve())
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, unknown>) {}
      },
    )
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } })
    await userEvent.click(within(strip()).getByRole('button', { name: 'Copy' }))
    expect(client.pngSources).toEqual([{ blob, format: 'jpeg', orientation: 6 }])
    expect(write).toHaveBeenCalledOnce()
    expect(leaving()).toBe(false)
  })

  it('has no Copy where the clipboard takes no images', async () => {
    const client = renderApp({ ...ALL_CAPABLE, clipboardImage: false })
    await cleaned(client)
    expect(within(strip()).queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument()
  })

  it('opens a result in Loupe as the source, keeping the strip', async () => {
    const client = renderApp()
    await cleaned(client)
    await userEvent.click(within(strip()).getByRole('button', { name: 'Open in Loupe' }))
    expect(client.opens).toHaveLength(2)
    expect(client.last.file.name).toBe('holiday (cleaned).jpg')
    expect(client.last.file.type).toBe('image/jpeg')
    expect(strip()).toHaveTextContent('holiday (cleaned).jpg')
    expect(leaving()).toBe(false)
  })

  it('shows a failed job in the strip with its reason', async () => {
    const client = renderApp()
    await openPrivacy(client)
    await userEvent.click(remove())
    await act(async () => client.runs[0].reject('ExifTool couldn’t change this file: it broke.'))
    expect(within(strip()).getByRole('listitem')).toHaveTextContent('ExifTool couldn’t change this file: it broke.')
  })

  it('removes a result', async () => {
    const client = renderApp()
    await cleaned(client)
    const url = within(strip()).getByRole('link', { name: 'Download' }).getAttribute('href')
    await userEvent.click(within(strip()).getByRole('button', { name: 'Remove holiday (cleaned).jpg' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    expect(screen.queryByRole('region', { name: 'Exports' })).not.toBeInTheDocument()
  })
})

describe('Info’s privacy finding', () => {
  it('counts what could identify someone, linking to Privacy, once the Content Credentials are read', async () => {
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    await act(async () => client.last.resolve(located()))
    const summary = () => screen.getByRole('list', { name: 'Summary' })
    expect(summary()).not.toHaveTextContent('could identify')
    await act(async () => provenance.last.resolve(null))
    await userEvent.click(
      within(summary()).getByRole('button', { name: /3 things in this file could identify a person or place\./ }),
    )
    expect(tool('Privacy')).toBeChecked()
  })

  it('says when nothing identifying is found', async () => {
    const client = renderApp()
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    await act(async () => {
      client.last.resolve(fakeInfo({ tags: [], camera: null, dates: NO_DATES }))
      provenance.last.resolve(null)
    })
    expect(screen.getByRole('list', { name: 'Summary' })).toHaveTextContent('Nothing identifying found.')
  })
})
