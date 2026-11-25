import { describe, expect, it } from 'vitest'
import { rgba } from './pixels'
import type { Plan } from './plans/plan'
import { CANCELLED, createClient, WORKER_STOPPED, type Port, type Reply, type Request } from './protocol'
import { fakeInfo } from './testing'

const SHOWS = { avif: true, heic: false, jxl: false }
const PLAN: Plan = {
  kind: 'metadata',
  name: 'a (cleaned).jpg',
  type: 'image/jpeg',
  exifName: 'image.jpg',
  args: ['-all='],
  readBack: true,
}

/** A worker stand-in: records what was posted and lets the test reply. */
function fakePort() {
  const sent: Request[] = []
  const listeners: Record<string, (e: { data: Reply }) => void> = {}
  let terminated = false
  const port: Port = {
    postMessage: (message) => sent.push(message),
    addEventListener: (type: string, fn: (e: { data: Reply }) => void) => void (listeners[type] = fn),
    terminate: () => void (terminated = true),
  }
  return {
    port: () => port,
    get terminated() {
      return terminated
    },
    sent,
    reply: (data: Reply) => listeners.message?.({ data }),
    fail: (type: 'error' | 'messageerror' = 'error') => listeners[type]?.({} as { data: Reply }),
  }
}

describe('createClient', () => {
  it('opens a file: the picture comes first, then ImageInfo', async () => {
    const { port, sent, reply } = fakePort()
    const client = createClient(port)
    const file = new File(['x'], 'a.jpg')
    const pictures: unknown[] = []
    const result = client.open(file, SHOWS, (picture) => pictures.push(picture))
    expect(sent).toEqual([{ type: 'open', id: 1, file, shows: SHOWS }])
    reply({ type: 'picture', id: 1, picture: { type: 'file' } })
    expect(pictures).toEqual([{ type: 'file' }])
    const info = fakeInfo()
    reply({ type: 'done', id: 1, value: info })
    await expect(result).resolves.toBe(info)
  })

  it('asks for the upright picture as a PNG', async () => {
    const { port, sent, reply } = fakePort()
    const client = createClient(port)
    const png = client.png()
    expect(sent).toEqual([{ type: 'png', id: 1 }])
    const blob = new Blob(['png'], { type: 'image/png' })
    reply({ type: 'done', id: 1, value: blob })
    await expect(png).resolves.toBe(blob)
  })

  it('asks for an embedded item’s bytes by its id', async () => {
    const { port, sent, reply } = fakePort()
    const client = createClient(port)
    const item = client.extract('trailer')
    expect(sent).toEqual([{ type: 'extract', id: 1, item: 'trailer' }])
    const blob = new Blob(['PK'], { type: 'application/zip' })
    reply({ type: 'done', id: 1, value: blob })
    await expect(item).resolves.toBe(blob)
  })

  it('asks for the upright pixels at a size, and for one exact pixel', async () => {
    const { port, sent, reply } = fakePort()
    const client = createClient(port)
    const pixels = client.pixels(2048)
    const pixel = client.pixel(10, 20)
    expect(sent).toEqual([
      { type: 'pixels', id: 1, maxSide: 2048 },
      { type: 'pixel', id: 2, x: 10, y: 20 },
    ])
    const value = rgba(1, 1, () => [1, 2, 3, 4])
    reply({ type: 'done', id: 1, value })
    reply({ type: 'done', id: 2, value: [5, 6, 7, 8] })
    await expect(pixels).resolves.toBe(value)
    await expect(pixel).resolves.toEqual([5, 6, 7, 8])
  })

  it('rejects with the worker’s message when a request fails', async () => {
    const { port, reply } = fakePort()
    const client = createClient(port)
    const result = client.open(new File(['x'], 'a.txt'), SHOWS, () => {})
    reply({ type: 'failed', id: 1, message: 'Loupe can’t open this file.' })
    await expect(result).rejects.toThrow('Loupe can’t open this file.')
  })

  it('rejects everything pending, and everything after, once the worker has failed', async () => {
    const { port, sent, fail } = fakePort()
    const client = createClient(port)
    const pending = client.pixels(100)
    fail('messageerror')
    await expect(pending).rejects.toThrow(WORKER_STOPPED)
    await expect(client.pixel(0, 0)).rejects.toThrow(WORKER_STOPPED)
    expect(sent).toHaveLength(1)
  })

  it('runs a plan on the open file, passing on its progress', async () => {
    const { port, sent, reply } = fakePort()
    const client = createClient(port)
    const fractions: (number | null)[] = []
    const result = client.run(PLAN, (f) => fractions.push(f))
    expect(sent).toEqual([{ type: 'run', id: 1, plan: PLAN }])
    reply({ type: 'progress', id: 1, fraction: null })
    reply({ type: 'progress', id: 1, fraction: 0.5 })
    const value = { blob: new Blob(['x']), info: null }
    reply({ type: 'done', id: 1, value })
    await expect(result).resolves.toBe(value)
    expect(fractions).toEqual([null, 0.5])
  })

  it('cancels by replacing the worker, which reopens the open file before cancelling settles', async () => {
    const workers = [fakePort(), fakePort()]
    let started = 0
    const client = createClient(() => workers[started++].port())
    const file = new File(['x'], 'a.jpg')
    const opened = client.open(file, SHOWS, () => {})
    workers[0].reply({ type: 'done', id: 1, value: fakeInfo() })
    await opened
    const job = client.run(PLAN)
    let settled = false
    const cancelled = client.cancel().then(() => (settled = true))
    expect(workers[0].terminated).toBe(true)
    await expect(job).rejects.toThrow(CANCELLED)
    // The new worker holds nothing until it has the file again.
    expect(workers[1].sent).toEqual([{ type: 'open', id: 3, file, shows: SHOWS }])
    await Promise.resolve()
    expect(settled).toBe(false)
    workers[1].reply({ type: 'picture', id: 3, picture: { type: 'file' } })
    workers[1].reply({ type: 'done', id: 3, value: fakeInfo() })
    await cancelled
    // Replies from the old worker are ignored; the new one takes the next requests.
    workers[0].reply({ type: 'done', id: 2, value: null })
    void client.pixels(10)
    expect(workers[1].sent.at(-1)).toEqual({ type: 'pixels', id: 4, maxSide: 10 })
  })

  it('cancels even when nothing was open', async () => {
    const workers = [fakePort(), fakePort()]
    let started = 0
    const client = createClient(() => workers[started++].port())
    await client.cancel()
    expect(workers[1].sent).toEqual([])
  })

  it('ignores replies to requests it didn’t make', () => {
    const { port, reply } = fakePort()
    createClient(port)
    expect(() => reply({ type: 'done', id: 99, value: null })).not.toThrow()
  })
})
