// @vitest-environment jsdom
// Downloading the Text tool's files (SPEC.md 6.12) against a fake site and Cache Storage.
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DOWNLOAD_CORRUPT, DOWNLOAD_FAILED, filesFor, noRoomWords } from '@/lib/ocr/files'
import { TEXT_CACHE, type Models } from '@/lib/ocr/models'
import { FakeCaches, FakeServer, fakeModels } from '@/lib/testing'
import { useTextFiles } from './useTextFiles'

let models: Models
let server: FakeServer
let caches: FakeCaches

beforeEach(() => {
  const fake = fakeModels()
  models = fake.models
  server = new FakeServer(fake.bytes)
  caches = new FakeCaches()
})

const paths = (script: 'latin-cjk' | 'korean') => filesFor(script, models).map((f) => f.path)
const total = (script: 'latin-cjk' | 'korean') => filesFor(script, models).reduce((sum, f) => sum + f.size, 0)

async function setUp() {
  const hook = renderHook(() => useTextFiles({ fetch: server.fetch, caches, origin: server.origin }, models))
  act(() => hook.result.current.check())
  await waitFor(() => expect(hook.result.current.held).not.toBeNull())
  return hook
}

describe('useTextFiles', () => {
  it('holds nothing at first', async () => {
    const { result } = await setUp()
    expect(result.current.held).toEqual([])
    expect(result.current.downloading).toBeNull()
  })

  it('deletes files an older manifest left, and keeps the rest', async () => {
    const cache = await caches.open(TEXT_CACHE)
    await cache.put(`${server.origin}/${models.runtime.path}`, new Response(server.files.get(models.runtime.path)))
    await cache.put(`${server.origin}/ocr/old-det.onnx`, new Response('old'))
    const { result } = await setUp()
    expect(result.current.held).toEqual([models.runtime.path])
    expect(caches.paths(TEXT_CACHE)).toEqual([models.runtime.path])
  })

  it('downloads a script’s files with progress, checks them and keeps them', async () => {
    const { result } = await setUp()
    server.holding = true
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.downloading?.done).toBeGreaterThan(0))
    expect(result.current.downloading).toMatchObject({ script: 'latin-cjk', total: total('latin-cjk') })
    // Nothing is kept until every file is good.
    expect(caches.paths(TEXT_CACHE)).toEqual([])
    server.holding = false
    act(() => server.release())
    await waitFor(() => expect(result.current.downloading).toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.held).toEqual(paths('latin-cjk'))
    const cache = await caches.open(TEXT_CACHE)
    const kept = await cache.match(`${server.origin}/${models.detector.path}`)
    expect(new Uint8Array(await kept!.arrayBuffer())).toEqual(server.files.get(models.detector.path))
  })

  it('fetches only what isn’t held for another script', async () => {
    const { result } = await setUp()
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.held).toHaveLength(4))
    server.requests = []
    act(() => result.current.download('korean'))
    await waitFor(() => expect(result.current.held).toHaveLength(6))
    expect(server.requests).toEqual(paths('korean').slice(2))
  })

  it('stops when cancelled halfway and keeps nothing', async () => {
    const { result } = await setUp()
    server.holding = true
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.downloading?.done).toBeGreaterThan(0))
    act(() => result.current.cancel())
    await waitFor(() => expect(result.current.downloading).toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.held).toEqual([])
    expect(caches.paths(TEXT_CACHE)).toEqual([])
  })

  it('says so when the connection fails', async () => {
    const { result } = await setUp()
    server.offline = true
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.error).toBe(DOWNLOAD_FAILED))
    expect(result.current.downloading).toBeNull()
  })

  it('says so when a file comes back missing', async () => {
    server.files.delete(models.detector.path)
    const { result } = await setUp()
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.error).toBe(DOWNLOAD_FAILED))
  })

  it('keeps nothing when a file doesn’t match its checksum', async () => {
    server.corrupt = models.scripts['latin-cjk'].characters.path
    const { result } = await setUp()
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.error).toBe(DOWNLOAD_CORRUPT))
    expect(caches.paths(TEXT_CACHE)).toEqual([])
    expect(result.current.held).toEqual([])
  })

  it('says how much room it needed when storage is full', async () => {
    caches.full = true
    const { result } = await setUp()
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.error).toBe(noRoomWords(total('latin-cjk'))))
    expect(caches.paths(TEXT_CACHE)).toEqual([])
  })

  it('clears a failure when the download is tried again', async () => {
    const { result } = await setUp()
    server.offline = true
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.error).toBe(DOWNLOAD_FAILED))
    server.offline = false
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.held).toHaveLength(4))
    expect(result.current.error).toBeNull()
  })

  it('removes everything it keeps', async () => {
    const { result } = await setUp()
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.held).toHaveLength(4))
    act(() => result.current.remove())
    await waitFor(() => expect(result.current.held).toEqual([]))
    expect(caches.stores.has(TEXT_CACHE)).toBe(false)
  })

  it('finds the files gone when the browser cleared them', async () => {
    const { result } = await setUp()
    act(() => result.current.download('latin-cjk'))
    await waitFor(() => expect(result.current.held).toHaveLength(4))
    await caches.delete(TEXT_CACHE)
    act(() => result.current.check())
    await waitFor(() => expect(result.current.held).toEqual([]))
  })
})
