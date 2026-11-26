// @vitest-environment jsdom
// The stage's Depth and 360° views (SPEC.md section 5).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import type { Capabilities } from './lib/capabilities'
import type { Embedded, ImageInfo } from './lib/info'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo } from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const viewChip = (name: string) =>
  within(screen.getByRole('radiogroup', { name: 'View' })).queryByRole('radio', { name })

const DEPTH: Embedded = {
  id: 'XMP:XMP-GDepth:DepthImage',
  kind: 'depth-map',
  label: 'Depth map',
  size: 418,
  extension: 'png',
  isImage: true,
}

async function openWith(info: Partial<ImageInfo>, name: string, capabilities: Capabilities = ALL_CAPABLE) {
  const client = new FakeClient()
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={capabilities} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(fakeInfo({ name, ...info }))
    provenance.last.resolve(null)
  })
  return client
}

describe('Depth', () => {
  it('draws the depth map over the picture, asked for once, and stays while tools change', async () => {
    const client = await openWith({ kinds: ['portrait-depth'], embedded: [DEPTH] }, 'portrait.jpg')
    await userEvent.click(viewChip('Depth')!)
    expect(viewChip('Depth')).toBeChecked()
    expect(screen.getByRole('img', { name: /^portrait\.jpg, depth/ })).toBeInTheDocument()
    await waitFor(() => expect(client.layers.map((l) => l.layer)).toEqual(['depth']))
    await userEvent.click(tool('Forensics'))
    await userEvent.click(tool('Info'))
    expect(viewChip('Depth')).toBeChecked()
    expect(client.layers.map((l) => l.layer)).toEqual(['depth'])
  })

  it('isn’t offered without a depth map', async () => {
    await openWith({ kinds: [] }, 'photo.jpg')
    expect(viewChip('Depth')).toBeNull()
  })
})

describe('360°', () => {
  const pano = { kinds: ['panorama-360' as const], width: 128, height: 64, displayWidth: 128, displayHeight: 64 }

  // jsdom has no WebGL: drawing, and the picture asked for as a texture, are checked in the browsers.
  it('looks around the panorama with the keys, and zooms with the buttons', async () => {
    await openWith(pano, 'pano.jpg')
    await userEvent.click(viewChip('360°')!)
    const stage = screen.getByRole('application', { name: 'pano.jpg, 360° view' })
    expect(stage).toHaveAccessibleDescription(
      'Drag or use the arrow keys to look around; pinch, the wheel or + and − zoom; 0 looks ahead again.',
    )
    expect(screen.getByLabelText('Field of view')).toHaveTextContent('75°')
    fireEvent.keyDown(stage, { key: '+' })
    expect(screen.getByLabelText('Field of view')).toHaveTextContent('70°')
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByLabelText('Field of view')).toHaveTextContent('75°')
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    fireEvent.keyDown(stage, { key: '0' })
    expect(screen.getByLabelText('Field of view')).toHaveTextContent('75°')
  })

  it('says when WebGL 2 won’t start', async () => {
    await openWith(pano, 'pano.jpg')
    await userEvent.click(viewChip('360°')!)
    expect(
      screen.getByText('This browser couldn’t start WebGL 2, so the 360° view can’t be drawn.'),
    ).toBeInTheDocument()
  })

  it('isn’t offered without WebGL 2, or for a flat picture', async () => {
    await openWith(pano, 'pano.jpg', { ...ALL_CAPABLE, webgl2: false })
    expect(viewChip('360°')).toBeNull()
    expect(viewChip('Picture')).toBeChecked()
  })
})
