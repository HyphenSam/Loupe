// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useZoomPan } from './useZoomPan'

describe('useZoomPan', () => {
  it('goes back to fit when zoomed out to the viewport, though fit leaves a margin', () => {
    const size = { width: 1000, height: 500 }
    const viewport = { width: 500, height: 500 }
    // Fit at 0.4 with room around the picture, below the 0.5 zooming stops at.
    const { result } = renderHook(() =>
      useZoomPan({ size, viewport, stage: { current: null }, fit: () => ({ scale: 0.4, x: 50, y: 150 }) }),
    )
    act(() => result.current.zoomBy(2))
    expect(result.current.view?.scale).toBeCloseTo(0.8)
    act(() => result.current.zoomBy(0.5))
    expect(result.current.view).toBe(null)
  })
})

describe('useZoomPan pinch', () => {
  const size = { width: 1000, height: 1000 }
  const viewport = { width: 500, height: 500 }
  const captured: number[] = []
  const target = { setPointerCapture: (id: number) => captured.push(id) } as unknown as Element
  const pointer = (pointerId: number, clientX: number, clientY: number, isPrimary = false) => ({
    pointerId,
    isPrimary,
    clientX,
    clientY,
    button: 0,
    currentTarget: target,
    stopPropagation: vi.fn(),
  })
  const fit = () => ({ scale: 0.5, x: 0, y: 0 })
  /** A finger pressed, moved or lifted as the stage sees it: capture phase, then bubbling. */
  const down = (h: ReturnType<typeof useZoomPan>['handlers'], p: ReturnType<typeof pointer>) => {
    h.onPointerDownCapture(p)
    if (!p.stopPropagation.mock.calls.length) h.onPointerDown(p)
  }
  const move = (h: ReturnType<typeof useZoomPan>['handlers'], p: ReturnType<typeof pointer>) => {
    h.onPointerMoveCapture(p)
    if (!p.stopPropagation.mock.calls.length) h.onPointerMove(p)
  }

  it('zooms from fit when two fingers spread, taking both from what is under them', () => {
    captured.length = 0
    const { result } = renderHook(() => useZoomPan({ size, viewport, stage: { current: null }, fit }))
    const second = pointer(2, 300, 250)
    act(() => {
      down(result.current.handlers, pointer(1, 200, 250))
      down(result.current.handlers, second)
    })
    expect(second.stopPropagation).toHaveBeenCalled()
    expect(captured).toEqual([1, 2])
    const spread = pointer(2, 400, 250)
    act(() => move(result.current.handlers, spread))
    // 100 px apart to 200: twice the fit scale.
    expect(result.current.view?.scale).toBeCloseTo(1)
    expect(spread.stopPropagation).toHaveBeenCalled()
  })

  it('pinching back in goes back to fit, and a finger lifted stops the pinch', () => {
    const { result } = renderHook(() => useZoomPan({ size, viewport, stage: { current: null }, fit }))
    act(() => {
      down(result.current.handlers, pointer(1, 200, 250))
      down(result.current.handlers, pointer(2, 300, 250))
    })
    act(() => move(result.current.handlers, pointer(2, 400, 250)))
    act(() => move(result.current.handlers, pointer(2, 250, 250)))
    expect(result.current.view).toBe(null)
    act(() => result.current.handlers.onPointerUpCapture(pointer(2, 250, 250)))
    const alone = pointer(1, 100, 250)
    act(() => move(result.current.handlers, alone))
    expect(result.current.view).toBe(null)
    expect(alone.stopPropagation).not.toHaveBeenCalled()
  })

  it('starts afresh when a first finger lands, though a lift was missed', () => {
    const { result } = renderHook(() => useZoomPan({ size, viewport, stage: { current: null }, fit }))
    // Finger 7 went down and its lift never came.
    act(() => down(result.current.handlers, pointer(7, 100, 100, true)))
    act(() => down(result.current.handlers, pointer(1, 200, 250, true)))
    const alone = pointer(1, 300, 250)
    act(() => move(result.current.handlers, alone))
    expect(alone.stopPropagation).not.toHaveBeenCalled()
    expect(result.current.view).toBe(null)
  })
})
