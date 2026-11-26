// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Compare } from './Compare'

describe('Compare slider', () => {
  beforeEach(() => {
    // jsdom has no layout: every element is 200 × 100 at the origin.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 200, height: 100 }))
  })
  afterEach(() => vi.restoreAllMocks())

  function slider() {
    render(<Compare originalUrl="original" resultUrl="result" mode="slider" showOriginal={false} />)
    return screen.getByRole('slider', { name: 'Split' })
  }

  it('follows the pointer anywhere while the button is held', () => {
    const divider = slider()
    fireEvent.pointerDown(divider, { clientX: 100, button: 0, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 50, buttons: 1 })
    expect(divider).toHaveAttribute('aria-valuenow', '25')
    fireEvent.pointerMove(window, { clientX: 500, buttons: 1 })
    expect(divider).toHaveAttribute('aria-valuenow', '100')
  })

  it('stops when the button is released, even where it never saw the release', () => {
    const divider = slider()
    fireEvent.pointerDown(divider, { clientX: 100, button: 0, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 50, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 150, buttons: 0 })
    fireEvent.pointerMove(divider, { clientX: 150, buttons: 0 })
    expect(divider).toHaveAttribute('aria-valuenow', '25')

    fireEvent.pointerDown(divider, { clientX: 50, button: 0, buttons: 1 })
    fireEvent.pointerUp(window, { clientX: 50 })
    fireEvent.pointerMove(window, { clientX: 150, buttons: 1 })
    expect(divider).toHaveAttribute('aria-valuenow', '25')
  })
})

describe('Compare modes', () => {
  it('flips between the result and the original in place', () => {
    const { rerender } = render(
      <Compare originalUrl="original" resultUrl="result" mode="toggle" showOriginal={false} />,
    )
    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByAltText('Result').style.visibility).toBe('')
    expect(screen.getByAltText('Original').style.visibility).toBe('hidden')
    rerender(<Compare originalUrl="original" resultUrl="result" mode="toggle" showOriginal />)
    expect(screen.getByText('Original')).toBeInTheDocument()
    expect(screen.getByAltText('Original').style.visibility).toBe('')
    expect(screen.getByAltText('Result').style.visibility).toBe('hidden')
  })

  it('puts them side by side, with no divider to drag', () => {
    render(<Compare originalUrl="original" resultUrl="result" mode="side" showOriginal={false} />)
    expect(screen.getByAltText('Original')).toHaveAttribute('src', 'original')
    expect(screen.getByAltText('Result')).toHaveAttribute('src', 'result')
    expect(screen.queryByRole('slider')).toBe(null)
  })
})
