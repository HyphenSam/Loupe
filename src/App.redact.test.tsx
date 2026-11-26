// @vitest-environment jsdom
// Redact (SPEC.md 6.9): drawing boxes on the stage, the settings that list them, the fill and the switch, the badge
// and caption, and \ to look under the boxes.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { ImageInfo } from './lib/info'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo } from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const fill = (name: string) => within(screen.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name })
const button = (name: string) => screen.getByRole('button', { name })
const onStage = () => screen.queryAllByRole('button', { name: /^Box \d/ })

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

async function openRedact(info: ImageInfo = png) {
  const client = new FakeClient()
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], info.name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(info)
    provenance.last.resolve(null)
  })
  await userEvent.click(tool('Redact'))
  return client
}

/** Drags on the stage from one point to another; the picture is shown at 100%. */
function draw(from: [number, number], to: [number, number]) {
  const surface = screen.getByLabelText('Draw a box over what to hide')
  fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(surface, { pointerId: 1, clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: to[0], clientY: to[1] })
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:loupe/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  // jsdom has no layout; an 800 × 600 stage shows the 400 × 300 picture at 100%.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => vi.restoreAllMocks())

describe('Redact', () => {
  it('needs a box, then redacts a PNG losslessly with the metadata removed', async () => {
    const client = await openRedact()
    expect(button('Redact')).toBeDisabled()
    expect(screen.getByText('Draw a box over what to hide.')).toBeInTheDocument()
    expect(fill('Black')).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Remove metadata' })).toBeChecked()

    draw([10, 20], [110, 80])
    expect(onStage().map((b) => b.getAttribute('aria-label'))).toEqual(['Box 1, 100 × 60 at 10, 20'])
    expect(screen.getByRole('listitem')).toHaveTextContent('Box 1, 100 × 60 at 10, 20')
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Only the boxes change. Written losslessly as PNG. All metadata is removed but the colour profile.',
      ),
    ).toBeInTheDocument()

    await userEvent.click(button('Redact'))
    expect(client.runs[0].plan).toMatchObject({
      kind: 'pixels',
      name: 'shot (redacted).png',
      args: ['-ICC_Profile'],
      ops: [{ type: 'redact', boxes: [{ x: 10, y: 20, width: 100, height: 60 }], fill: 'black' }],
    })
    expect(screen.getByRole('progressbar', { name: 'Redacting shot (redacted).png' })).toBeInTheDocument()
  })

  it('warns that blur and pixelate can be read back', async () => {
    await openRedact()
    const warning = 'Blurred and pixelated text can sometimes be read back. Black is safest.'
    expect(screen.queryByText(warning)).not.toBeInTheDocument()
    await userEvent.click(fill('Blur'))
    expect(screen.getByText(warning)).toBeInTheDocument()
    await userEvent.click(fill('Pixelate'))
    expect(screen.getByText(warning)).toBeInTheDocument()
  })

  it('deletes a box from the list, and keeps the metadata with the switch off', async () => {
    const client = await openRedact(fakeInfo({ ...png, embedded: [] }))
    draw([0, 0], [50, 50])
    draw([100, 100], [150, 120])
    await userEvent.click(button('Delete box 1'))
    expect(onStage().map((b) => b.getAttribute('aria-label'))).toEqual(['Box 1, 50 × 20 at 100, 100'])
    await userEvent.click(screen.getByRole('switch', { name: 'Remove metadata' }))
    expect(screen.getByText('Only the boxes change. Written losslessly as PNG.')).toBeInTheDocument()
    await userEvent.click(button('Redact'))
    expect(client.runs[0].plan.kind === 'pixels' && client.runs[0].plan.args).toContain('-all:all')
  })

  it('shows the picture without the boxes while \\ is held', async () => {
    await openRedact()
    draw([10, 10], [60, 60])
    expect(onStage()).toHaveLength(1)
    fireEvent.keyDown(window, { key: '\\' })
    expect(onStage()).toHaveLength(0)
    fireEvent.keyUp(window, { key: '\\' })
    expect(onStage()).toHaveLength(1)
  })

  it('keeps the boxes while another tool is open', async () => {
    await openRedact()
    draw([10, 10], [60, 60])
    await userEvent.click(tool('Info'))
    expect(onStage()).toHaveLength(0)
    await userEvent.click(tool('Redact'))
    expect(onStage()).toHaveLength(1)
  })
})
