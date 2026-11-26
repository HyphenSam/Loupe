// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
