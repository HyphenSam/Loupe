// @vitest-environment jsdom
// Redaction boxes on the stage (DESIGN.md): drawing, selecting, the keyboard and dragging.
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Rect } from '@/lib/pixels'
import { RedactBoxes } from './RedactBoxes'

const size = { width: 400, height: 300 }

/** The boxes at half size over a 400 × 300 picture, holding their own state as the App does. */
function Boxes({ start = [] }: { start?: Rect[] }) {
  const [boxes, setBoxes] = useState(start)
  const [selected, setSelected] = useState<number | null>(null)
  return (
    <RedactBoxes
      boxes={boxes}
      fill="black"
      selected={selected}
      size={size}
      scale={0.5}
      preview={null}
      onBoxes={setBoxes}
      onSelect={setSelected}
    />
  )
}

const boxes = () => screen.queryAllByRole('button', { name: /^Box \d/ })
const handles = () => screen.queryAllByRole('button', { name: /handle$/ })

describe('RedactBoxes', () => {
  it('draws a box where the pointer drags, and selects it', () => {
    render(<Boxes />)
    const surface = screen.getByLabelText('Draw a box over what to hide')
    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 10, clientY: 20 })
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 60, clientY: 50 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 60, clientY: 50 })
    expect(boxes().map((b) => b.getAttribute('aria-label'))).toEqual(['Box 1, 100 × 60 at 20, 40'])
    expect(handles()).toHaveLength(8)
  })

  it('ignores a click without a drag, which clears the selection', () => {
    render(<Boxes start={[{ x: 0, y: 0, width: 50, height: 50 }]} />)
    fireEvent.focus(boxes()[0])
    expect(handles()).toHaveLength(8)
    const surface = screen.getByLabelText('Draw a box over what to hide')
    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 })
    expect(boxes()).toHaveLength(1)
    expect(handles()).toHaveLength(0)
  })

  it('moves by a pixel, ten with Shift, resizes with Alt and deletes with Delete', async () => {
    render(<Boxes start={[{ x: 100, y: 100, width: 50, height: 20 }]} />)
    boxes()[0].focus()
    expect(boxes()[0]).toHaveAccessibleDescription('Arrow keys move it; Alt and an arrow resize it; Delete removes it.')
    await userEvent.keyboard('{ArrowRight}')
    expect(boxes()[0]).toHaveAccessibleName('Box 1, 50 × 20 at 101, 100')
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(boxes()[0]).toHaveAccessibleName('Box 1, 50 × 20 at 101, 110')
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(boxes()[0]).toHaveAccessibleName('Box 1, 49 × 20 at 101, 110')
    await userEvent.keyboard('{Delete}')
    expect(boxes()).toHaveLength(0)
  })

  it('resizes the selected box from a handle, by keyboard and by dragging', async () => {
    render(<Boxes start={[{ x: 100, y: 100, width: 50, height: 20 }]} />)
    act(() => boxes()[0].focus())
    act(() => screen.getByRole('button', { name: 'Right handle' }).focus())
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(boxes()[0]).toHaveAccessibleName('Box 1, 52 × 20 at 100, 100')
    const corner = screen.getByRole('button', { name: 'Top-left handle' })
    fireEvent.pointerDown(corner, { button: 0, pointerId: 2, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(corner, { pointerId: 2, clientX: 40, clientY: 45 })
    fireEvent.pointerUp(corner, { pointerId: 2 })
    expect(boxes()[0]).toHaveAccessibleName('Box 1, 72 × 30 at 80, 90')
  })

  it('moves a box by dragging it', () => {
    render(<Boxes start={[{ x: 100, y: 100, width: 50, height: 20 }]} />)
    fireEvent.pointerDown(boxes()[0], { button: 0, pointerId: 3, clientX: 60, clientY: 60 })
    fireEvent.pointerMove(boxes()[0], { pointerId: 3, clientX: 70, clientY: 55 })
    fireEvent.pointerUp(boxes()[0], { pointerId: 3 })
    expect(boxes()[0]).toHaveAccessibleName('Box 1, 50 × 20 at 120, 90')
  })

  it('draws nothing when the stage takes the pointer for a pinch, or the touch is cancelled', () => {
    render(<Boxes />)
    const surface = screen.getByLabelText('Draw a box over what to hide')
    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 10, clientY: 20 })
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 60, clientY: 50 })
    fireEvent.lostPointerCapture(surface, { pointerId: 1 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 60, clientY: 50 })
    fireEvent.pointerDown(surface, { button: 0, pointerId: 2, clientX: 10, clientY: 20 })
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 60, clientY: 50 })
    fireEvent.pointerCancel(surface, { pointerId: 2, clientX: 60, clientY: 50 })
    expect(boxes()).toHaveLength(0)
    expect(surface.querySelector('[aria-hidden="true"].outline-accent')).toBeNull()
  })

  it('puts a dragged box back when the stage takes the pointer for a pinch', () => {
    render(<Boxes start={[{ x: 100, y: 100, width: 50, height: 20 }]} />)
    fireEvent.pointerDown(boxes()[0], { button: 0, pointerId: 3, clientX: 60, clientY: 60 })
    fireEvent.pointerMove(boxes()[0], { pointerId: 3, clientX: 70, clientY: 55 })
    fireEvent.lostPointerCapture(boxes()[0], { pointerId: 3 })
    expect(boxes()[0]).toHaveAccessibleName('Box 1, 50 × 20 at 100, 100')
  })
})
