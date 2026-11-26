// @vitest-environment jsdom
// Text (SPEC.md 6.12): the Script select, downloading the files, reading the picture, the lines and copying them,
// and the Text stage view's boxes.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { ImageInfo } from './lib/info'
import { filesFor } from './lib/ocr/files'
import { TEXT_CACHE, type Models } from './lib/ocr/models'
import type { Script } from './lib/ocr/scripts'
import {
  ALL_CAPABLE,
  FakeCaches,
  FakeClient,
  FakeProvenance,
  FakeServer,
  fakeInfo,
  fakeLine,
  fakeModels,
} from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const chip = (name: string) => within(screen.getByRole('radiogroup', { name: 'View' })).queryByRole('radio', { name })
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const lines = () => within(screen.getByRole('list', { name: 'Lines' })).getAllByRole('listitem')
/** Text the tool shows, not its announcement for screen readers. */
const shown = (text: string) => screen.getByText(text, { ignore: '.sr-only' })
const box = (index: number) => document.querySelector(`[data-line="${index}"]`)!

const shot = fakeInfo({
  name: 'shot.png',
  format: 'png',
  formatName: 'PNG',
  lossless: true,
  jpeg: null,
  width: 400,
  height: 300,
  displayWidth: 400,
  displayHeight: 300,
})

const READ = [fakeLine('Opening hours', 10, 10), fakeLine('Mon–Fri 9–5', 10, 40, 0.3), fakeLine('Sat 10–2', 10, 70)]

let models: Models
let server: FakeServer
let caches: FakeCaches
let client: FakeClient
let writes: string[]

beforeEach(() => {
  localStorage.clear()
  const fake = fakeModels()
  models = fake.models
  server = new FakeServer(fake.bytes)
  caches = new FakeCaches()
  client = new FakeClient()
  writes = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:loupe/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => void writes.push(text) },
  })
})
afterEach(() => vi.restoreAllMocks())

/** Puts a script's files in the cache, as an earlier visit's download left them. */
async function hold(script: Script) {
  const cache = await caches.open(TEXT_CACHE)
  for (const file of filesFor(script, models))
    await cache.put(`${server.origin}/${file.path}`, new Response(server.files.get(file.path)))
}

async function openText(info: ImageInfo = shot) {
  const provenance = new FakeProvenance()
  render(
    <App
      supported
      client={client}
      capabilities={ALL_CAPABLE}
      provenance={provenance}
      textStore={{ fetch: server.fetch, caches, origin: server.origin }}
      textModels={models}
    />,
  )
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], info.name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
    provenance.last.resolve(null)
  })
  await userEvent.click(tool('Text'))
}

/** Answers the latest read with `read`. */
async function answer(read: typeof READ) {
  await waitFor(() => expect(client.texts.length).toBeGreaterThan(0))
  await act(async () => client.texts[client.texts.length - 1].resolve(read))
}

