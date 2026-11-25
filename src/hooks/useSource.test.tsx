// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ALL_CAPABLE, FakeClient, fakeInfo } from '@/lib/testing'
import { useSource } from './useSource'

const file = (name: string) => new File(['x'], name)

function setup() {
  const client = new FakeClient()
  const hook = renderHook(() => useSource(client, ALL_CAPABLE.shows))
  return { client, hook }
}

describe('useSource', () => {
  it('shows the new file at once, then its picture, then its info and pixels', async () => {
    const { client, hook } = setup()
    act(() => hook.result.current.open(file('a.jpg')))
    expect(hook.result.current.source).toMatchObject({ file: { name: 'a.jpg' }, picture: null, info: null })
    expect(client.last.shows).toEqual(ALL_CAPABLE.shows)

    act(() => client.last.picture({ type: 'file' }))
    expect(hook.result.current.source!.picture).toEqual({ type: 'file' })

    const info = fakeInfo({ name: 'a.jpg' })
    await act(async () => client.last.resolve(info))
    expect(hook.result.current.source!.info).toBe(info)
    await waitFor(() => expect(hook.result.current.source!.pixels).toBe(client.image))
    expect(client.pixelRequests).toEqual([2048])
  })

  it('gives each open a new id, even for the same file again', async () => {
    const { client, hook } = setup()
    const same = file('a.jpg')
    act(() => hook.result.current.open(same))
    const first = hook.result.current.source!.id
    act(() => hook.result.current.open(same))
    expect(hook.result.current.source!.id).not.toBe(first)
    expect(client.opens).toHaveLength(2)
  })

  it('keeps the previous file open when the next can’t be opened, and says why', async () => {
    const { client, hook } = setup()
    act(() => hook.result.current.open(file('a.jpg')))
    await act(async () => client.last.resolve(fakeInfo({ name: 'a.jpg' })))
    act(() => hook.result.current.open(file('notes.txt')))
    expect(hook.result.current.source!.file.name).toBe('notes.txt')
    await act(async () => client.last.reject('Loupe can’t open this file.'))
    expect(hook.result.current.source!.file.name).toBe('a.jpg')
    expect(hook.result.current.source!.info).not.toBe(null)
    expect(hook.result.current.error).toBe('Loupe can’t open this file.')
  })

  // The worker keeps an open that finished before a newer one reached it, even when the page has moved on and
  // drops its answer: so going back means asking the worker to hold the previous file again.
  it('has the worker open the previous file again when the next can’t be opened', async () => {
    const { client, hook } = setup()
    const a = file('a.jpg')
    act(() => hook.result.current.open(a))
    await act(async () => client.last.resolve(fakeInfo({ name: 'a.jpg' })))
    const shown = hook.result.current.source
    act(() => hook.result.current.open(file('b.jpg')))
    const overtaken = client.last
    act(() => hook.result.current.open(file('notes.txt')))
    const failing = client.last
    await act(async () => overtaken.resolve(fakeInfo({ name: 'b.jpg' })))
    await act(async () => failing.reject('Loupe can’t open this file.'))
    expect(client.opens.map((o) => o.file.name)).toEqual(['a.jpg', 'b.jpg', 'notes.txt', 'a.jpg'])
    expect(client.last.file).toBe(a)
    // The page already shows it: the worker's answer changes nothing, and neither would its failure.
    await act(async () => client.last.resolve(fakeInfo({ name: 'a.jpg' })))
    expect(hook.result.current.source).toBe(shown)
    expect(hook.result.current.error).toBe('Loupe can’t open this file.')
  })

  it('asks the worker for nothing more when the first file can’t be opened', async () => {
    const { client, hook } = setup()
    act(() => hook.result.current.open(file('notes.txt')))
    await act(async () => client.last.reject('No.'))
    expect(client.opens).toHaveLength(1)
  })

  it('clears the error when another file opens, or when dismissed', async () => {
    const { client, hook } = setup()
    act(() => hook.result.current.open(file('notes.txt')))
    await act(async () => client.last.reject('No.'))
    expect(hook.result.current.source).toBe(null)
    expect(hook.result.current.error).toBe('No.')
    act(() => hook.result.current.dismissError())
    expect(hook.result.current.error).toBe(null)
    await act(async () => client.last.reject('No.'))
    act(() => hook.result.current.open(file('b.jpg')))
    expect(hook.result.current.error).toBe(null)
  })

  it('lets the last open win: a slower earlier one is dropped', async () => {
    const { client, hook } = setup()
    act(() => hook.result.current.open(file('a.jpg')))
    const slow = client.last
    act(() => hook.result.current.open(file('b.jpg')))
    const fast = client.last
    await act(async () => fast.resolve(fakeInfo({ name: 'b.jpg' })))
    await act(async () => slow.resolve(fakeInfo({ name: 'a.jpg' })))
    act(() => slow.picture({ type: 'file' }))
    expect(hook.result.current.source!.info!.name).toBe('b.jpg')
    expect(hook.result.current.source!.picture).toBe(null)
  })

  it('asks for no pixels when there’s no picture to read', async () => {
    const { client, hook } = setup()
    act(() => hook.result.current.open(file('scan.tif')))
    act(() => client.last.picture({ type: 'none', message: 'Loupe can’t show TIFF pictures yet.' }))
    await act(async () => client.last.resolve(fakeInfo({ format: 'tiff' })))
    expect(client.pixelRequests).toEqual([])
    expect(hook.result.current.source!.pixels).toBe(null)
  })
})
