// @vitest-environment jsdom
// The Output disclosure under Crop and rotate, Redact and Adjust (SPEC.md 6.0): it shows the format and quality the
// edit is written in, a change follows through to the badge, the caption and the job, and the next file starts
// from its own default.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { ImageInfo } from './lib/info'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo } from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const format = (name: string) => within(screen.getByRole('radiogroup', { name: 'Format' })).getByRole('radio', { name })
const button = (name: string) => screen.getByRole('button', { name })
const output = () => screen.getByText('Output').closest('summary')!

// A 12 MP Display P3 JPEG at quality 92.
const photo = fakeInfo({ name: 'holiday.jpg' })
const png = fakeInfo({
  name: 'shot.png',
  format: 'png',
  formatName: 'PNG',
  lossless: true,
  jpeg: null,
  colour: { profile: null, space: null, hdr: null },
  width: 400,
  height: 300,
  displayWidth: 400,
  displayHeight: 300,
})

let client: FakeClient
let provenance: FakeProvenance

/** Opens a file, rendering the app for the first, and picks a tool. */
async function open(info: ImageInfo, name: string) {
  if (!client.opens.length) render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], info.name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
    provenance.last.resolve(null)
  })
  await userEvent.click(tool(name))
}

beforeEach(() => {
  client = new FakeClient()
  provenance = new FakeProvenance()
  localStorage.clear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:loupe/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => vi.restoreAllMocks())

describe('Output', () => {
  it('shows the default format and quality, and a change re-encodes a lossless JPEG turn', async () => {
    await open(photo, 'Crop and rotate')
    await userEvent.click(button('Rotate right'))
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(output()).toHaveTextContent('JPEG, quality 92')

    await userEvent.click(output())
    expect(format('JPEG')).toBeChecked()
    expect(screen.getByRole('slider', { name: 'Quality' })).toHaveAttribute('aria-valuenow', '92')

    await userEvent.click(format('AVIF'))
    expect(output()).toHaveTextContent('AVIF, quality 70')
    expect(screen.getByText('Re-encodes')).toBeInTheDocument()
    expect(
      screen.getByText(/AVIF can’t carry the colour profile here, so the colours are converted to sRGB\./),
    ).toHaveTextContent('Re-encoded as AVIF at quality 70.')

    await userEvent.click(button('Rotate'))
    expect(client.runs[0].plan).toMatchObject({
      kind: 'pixels',
      name: 'holiday (rotated).avif',
      encoding: { format: 'avif', quality: 70, lossless: false },
      srgb: true,
    })
  })

  it('goes back to the lossless turn when the source’s format and quality are chosen again', async () => {
    await open(photo, 'Crop and rotate')
    await userEvent.click(button('Rotate right'))
    await userEvent.click(output())
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Quality' }), { key: 'ArrowLeft' })
    expect(screen.getByText('Re-encodes')).toBeInTheDocument()
    expect(screen.getByText(/Re-encoded as JPEG at quality 91\./)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Quality' }), { key: 'ArrowRight' })
    expect(screen.getByText('Lossless')).toBeInTheDocument()
  })

  it('writes WebP lossily or, with Lossless on, losslessly', async () => {
    await open(png, 'Adjust')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Exposure' }), { key: 'ArrowRight' })
    await userEvent.click(output())
    expect(output()).toHaveTextContent('PNG, lossless')
    expect(format('PNG')).toBeChecked()
    expect(screen.queryByRole('slider', { name: 'Quality' })).not.toBeInTheDocument()

    await userEvent.click(format('WebP'))
    expect(screen.getByRole('switch', { name: 'Lossless' })).not.toBeChecked()
    expect(screen.getByRole('slider', { name: 'Quality' })).toHaveAttribute('aria-valuenow', '90')
    expect(screen.getByText('Re-encoded as WebP at quality 90.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: 'Lossless' }))
    expect(screen.queryByRole('slider', { name: 'Quality' })).not.toBeInTheDocument()
    expect(screen.getByText('Only the adjustment changes the pixels. Written losslessly as WebP.')).toBeInTheDocument()

    await userEvent.click(button('Save'))
    expect(client.runs[0].plan).toMatchObject({
      name: 'shot (adjusted).webp',
      encoding: { format: 'webp', quality: null, lossless: true },
    })
  })

  it('is for this edit only: the next file starts from its own default', async () => {
    await open(png, 'Redact')
    await userEvent.click(output())
    await userEvent.click(format('JPEG'))
    expect(output()).toHaveTextContent('JPEG, quality 90')

    await open(photo, 'Redact')
    expect(output()).toHaveTextContent('JPEG, quality 92')
    await open(png, 'Crop and rotate')
    expect(output()).toHaveTextContent('PNG, lossless')
  })
})
