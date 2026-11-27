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
const handle = (name: string) => screen.getByRole('button', { name: `${name} handle` })
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
  it('adds a box in the middle of the picture for the keyboard, which moves it with the arrow keys', async () => {
    await openRedact()
    await userEvent.click(button('Add box'))
    expect(screen.getByText('Box 1, 100 × 75 at 150, 113')).toBeInTheDocument()
    expect(onStage()).toHaveLength(1)
    onStage()[0].focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByText('Box 1, 100 × 75 at 149, 113')).toBeInTheDocument()
  })

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

  it('keeps the selection on its box when a box before it is deleted from the list', async () => {
    await openRedact()
    draw([0, 0], [50, 50])
    draw([100, 100], [150, 120])
    draw([200, 150], [260, 200])
    // Drawing selects the new box: the handles are on Box 3.
    expect(handle('Top-left')).toHaveStyle({ left: '200px', top: '150px' })
    await userEvent.click(button('Delete box 1'))
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Box 1, 50 × 20 at 100, 100',
      'Box 2, 60 × 50 at 200, 150',
    ])
    expect(handle('Top-left')).toHaveStyle({ left: '200px', top: '150px' })
  })

  it('selects nothing once the selected box is deleted from the list', async () => {
    await openRedact()
    draw([0, 0], [50, 50])
    draw([100, 100], [150, 120])
    act(() => onStage()[0].focus())
    expect(handle('Top-left')).toHaveStyle({ left: '0px', top: '0px' })
    await userEvent.click(button('Delete box 1'))
    expect(onStage()).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Top-left handle' })).toBe(null)
  })

  it('keeps the boxes and the tool when a dropped file can’t be opened', async () => {
    const client = await openRedact()
    draw([10, 20], [110, 80])
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'notimage.txt')] } })
    await act(async () => client.last.reject('Loupe can’t open this file.'))
    expect(screen.getByRole('alert')).toHaveTextContent('Loupe can’t open this file.')
    expect(tool('Redact')).toBeChecked()
    expect(onStage().map((b) => b.getAttribute('aria-label'))).toEqual(['Box 1, 100 × 60 at 10, 20'])
  })

  it('keeps the boxes when a file fails after its picture showed, if nothing was done to it', async () => {
    const client = await openRedact()
    draw([10, 20], [110, 80])
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'broken.png')] } })
    act(() => client.last.picture({ type: 'file' }))
    expect(tool('Info')).toBeChecked()
    await act(async () => client.last.reject('ExifTool couldn’t read this file.'))
    expect(tool('Redact')).toBeChecked()
    expect(onStage()).toHaveLength(1)
  })

  it('starts again on Info with no boxes once another file opens', async () => {
    const client = await openRedact()
    draw([10, 20], [110, 80])
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'other.png')] } })
    // Until the new file shows, the old one's tool stays.
    expect(tool('Redact')).toBeChecked()
    act(() => client.last.picture({ type: 'file' }))
    expect(tool('Info')).toBeChecked()
    await act(async () => client.last.resolve({ ...png, name: 'other.png' }))
    await userEvent.click(tool('Redact'))
    expect(onStage()).toHaveLength(0)
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
