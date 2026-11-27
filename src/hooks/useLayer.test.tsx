// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYERS } from '@/lib/forensics/layer'
import { rgba, type Pixels } from '@/lib/pixels'
import type { Layer } from '@/lib/protocol'
import { useLayer } from './useLayer'

const picture = (n: number) => rgba(1, 1, () => [n, n, n, 255])

describe('useLayer', () => {
  it('asks again for a newly opened file with the same settings, dropping the old file’s answer', async () => {
    const asked: { amount: number; resolve: (p: Pixels) => void }[] = []
    const ask = (_layer: Layer, _quality: number, amount: number) =>
      new Promise<Pixels>((resolve) => asked.push({ amount, resolve }))
    const { result, rerender } = renderHook(({ source }) => useLayer('ela', DEFAULT_LAYERS, ask, source), {
      initialProps: { source: 'a' },
    })
    rerender({ source: 'b' })
    expect(asked).toHaveLength(1)

    await act(async () => asked[0].resolve(picture(1)))
    expect(asked).toHaveLength(2)
    expect(result.current).toMatchObject({ pixels: null, busy: true })
    await act(async () => asked[1].resolve(picture(2)))
    expect(result.current).toMatchObject({ pixels: picture(2), busy: false })
  })
})
