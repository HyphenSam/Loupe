// @vitest-environment jsdom
// The crop frame on the stage (DESIGN.md): what it says, the keyboard, and dragging its handles.
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { startCrop, type CropTool } from '@/lib/crop'
import { fakeInfo } from '@/lib/testing'
import { CropFrame } from './CropFrame'

const png = fakeInfo({
  name: 'shot.png',
  format: 'png',
  lossless: true,
  jpeg: null,
  width: 400,
  height: 300,
  displayWidth: 400,
  displayHeight: 300,
})

/** The frame at half size over `info`, holding its own state as the App does. */
function Framed({ info = png, start }: { info?: typeof png; start?: Partial<CropTool> }) {
  const [tool, setTool] = useState<CropTool>({
    ...startCrop(info),
    crop: { x: 100, y: 100, width: 200, height: 100 },
    ...start,
  })
  return <CropFrame tool={tool} info={info} scale={0.5} onTool={setTool} />
}

const frame = () => screen.getByRole('button', { name: /^Crop frame/ })

describe('CropFrame', () => {
  it('names the frame by its size and place, and each handle', () => {
    render(<Framed />)
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 100, 100')
    expect(frame()).toHaveAccessibleDescription('Arrow keys move it; Alt and an arrow resize it.')
    for (const name of ['Top-left', 'Top', 'Top-right', 'Right', 'Bottom-right', 'Bottom', 'Bottom-left', 'Left'])
      expect(screen.getByRole('button', { name: `${name} handle` })).toBeInTheDocument()
  })

  it('moves by a pixel, ten with Shift, and resizes with Alt', async () => {
    render(<Framed />)
    frame().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 101, 100')
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 101, 110')
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(frame()).toHaveAccessibleName('Crop frame, 199 × 100 at 101, 110')
  })

  it('moves a handle with the arrow keys', async () => {
    render(<Framed />)
    screen.getByRole('button', { name: 'Left handle' }).focus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(frame()).toHaveAccessibleName('Crop frame, 202 × 100 at 98, 100')
    // Up and down move nothing on a side handle.
    await userEvent.keyboard('{ArrowUp}')
    expect(frame()).toHaveAccessibleName('Crop frame, 202 × 100 at 98, 100')
  })

  it('steps a block at a time on a JPEG’s lossless grid', async () => {
    const photo = fakeInfo()
    render(<Framed info={photo} start={{ crop: { x: 96, y: 96, width: 200, height: 100 } }} />)
    frame().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 112, 96')
  })

  it('is dragged by its handles and its middle, at the stage’s scale', () => {
    render(<Framed />)
    const corner = screen.getByRole('button', { name: 'Bottom-right handle' })
    fireEvent.pointerDown(corner, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(corner, { pointerId: 1, clientX: 110, clientY: 120 })
    fireEvent.pointerUp(corner, { pointerId: 1, clientX: 110, clientY: 120 })
    // Half size on the stage: 10 and 20 px there are 20 and 40 in the picture.
    expect(frame()).toHaveAccessibleName('Crop frame, 220 × 140 at 100, 100')

    fireEvent.pointerDown(frame(), { button: 0, pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 45, clientY: 50 })
    fireEvent.pointerUp(frame(), { pointerId: 1 })
    expect(frame()).toHaveAccessibleName('Crop frame, 220 × 140 at 90, 100')
  })

  it('drops a drag when the stage takes the pointer for a pinch, or the touch is cancelled', () => {
    render(<Framed />)
    fireEvent.pointerDown(frame(), { button: 0, pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 45, clientY: 50 })
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 90, 100')
    fireEvent.lostPointerCapture(frame(), { pointerId: 1 })
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 100, 100')
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 40, clientY: 50 })
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 100, 100')

    const corner = screen.getByRole('button', { name: 'Bottom-right handle' })
    fireEvent.pointerDown(corner, { button: 0, pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(corner, { pointerId: 2, clientX: 110, clientY: 120 })
    fireEvent.pointerCancel(corner, { pointerId: 2 })
    expect(frame()).toHaveAccessibleName('Crop frame, 200 × 100 at 100, 100')
  })
})
