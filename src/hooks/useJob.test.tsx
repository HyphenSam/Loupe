// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plan } from '@/lib/plans/plan'
import { FakeClient } from '@/lib/testing'
import { useJob } from './useJob'

const plan = (name = 'photo (cleaned).jpg'): Plan => ({
  kind: 'metadata',
  name,
  type: 'image/jpeg',
  exifName: 'image.jpg',
  args: ['-all='],
  readBack: true,
})
const blob = (size = 1200) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' })
const SOURCE = { size: 2400, doing: 'Removing' }

let urls = 0
beforeEach(() => {
  urls = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:result/${++urls}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

function setup() {
  const client = new FakeClient()
  const hook = renderHook(() => useJob(client))
  return { client, hook, job: () => hook.result.current }
}

describe('useJob', () => {
  it('keeps the job’s tag on its export, so the page can find what a tool made', async () => {
    const { client, job } = setup()
    act(() => job().start(plan(), { ...SOURCE, tag: 'export:3' }))
    await act(async () => client.runs[0].resolve({ blob: blob(), info: null }))
    expect(job().exports[0]).toMatchObject({ tag: 'export:3' })
  })

  it('runs one job, showing its progress, and adds the result to the exports, newest first', async () => {
    const { client, job } = setup()
    act(() => job().start(plan(), { ...SOURCE, notes: () => ['Nothing identifying is left.'] }))
    expect(job().state).toMatchObject({
      phase: 'running',
      doing: 'Removing',
      name: 'photo (cleaned).jpg',
      fraction: null,
    })
    act(() => client.runs[0].progress(0.4))
    expect(job().state).toMatchObject({ fraction: 0.4 })
    await act(async () => client.runs[0].resolve({ blob: blob(), info: null }))
    expect(job().state).toEqual({ phase: 'idle' })
    expect(job().exports).toEqual([
      expect.objectContaining({
        name: 'photo (cleaned).jpg',
        size: 1200,
        sourceSize: 2400,
        url: 'blob:result/1',
        notes: ['Nothing identifying is left.'],
        used: false,
      }),
    ])
    expect(job().note).toBe('photo (cleaned).jpg is ready to download.')

    act(() => job().start(plan(), SOURCE))
    await act(async () => client.runs[1].resolve({ blob: blob(), info: null }))
    expect(job().exports.map((e) => e.name)).toEqual(['photo (cleaned) (2).jpg', 'photo (cleaned).jpg'])
  })

  it('starts nothing while a job runs', () => {
    const { client, job } = setup()
    act(() => job().start(plan(), SOURCE))
    act(() => job().start(plan(), SOURCE))
    expect(client.runs).toHaveLength(1)
  })

  it('puts a failed job on the strip with its reason', async () => {
    const { client, job } = setup()
    act(() => job().start(plan(), SOURCE))
    await act(async () => client.runs[0].reject('ExifTool couldn’t change this file: it broke.'))
    expect(job().exports[0]).toMatchObject({ error: 'ExifTool couldn’t change this file: it broke.' })
    expect(job().note).toBe('photo (cleaned).jpg wasn’t made. ExifTool couldn’t change this file: it broke.')
    expect(job().state).toEqual({ phase: 'idle' })
  })

  it('cancels: “Cancelling…” until the new worker is ready, and nothing is added', async () => {
    const { client, job } = setup()
    act(() => job().start(plan(), SOURCE))
    act(() => void job().cancel())
    expect(job().state).toEqual({ phase: 'cancelling' })
    await act(async () => {})
    expect(job().state).toEqual({ phase: 'cancelling' })
    await act(async () => client.cancels[0]())
    expect(job().state).toEqual({ phase: 'idle' })
    expect(job().exports).toEqual([])
  })

  it('frees a result’s memory when it’s removed', async () => {
    const { client, job } = setup()
    act(() => job().start(plan(), SOURCE))
    await act(async () => client.runs[0].resolve({ blob: blob(), info: null }))
    act(() => job().remove(job().exports[0].id))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result/1')
    expect(job().exports).toEqual([])
  })

  it('asks before leaving while a job runs or a result hasn’t been downloaded, copied or opened', async () => {
    const { client, job } = setup()
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    act(() => job().start(plan(), SOURCE))
    expect(leave()).toBe(true)
    await act(async () => client.runs[0].resolve({ blob: blob(), info: null }))
    expect(job().unused).toBe(1)
    expect(leave()).toBe(true)
    act(() => job().used(job().exports[0].id))
    expect(job().unused).toBe(0)
    expect(leave()).toBe(false)
  })

  it('copies a result as a PNG, holding the slot until the clipboard has it', async () => {
    const { client, job } = setup()
    const written: unknown[] = []
    let finish!: () => void
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, unknown>) {}
      },
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: (items: unknown[]) => (written.push(...items), new Promise<void>((r) => (finish = r))) },
    })
    act(() => job().start(plan(), { ...SOURCE, png: (b) => ({ blob: b, format: 'jpeg', orientation: 6 }) }))
    const result = blob()
    await act(async () => client.runs[0].resolve({ blob: result, info: null }))
    let copied!: Promise<boolean>
    act(() => {
      copied = job().copy(job().exports[0].id)
    })
    expect(job().state).toEqual({ phase: 'copying' })
    expect(client.pngSources).toEqual([{ blob: result, format: 'jpeg', orientation: 6 }])
    expect(written).toHaveLength(1)
    await act(async () => finish())
    await expect(copied).resolves.toBe(true)
    expect(job().state).toEqual({ phase: 'idle' })
    expect(job().exports[0]).toMatchObject({ used: true })
    vi.unstubAllGlobals()
  })
})
