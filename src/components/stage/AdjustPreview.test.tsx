// @vitest-environment jsdom
// The Adjust preview (SPEC.md 6.10): the stage-sized copy adjusted and drawn, at most once a frame however often
// the sliders move.
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adjust, NEUTRAL } from '@/lib/adjust'
import { rgba } from '@/lib/pixels'
import { AdjustPreview } from './AdjustPreview'

const preview = rgba(4, 3, (x, y) => [x * 60, y * 80, 100, 255])
let frames: FrameRequestCallback[] = []
const drawn: ImageData[] = []

beforeEach(() => {
  frames = []
  drawn.length = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => frames.push(f))
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  // jsdom has no 2D canvas.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: (data: ImageData) => drawn.push(data),
  } as unknown as CanvasRenderingContext2D)
  // Nor ImageData.
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const flush = () =>
  act(() => {
    const due = frames
    frames = []
    due.forEach((f) => f(0))
  })

describe('AdjustPreview', () => {
  it('draws the latest adjustment once a frame', () => {
    const a = { ...NEUTRAL, exposure: 0.5 }
    const { rerender } = render(<AdjustPreview preview={preview} adjustments={a} colorSpace="srgb" style={{}} />)
    rerender(<AdjustPreview preview={preview} adjustments={{ ...a, contrast: 10 }} colorSpace="srgb" style={{}} />)
    rerender(<AdjustPreview preview={preview} adjustments={{ ...a, contrast: 20 }} colorSpace="srgb" style={{}} />)
    expect(drawn).toHaveLength(0)
    flush()
    expect(drawn).toHaveLength(1)
    expect(Array.from(drawn[0].data)).toEqual(Array.from(adjust(preview, { ...a, contrast: 20 }).data))
    // Nothing more until the sliders move again.
    flush()
    expect(drawn).toHaveLength(1)
    rerender(<AdjustPreview preview={preview} adjustments={{ ...a, contrast: 30 }} colorSpace="srgb" style={{}} />)
    flush()
    expect(drawn).toHaveLength(2)
  })
})
