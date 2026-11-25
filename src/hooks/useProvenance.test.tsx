// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FakeProvenance, fakeStore } from '@/lib/testing'
import { useProvenance } from './useProvenance'

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

function setup(first: File | null = file('a.jpg')) {
  const reader = new FakeProvenance()
  const hook = renderHook(({ f }) => useProvenance(reader, f), { initialProps: { f: first } })
  return { reader, hook }
}

describe('useProvenance', () => {
  it('reads the open file’s Content Credentials and turns them into findings', async () => {
    const { reader, hook } = setup()
    expect(hook.result.current.status).toBe('reading')
    expect(reader.last.file.name).toBe('a.jpg')
    await act(async () => reader.last.resolve({ store: fakeStore(), thumbnails: {} }))
    const p = hook.result.current
    expect(p.status).toBe('read')
    if (p.status !== 'read') return
    expect(p.credentials).toMatchObject({ state: 'trusted', signer: 'OpenAI', claim: 'made' })
    expect(p.store).toEqual(fakeStore())
  })

  it('knows when the bundled trust lists were fetched', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.bundledOn).toBe('2026-11-25'))
  })

  it('reads no credentials as none', async () => {
    const { reader, hook } = setup()
    await act(async () => reader.last.resolve(null))
    expect(hook.result.current).toMatchObject({ status: 'read', credentials: null, store: null })
  })

  it('gives each thumbnail an object URL and revokes them for the next file', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { reader, hook } = setup()
    await act(async () => reader.last.resolve({ store: fakeStore(), thumbnails: { t1: new Blob(['j']) } }))
    const p = hook.result.current
    const url = p.status === 'read' ? p.thumbnails.t1 : null
    expect(url).toMatch(/^blob:/)
    hook.rerender({ f: file('b.jpg') })
    expect(revoke).toHaveBeenCalledWith(url)
    expect(hook.result.current.status).toBe('reading')
  })

  it('keeps only the latest file’s answer', async () => {
    const { reader, hook } = setup()
    const first = reader.last
    hook.rerender({ f: file('b.jpg') })
    await act(async () => first.resolve({ store: fakeStore(), thumbnails: {} }))
    expect(hook.result.current.status).toBe('reading')
    await act(async () => reader.last.resolve(null))
    expect(hook.result.current).toMatchObject({ status: 'read', credentials: null })
  })

  it('says why when the SDK can’t read them', async () => {
    const { reader, hook } = setup()
    await act(async () => reader.last.reject('wasm failed'))
    expect(hook.result.current).toMatchObject({
      status: 'failed',
      message: 'Loupe couldn’t read the Content Credentials: wasm failed',
    })
  })

  it('reads nothing without a file', () => {
    const { reader, hook } = setup(null)
    expect(hook.result.current.status).toBe('none')
    expect(reader.reads).toHaveLength(0)
  })
})
