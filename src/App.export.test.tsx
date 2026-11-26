// @vitest-environment jsdom
// Export (SPEC.md 6.11): format, quality, the Lossless switch, resize, target size and Keep metadata, remembered
// between files; the badge and caption; the job's plan; the size change; and the Compare view after a run.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { EXPORT_KEY } from './lib/settings'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo } from './lib/testing'
import type { ImageInfo } from './lib/info'
import type { Capabilities } from './lib/capabilities'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const format = (name: string) => within(screen.getByRole('radiogroup', { name: 'Format' })).getByRole('radio', { name })
const view = (name: string) => within(screen.getByRole('radiogroup', { name: 'View' })).getByRole('radio', { name })
const button = (name: string) => screen.getByRole('button', { name })
const toggle = (name: string) => screen.getByRole('switch', { name })

const photo = fakeInfo({
  name: 'photo.jpg',
  size: 100_000,
  width: 4000,
  height: 3000,
  displayWidth: 4000,
  displayHeight: 3000,
})

async function openExport(info: ImageInfo = photo, capabilities: Capabilities = ALL_CAPABLE) {
  const client = new FakeClient()
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={capabilities} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], info.name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
    provenance.last.resolve(null)
  })
  await userEvent.click(tool('Export'))
  return client
}

beforeEach(() => {
  localStorage.clear()
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:loupe/${++n}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => vi.restoreAllMocks())

describe('Export', () => {
  it('starts on Same at JPEG’s quality, re-encoding, without metadata', async () => {
    await openExport()
    expect(format('Same')).toBeChecked()
    expect(screen.getByRole('slider', { name: 'Quality' })).toHaveAttribute('aria-valuenow', '75')
    expect(screen.queryByRole('switch', { name: 'Lossless' })).toBe(null)
    expect(toggle('Keep metadata')).not.toBeChecked()
    expect(screen.getByText('Re-encodes')).toBeInTheDocument()
    expect(
      screen.getByText('Re-encoded as JPEG at quality 75. Metadata is removed but for the colour profile.'),
    ).toBeInTheDocument()
  })

  it('shows each format’s own quality, and the Lossless switch for WebP and JPEG XL', async () => {
    await openExport()
    await userEvent.click(format('AVIF'))
    expect(screen.getByRole('slider', { name: 'Quality' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.queryByRole('switch', { name: 'Lossless' })).toBe(null)
    await userEvent.click(format('WebP'))
    await userEvent.click(toggle('Lossless'))
    expect(screen.queryByRole('slider', { name: 'Quality' })).toBe(null)
    expect(screen.getByText(/^Every pixel is kept\. Written losslessly as WebP\./)).toBeInTheDocument()
    await userEvent.click(format('PNG'))
    expect(screen.queryByRole('switch', { name: 'Lossless' })).toBe(null)
  })

  it('exports with the settings, and says how the size changed', async () => {
    const client = await openExport()
    await userEvent.click(format('WebP'))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Quality' }), { key: 'ArrowLeft' })
    await userEvent.click(toggle('Resize'))
    const width = screen.getByRole('spinbutton', { name: 'Maximum width' })
    await userEvent.clear(width)
    await userEvent.type(width, '1000{Enter}')
    await userEvent.click(toggle('Keep metadata'))
    await userEvent.click(button('Export'))
    expect(client.runs[0].plan).toMatchObject({
      kind: 'export',
      name: 'photo.webp',
      encoding: { format: 'webp', quality: 74, lossless: false },
      size: { width: 1000, height: 750 },
      target: null,
    })
    expect(screen.getByRole('progressbar', { name: 'Exporting photo.webp' })).toBeInTheDocument()
    await act(async () =>
      client.runs[0].resolve({ blob: new Blob([new Uint8Array(104_000)], { type: 'image/webp' }), info: null }),
    )
    expect(screen.getByText('4% larger than the original. Try a lower quality.')).toBeInTheDocument()
  })

  it('aims for a target size, and says when even the lowest quality is too large', async () => {
    const client = await openExport()
    await userEvent.click(toggle('Target size'))
    const size = screen.getByRole('spinbutton', { name: 'Target size' })
    await userEvent.clear(size)
    await userEvent.type(size, '2{Enter}')
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Unit' })).getByRole('radio', { name: 'MB' }))
    expect(screen.getByText(/at the highest quality up to 75 that fits under 2\.0 MB/)).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Unit' })).getByRole('radio', { name: 'kB' }))
    await userEvent.click(button('Export'))
    expect(client.runs[0].plan).toMatchObject({ target: 2_000 })
    await act(async () =>
      client.runs[0].resolve({
        blob: new Blob([new Uint8Array(9_000)], { type: 'image/jpeg' }),
        info: null,
        fitted: { quality: 1, fits: false },
      }),
    )
    expect(
      screen.getByText(
        'Even at quality 1 this is 9 kB, over the 2 kB target. Turn on Resize, or choose another format.',
      ),
    ).toBeInTheDocument()
  })

  it('says why a target size can’t work with PNG', async () => {
    await openExport()
    await userEvent.click(format('PNG'))
    await userEvent.click(toggle('Target size'))
    expect(
      screen.getByText(
        'PNG is always lossless, so it can’t aim for a target size. Choose JPEG, WebP, AVIF or JPEG XL.',
      ),
    ).toBeInTheDocument()
    expect(button('Export')).toBeDisabled()
  })

  it('remembers the settings for the next file and the next visit', async () => {
    const client = await openExport()
    await userEvent.click(format('AVIF'))
    await userEvent.click(toggle('Keep metadata'))
    expect(JSON.parse(localStorage.getItem(EXPORT_KEY)!)).toMatchObject({ format: 'avif', keepMetadata: true })
    await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], photo.name))
    await act(async () => {
      client.last.picture({ type: 'file' })
      client.last.resolve(photo)
    })
    await userEvent.click(tool('Export'))
    expect(format('AVIF')).toBeChecked()
    expect(toggle('Keep metadata')).toBeChecked()
  })

  it('offers Compare after a run, between the source and the newest export', async () => {
    const client = await openExport()
    expect(screen.queryByRole('radio', { name: 'Compare' })).toBe(null)
    await userEvent.click(button('Export'))
    await act(async () =>
      client.runs[0].resolve({ blob: new Blob([new Uint8Array(50_000)], { type: 'image/jpeg' }), info: null }),
    )
    await userEvent.click(view('Compare'))
    const download = screen.getByRole('link', { name: 'Download' }).getAttribute('href')
    expect(screen.getByAltText('Result')).toHaveAttribute('src', download)
    expect(screen.getByAltText('Original').getAttribute('src')).toMatch(/^blob:loupe\//)
    expect(screen.getByAltText('Original').getAttribute('src')).not.toBe(download)
    expect(screen.getByRole('slider', { name: 'Split' })).toBeInTheDocument()

    // Each mode, remembered with the stage's settings.
    await userEvent.click(screen.getByRole('radio', { name: 'Side by side' }))
    expect(screen.queryByRole('slider', { name: 'Split' })).toBe(null)
    await userEvent.click(screen.getByRole('radio', { name: 'Toggle' }))
    await userEvent.click(button('Show original'))
    expect(button('Show original')).toHaveAttribute('aria-pressed', 'true')

    // Leaving Export goes back to the picture.
    await userEvent.click(tool('Info'))
    expect(screen.queryByRole('radio', { name: 'Compare' })).toBe(null)
    expect(view('Picture')).toBeChecked()
  })

  it('compares a result the browser can’t show through the worker’s PNG', async () => {
    const client = await openExport(photo, { ...ALL_CAPABLE, shows: { avif: false, heic: false, jxl: false } })
    await userEvent.click(format('JPEG XL'))
    await userEvent.click(button('Export'))
    const blob = new Blob([new Uint8Array(30_000)], { type: 'image/jxl' })
    await act(async () => client.runs[0].resolve({ blob, info: null }))
    await userEvent.click(view('Compare'))
    await act(async () => {})
    expect(client.pngSources).toContainEqual({ blob, format: 'jxl', orientation: 1 })
    expect(screen.getByAltText('Result').getAttribute('src')).toMatch(/^blob:loupe\//)
  })
})
