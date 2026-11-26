// @vitest-environment jsdom
// The Adjust preview (SPEC.md 6.10): the worker adjusts the stage-sized copy, one request at a time with the
// latest settings winning, and the page draws what comes back at most once a frame.
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEUTRAL, type Adjustments } from '@/lib/adjust'
import { rgba, type Pixels } from '@/lib/pixels'
import { AdjustPreview } from './AdjustPreview'

let frames: FrameRequestCallback[] = []
const drawn: Uint8ClampedArray[] = []
/** The worker's requests, each settled when the test says. */
let asked: { adjustments: Adjustments; resolve: (p: Pixels) => void }[] = []
const ask = (adjustments: Adjustments) => new Promise<Pixels>((resolve) => asked.push({ adjustments, resolve }))
const picture = (n: number) => rgba(2, 1, () => [n, n, n, 255])

beforeEach(() => {
  frames = []
  drawn.length = 0
  asked = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => frames.push(f))
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  // jsdom has no 2D canvas, nor ImageData.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: (data: ImageData) => drawn.push(data.data),
  } as unknown as CanvasRenderingContext2D)
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(public data: Uint8ClampedArray) {}
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
const settle = (i: number, p: Pixels) => act(async () => asked[i].resolve(p))
const preview = (adjustments: Adjustments) => (
  <AdjustPreview adjustments={adjustments} adjusted={ask} colorSpace="srgb" style={{}} />
)

describe('AdjustPreview', () => {
  it('asks the worker once at a time, for the latest settings, and draws each answer in a frame', async () => {
    const a = (contrast: number) => ({ ...NEUTRAL, exposure: 0.5, contrast })
    const { rerender } = render(preview(a(0)))
    rerender(preview(a(10)))
    rerender(preview(a(20)))
    expect(asked.map((r) => r.adjustments)).toEqual([a(0)])

    await settle(0, picture(1))
    // The settings moved on while the worker worked: it's asked for the latest, skipping 10.
    expect(asked.map((r) => r.adjustments)).toEqual([a(0), a(20)])
    expect(drawn).toHaveLength(0)
    flush()
    expect(drawn.map((d) => d[0])).toEqual([1])

    await settle(1, picture(2))
    flush()
    expect(drawn.map((d) => d[0])).toEqual([1, 2])
    // Nothing more until the sliders move again.
    flush()
    expect(asked).toHaveLength(2)
    rerender(preview(a(30)))
    expect(asked.map((r) => r.adjustments.contrast)).toEqual([0, 20, 30])
  })

  it('draws only the newest answer when two arrive in one frame', async () => {
    const { rerender } = render(preview({ ...NEUTRAL, shadows: 1 }))
    rerender(preview({ ...NEUTRAL, shadows: 2 }))
    await settle(0, picture(1))
    await settle(1, picture(2))
    flush()
    expect(drawn.map((d) => d[0])).toEqual([2])
  })
})
