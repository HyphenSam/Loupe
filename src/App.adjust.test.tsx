// @vitest-environment jsdom
// Adjust (SPEC.md 6.10): the six sliders centred on zero, resetting one and all, the badge and caption, the job's
// plan, and the stage's preview, which \ held hides.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { NEUTRAL } from './lib/adjust'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo } from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const slider = (name: string) => screen.getByRole('slider', { name })
const button = (name: string) => screen.getByRole('button', { name })
const picture = () => screen.getByRole('img', { name: /^shot\.png/ })

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

async function openAdjust() {
  const client = new FakeClient()
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], png.name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(png)
    provenance.last.resolve(null)
  })
  await userEvent.click(tool('Adjust'))
  return client
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:loupe/1')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => vi.restoreAllMocks())

describe('Adjust', () => {
  it('offers six sliders at zero, and needs one moved', async () => {
    await openAdjust()
    for (const name of ['Exposure', 'Contrast', 'Highlights', 'Shadows', 'Saturation', 'Warmth'])
      expect(slider(name)).toHaveAttribute('aria-valuenow', '0')
    expect(slider('Exposure')).toHaveAttribute('aria-valuemin', '-2')
    expect(slider('Warmth')).toHaveAttribute('aria-valuemax', '100')
    expect(button('Save')).toBeDisabled()
    expect(screen.getByText('Move a slider to adjust the picture.')).toBeInTheDocument()
  })

  it('saves a PNG losslessly with the adjustment', async () => {
    const client = await openAdjust()
    fireEvent.keyDown(slider('Exposure'), { key: 'ArrowRight' })
    fireEvent.keyDown(slider('Warmth'), { key: 'ArrowLeft' })
    expect(slider('Exposure')).toHaveAttribute('aria-valuetext', '+0.1 EV')
    expect(slider('Warmth')).toHaveAttribute('aria-valuetext', '−1')
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(screen.getByText('Only the adjustment changes the pixels. Written losslessly as PNG.')).toBeInTheDocument()

    await userEvent.click(button('Save'))
    expect(client.runs[0].plan).toMatchObject({
      kind: 'pixels',
      name: 'shot (adjusted).png',
      ops: [{ type: 'adjust', adjustments: { ...NEUTRAL, exposure: 0.1, warmth: -1 } }],
    })
    expect(screen.getByRole('progressbar', { name: 'Adjusting shot (adjusted).png' })).toBeInTheDocument()
  })

  it('resets one slider on a double-click, and all of them with Reset all', async () => {
    await openAdjust()
    expect(button('Reset all')).toBeDisabled()
    fireEvent.keyDown(slider('Contrast'), { key: 'ArrowRight' })
    fireEvent.keyDown(slider('Shadows'), { key: 'ArrowRight' })
    fireEvent.doubleClick(slider('Contrast'))
    expect(slider('Contrast')).toHaveAttribute('aria-valuenow', '0')
    expect(slider('Shadows')).toHaveAttribute('aria-valuenow', '1')
    await userEvent.click(button('Reset all'))
    expect(slider('Shadows')).toHaveAttribute('aria-valuenow', '0')
    expect(button('Save')).toBeDisabled()
  })

  it('previews the adjustment on the stage, and shows the picture before while \\ is held', async () => {
    const client = await openAdjust()
    expect(picture()).not.toHaveAccessibleName(/adjusted/)
    fireEvent.keyDown(slider('Saturation'), { key: 'ArrowRight' })
    await act(async () => {})
    expect(picture()).toHaveAccessibleName('shot.png, adjusted, 400 × 300')
    // The worker works it out.
    expect(client.adjustedRequests).toEqual([{ ...NEUTRAL, saturation: 1 }])
    fireEvent.keyDown(window, { key: '\\' })
    expect(picture()).toHaveAccessibleName('shot.png, 400 × 300')
    fireEvent.keyUp(window, { key: '\\' })
    expect(picture()).toHaveAccessibleName('shot.png, adjusted, 400 × 300')
  })

  it('keeps the sliders while another tool is open', async () => {
    await openAdjust()
    fireEvent.keyDown(slider('Highlights'), { key: 'ArrowLeft' })
    await userEvent.click(tool('Info'))
    expect(picture()).not.toHaveAccessibleName(/adjusted/)
    await userEvent.click(tool('Adjust'))
    expect(slider('Highlights')).toHaveAttribute('aria-valuenow', '-1')
  })

  it('starts again at zero for a new file', async () => {
    const client = await openAdjust()
    fireEvent.keyDown(slider('Highlights'), { key: 'ArrowLeft' })
    await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], png.name))
    await act(async () => {
      client.last.picture({ type: 'file' })
      client.last.resolve(png)
    })
    await userEvent.click(tool('Adjust'))
    expect(slider('Highlights')).toHaveAttribute('aria-valuenow', '0')
  })
})
