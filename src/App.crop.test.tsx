// @vitest-environment jsdom
// Crop and rotate (SPEC.md 6.8): the settings, the frame on the stage, the badge and caption following it, and
// the keys.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { ImageInfo } from './lib/info'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo } from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const aspect = (name: string) => within(screen.getByRole('radiogroup', { name: 'Aspect' })).getByRole('radio', { name })
const frame = () => screen.getByRole('button', { name: /^Crop frame/ })
const button = (name: string) => screen.getByRole('button', { name })

// 4032 × 3024, 16 px blocks.
const photo = (over: Partial<ImageInfo> = {}) => fakeInfo({ name: 'holiday.jpg', ...over })
const png = fakeInfo({
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

async function openCrop(info: ImageInfo = photo()) {
  const client = new FakeClient()
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], info.name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
    provenance.last.resolve(null)
  })
  await userEvent.click(tool('Crop and rotate'))
  return client
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:loupe/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('Crop and rotate', () => {
  it('needs something to do, then turns a JPEG losslessly', async () => {
    const client = await openCrop()
    expect(frame()).toHaveAccessibleName('Crop frame, 4032 × 3024 at 0, 0')
    expect(button('Rotate')).toBeDisabled()
    expect(screen.getByText('Crop, turn or straighten the picture.')).toBeInTheDocument()

    await userEvent.click(button('Rotate right'))
    expect(frame()).toHaveAccessibleName('Crop frame, 3024 × 4032 at 0, 0')
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(screen.getByText('Only the picture’s blocks move; nothing is re-encoded.')).toBeInTheDocument()
    expect(screen.getByText('On the 16 px grid: lossless')).toBeInTheDocument()

    await userEvent.click(button('Rotate'))
    expect(client.runs[0].plan).toMatchObject({
      kind: 'jpegtran',
      transform: 'rotate-90',
      name: 'holiday (rotated).jpg',
    })
    expect(screen.getByRole('progressbar', { name: 'Rotating holiday (rotated).jpg' })).toBeInTheDocument()
  })

  it('turns with [ and ], but not while typing', async () => {
    const client = await openCrop()
    await userEvent.keyboard(']]')
    expect(frame()).toHaveAccessibleName('Crop frame, 4032 × 3024 at 0, 0')
    await userEvent.keyboard('[[')
    expect(frame()).toHaveAccessibleName('Crop frame, 3024 × 4032 at 0, 0')
    await userEvent.click(screen.getByRole('spinbutton', { name: 'Straighten' }))
    await userEvent.keyboard('[[')
    expect(frame()).toHaveAccessibleName('Crop frame, 3024 × 4032 at 0, 0')
    await userEvent.click(button('Flip horizontal'))
    await userEvent.click(button('Rotate'))
    // Right, then mirrored: a transpose.
    expect(client.runs[0].plan).toMatchObject({ transform: 'transpose' })
  })

  it('crops on the grid losslessly, and re-encodes off it', async () => {
    const client = await openCrop()
    await userEvent.click(aspect('1:1'))
    expect(frame()).toHaveAccessibleName('Crop frame, 3024 × 3024 at 496, 0')
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(screen.getByText('On the 16 px grid: lossless')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: 'Lossless grid' }))
    frame().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(frame()).toHaveAccessibleName('Crop frame, 3024 × 3024 at 497, 0')
    expect(screen.getByText('Re-encodes')).toBeInTheDocument()
    expect(
      screen.getByText('Off the 16 px grid, so the picture is re-encoded. Re-encoded as JPEG at quality 92.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('On the 16 px grid: lossless')).not.toBeInTheDocument()

    await userEvent.click(button('Crop'))
    expect(client.runs[0].plan).toMatchObject({
      kind: 'pixels',
      name: 'holiday (cropped).jpg',
      ops: [{ type: 'crop', rect: { x: 497, y: 0, width: 3024, height: 3024 } }],
    })
    expect(screen.getByRole('progressbar', { name: 'Cropping holiday (cropped).jpg' })).toBeInTheDocument()
  })

  it('swaps an aspect for portrait', async () => {
    await openCrop()
    await userEvent.click(aspect('4:3'))
    expect(frame()).toHaveAccessibleName('Crop frame, 4032 × 3024 at 0, 0')
    await userEvent.click(button('Portrait'))
    expect(button('Portrait')).toHaveAttribute('aria-pressed', 'true')
    expect(frame()).toHaveAccessibleName('Crop frame, 2268 × 3024 at 880, 0')
    await userEvent.click(aspect('Free'))
    expect(button('Portrait')).toBeDisabled()
  })

  it('straightens, shrinking the frame and re-encoding', async () => {
    await openCrop()
    const field = screen.getByRole('spinbutton', { name: 'Straighten' })
    await userEvent.clear(field)
    await userEvent.type(field, '2.5{Enter}')
    expect(screen.getByRole('slider', { name: 'Straighten' })).toHaveAttribute('aria-valuenow', '2.5')
    expect(frame()).not.toHaveAccessibleName('Crop frame, 4032 × 3024 at 0, 0')
    expect(screen.getByText('Re-encodes')).toBeInTheDocument()
    expect(screen.getByText(/^Straightening resamples the picture\./)).toBeInTheDocument()
    expect(screen.queryByText(/grid: lossless/)).not.toBeInTheDocument()
  })

  it('offers to trim partial blocks a turn would move', async () => {
    await openCrop(photo({ width: 4030, displayWidth: 4030 }))
    await userEvent.click(button('Rotate left'))
    const trim = screen.getByRole('radio', { name: 'Trim 14 px from the right edge' })
    expect(trim).toBeChecked()
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Re-encode the whole picture' }))
    expect(screen.getByText('Re-encodes')).toBeInTheDocument()
  })

  it('shows the picture as it was while \\ is held', async () => {
    await openCrop()
    await userEvent.click(button('Rotate right'))
    fireEvent.keyDown(window, { key: '\\' })
    expect(screen.queryByRole('button', { name: /^Crop frame/ })).not.toBeInTheDocument()
    fireEvent.keyUp(window, { key: '\\' })
    expect(frame()).toHaveAccessibleName('Crop frame, 3024 × 4032 at 0, 0')
  })

  it('takes the frame’s numbers under More options', async () => {
    await openCrop()
    await userEvent.click(screen.getByText('More options'))
    const width = screen.getByRole('spinbutton', { name: 'Width' })
    await userEvent.clear(width)
    await userEvent.type(width, '1000{Enter}')
    expect(frame()).toHaveAccessibleName('Crop frame, 1000 × 3024 at 0, 0')
    expect(screen.getByRole('spinbutton', { name: 'X' })).toHaveValue(0)
  })

  it('crops a PNG exactly', async () => {
    const client = await openCrop(png)
    expect(screen.queryByRole('switch', { name: 'Lossless grid' })).not.toBeInTheDocument()
    await userEvent.click(aspect('1:1'))
    expect(frame()).toHaveAccessibleName('Crop frame, 300 × 300 at 50, 0')
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(screen.getByText('The pixels move exactly. Written losslessly as PNG.')).toBeInTheDocument()
    await userEvent.click(button('Crop'))
    expect(client.runs[0].plan).toMatchObject({ kind: 'pixels', name: 'shot (cropped).png', lossless: true })
  })

  it('starts afresh for each file', async () => {
    const client = await openCrop()
    await userEvent.click(button('Rotate right'))
    await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], 'other.jpg'))
    await act(async () => {
      client.last.picture({ type: 'file' })
      client.last.resolve(photo({ name: 'other.jpg' }))
    })
    await userEvent.click(tool('Crop and rotate'))
    expect(frame()).toHaveAccessibleName('Crop frame, 4032 × 3024 at 0, 0')
  })
})
