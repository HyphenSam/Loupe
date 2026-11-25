// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOnline } from './useOnline'

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
}

describe('useOnline', () => {
  afterEach(() => vi.restoreAllMocks())

  it('starts from navigator.onLine', () => {
    setOnline(false)
    expect(renderHook(() => useOnline()).result.current).toBe(false)
    setOnline(true)
    expect(renderHook(() => useOnline()).result.current).toBe(true)
  })

  it('follows the online and offline events', () => {
    setOnline(true)
    const { result } = renderHook(() => useOnline())
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('stops listening once unmounted', () => {
    setOnline(true)
    const remove = vi.spyOn(window, 'removeEventListener')
    renderHook(() => useOnline()).unmount()
    expect(remove.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['online', 'offline']))
  })
})
