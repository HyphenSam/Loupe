// @vitest-environment jsdom
// The 360° view's start under StrictMode, with a fake WebGL 2 context (jsdom has none).
import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rgba } from '@/lib/pixels'
import { PanoramaView } from './PanoramaView'

/** A WebGL 2 context that does nothing, and, like a real one, hands back nothing once it has been lost. */
function fakeGl() {
  let lost = false
  const uploads: number[] = []
  const gl = new Proxy({} as Record<string | symbol, unknown>, {
    get(_, key) {
      if (typeof key !== 'string') return undefined
      if (/^[A-Z_0-9]+$/.test(key)) return key
      if (key === 'getExtension') return () => ({ loseContext: () => (lost = true) })
      if (key === 'isContextLost') return () => lost
      if (key === 'getParameter') return () => 4096
      if (key === 'texImage2D') return (...args: unknown[]) => !lost && uploads.push(args[3] as number)
      return () => (lost ? null : {})
    },
  })
  return { gl, uploads }
}

afterEach(() => vi.restoreAllMocks())

describe('PanoramaView', () => {
  it('starts WebGL once and draws the picture when React runs its effects twice', async () => {
    const { gl, uploads } = fakeGl()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as unknown as WebGL2RenderingContext)
    render(
      <StrictMode>
        <PanoramaView
          name="pano.jpg"
          pixels={async () => rgba(4, 2, () => [0, 0, 0, 255])}
          views={['picture', 'pano']}
          view="pano"
          onView={() => {}}
          light={false}
        />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.queryByText('Loading the panorama…')).toBeNull())
    expect(screen.queryByText(/couldn’t start WebGL 2/)).toBeNull()
    expect(uploads).toEqual([4])
  })
})