describe('the Text tool', () => {
  it('sits in Inspect after Forensics and is dimmed for TIFF', async () => {
    await openText(fakeInfo({ name: 'scan.tif', format: 'tiff', formatName: 'TIFF' }))
    const inspect = within(screen.getByRole('group', { name: 'Inspect' })).getAllByRole('radio')
    expect(inspect.map((r) => r.querySelector('span')?.textContent)).toEqual([
      'Info',
      'Location',
      'AI check',
      'Privacy',
      'Forensics',
      'Text',
      'Extract',
    ])
    expect(screen.getAllByText('Loupe can’t show TIFF pictures yet, so it can’t read their text.')).not.toHaveLength(0)
    expect(client.texts).toHaveLength(0)
  })

  it('downloads nothing until asked, and says what the download is', async () => {
    await openText()
    expect(screen.getByRole('combobox', { name: 'Script' })).toHaveValue('latin-cjk')
    expect(screen.getByText(/runs on this device.*the picture never leaves your device/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Download (about 4 MB)' })).toBeEnabled()
    expect(server.requests).toEqual([])
    expect(client.texts).toHaveLength(0)
  })

  it('downloads with progress, then reads the picture line by line', async () => {
    await openText()
    server.holding = true
    await userEvent.click(await screen.findByRole('button', { name: 'Download (about 4 MB)' }))
    expect(await screen.findByText(/^\d\.\d of 4 MB$/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Downloading text recognition' })).toBeInTheDocument()
    server.holding = false
    act(() => server.release())
    await waitFor(() => expect(client.texts).toHaveLength(1))
    expect(client.texts[0].script).toBe('latin-cjk')
    expect(shown('Reading text…')).toBeInTheDocument()
    act(() => client.texts[0].progress({ line: 2, lines: 3 }))
    expect(screen.getByText('Reading line 2 of 3')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Reading text' })).toHaveAttribute('aria-valuenow', '66')
    await answer(READ)
    expect(screen.getByText('3 lines found')).toBeInTheDocument()
    expect(lines().map((l) => l.querySelector('p')?.textContent)).toEqual(['Opening hours', 'Mon–Fri 9–5', 'Sat 10–2'])
    expect(
      screen.getByText('Read by PaddleOCR on this device. Check anything that matters against the picture.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Text' })).toHaveTextContent('3 lines found.')
  })

  it('cancels a download halfway and offers it again', async () => {
    await openText()
    server.holding = true
    await userEvent.click(await screen.findByRole('button', { name: 'Download (about 4 MB)' }))
    await screen.findByText(/of 4 MB$/)
    await userEvent.click(button('Cancel'))
    expect(await screen.findByRole('button', { name: 'Download (about 4 MB)' })).toBeInTheDocument()
    expect(caches.paths(TEXT_CACHE)).toEqual([])
    expect(client.texts).toHaveLength(0)
  })

  it('says why a download failed', async () => {
    await openText()
    server.offline = true
    await userEvent.click(await screen.findByRole('button', { name: 'Download (about 4 MB)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The text recognition files couldn’t be downloaded. Check your connection and try again.',
    )
  })

  it('reads at once with the files held, and marks the lines it’s unsure of', async () => {
    await hold('latin-cjk')
    await openText()
    await answer(READ)
    const [, unsure, sure] = lines()
    expect(within(unsure).getByText('Unsure')).toBeInTheDocument()
    expect(within(sure).queryByText('Unsure')).toBeNull()
    expect(box(1)).toHaveAttribute('data-unsure')
  })

  it('copies a line, and all of them in reading order', async () => {
    await hold('latin-cjk')
    await openText()
    await answer(READ)
    await userEvent.click(within(lines()[1]).getByRole('button', { name: 'Copy line 2' }))
    await userEvent.click(button('Copy all'))
    expect(writes).toEqual(['Mon–Fri 9–5', 'Opening hours\nMon–Fri 9–5\nSat 10–2'])
    expect(await screen.findAllByRole('button', { name: 'Copied' })).toHaveLength(2)
  })

  it('says when no text is found, naming the script', async () => {
    await hold('latin-cjk')
    await openText()
    await answer([])
    expect(shown('No text found.')).toBeInTheDocument()
    expect(
      screen.getByText('Try another script if the text isn’t in Latin letters, Chinese or Japanese.'),
    ).toBeInTheDocument()
    expect(chip('Text')).not.toBeNull()
    expect(chip('Text')).not.toBeChecked()
  })

  it('shows a failed read and tries again', async () => {
    await hold('latin-cjk')
    await openText()
    await waitFor(() => expect(client.texts).toHaveLength(1))
    await act(async () => client.texts[0].reject('Loupe ran out of memory reading this picture.'))
    expect(screen.getByRole('alert')).toHaveTextContent('Loupe ran out of memory reading this picture.')
    await userEvent.click(button('Try again'))
    expect(client.texts).toHaveLength(2)
  })

  it('switching script downloads it, reads again, and keeps each script’s result', async () => {
    await hold('latin-cjk')
    await openText()
    await answer(READ)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Script' }), 'korean')
    expect(localStorage.getItem('loupe.text')).toContain('korean')
    await userEvent.click(await screen.findByRole('button', { name: 'Download (about 2 MB)' }))
    await waitFor(() => expect(client.texts).toHaveLength(2))
    expect(client.texts[1].script).toBe('korean')
    await answer([fakeLine('영업시간', 10, 10)])
    expect(lines()).toHaveLength(1)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Script' }), 'latin-cjk')
    expect(lines()).toHaveLength(3)
    expect(client.texts).toHaveLength(2)
  })

  it('remembers the script', async () => {
    localStorage.setItem('loupe.text', JSON.stringify({ script: 'cyrillic' }))
    await openText()
    expect(screen.getByRole('combobox', { name: 'Script' })).toHaveValue('cyrillic')
  })

  it('says what it keeps, and Remove asks to download again', async () => {
    await hold('latin-cjk')
    await openText()
    await answer(READ)
    expect(screen.getByText('Kept on this device: Latin, Chinese and Japanese (4 MB).')).toBeInTheDocument()
    await userEvent.click(button('Remove'))
    expect(await screen.findByRole('button', { name: 'Download (about 4 MB)' })).toBeInTheDocument()
    expect(caches.stores.has(TEXT_CACHE)).toBe(false)
  })

  it('asks to download again when the browser cleared the files', async () => {
    await hold('latin-cjk')
    await openText()
    await answer(READ)
    await userEvent.click(tool('Info'))
    await caches.delete(TEXT_CACHE)
    await userEvent.click(tool('Text'))
    expect(await screen.findByRole('button', { name: 'Download (about 4 MB)' })).toBeInTheDocument()
  })

  it('reads a new file afresh', async () => {
    await hold('latin-cjk')
    await openText()
    await answer(READ)
    await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], 'other.png'))
    await act(async () => {
      client.last.picture({ type: 'file' })
      client.last.resolve({ ...shot, name: 'other.png' })
    })
    await userEvent.click(tool('Text'))
    await waitFor(() => expect(client.texts).toHaveLength(2))
  })
})

describe('the Text view', () => {
  it('switches to the boxes once lines are found, and back to the picture on leaving the tool', async () => {
    await hold('latin-cjk')
    await openText()
    expect(chip('Text')).toBeNull()
    await answer(READ)
    expect(chip('Text')).toBeChecked()
    expect(box(0)).toBeInTheDocument()
    await userEvent.click(tool('Info'))
    expect(chip('Picture')).toBeChecked()
    expect(chip('Text')).toBeNull()
  })

  it('selects a line from its box, and a box from its line', async () => {
    await hold('latin-cjk')
    await openText()
    await answer(READ)
    fireEvent.pointerDown(box(2), { button: 0, pointerId: 1, isPrimary: true })
    expect(lines()[2]).toHaveAttribute('aria-current', 'true')
    expect(box(2)).toHaveAttribute('data-selected')
    // The selected line's text in a chip over its box.
    expect(screen.getByText('Sat 10–2', { selector: '[data-chip]' })).toBeInTheDocument()
    act(() => within(lines()[0]).getByRole('button', { name: 'Copy line 1' }).focus())
    expect(lines()[0]).toHaveAttribute('aria-current', 'true')
    expect(box(0)).toHaveAttribute('data-selected')
    expect(box(2)).not.toHaveAttribute('data-selected')
  })
})
