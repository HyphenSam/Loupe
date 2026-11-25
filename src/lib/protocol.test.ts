import { describe, expect, it } from 'vitest'
import { rgba } from './pixels'
import { createClient, WORKER_STOPPED, type Port, type Reply, type Request } from './protocol'
import { fakeInfo } from './testing'

const SHOWS = { avif: true, heic: false, jxl: false }

/** A worker stand-in: records what was posted and lets the test reply. */
function fakePort() {
  const sent: Request[] = []
  const listeners: Record<string, (e: { data: Reply }) => void> = {}
  const port: Port = {
    postMessage: (message) => sent.push(message),
    addEventListener: (type: string, fn: (e: { data: Reply }) => void) => void (listeners[type] = fn),
  }
  return {
    port,
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

  it('ignores replies to requests it didn’t make', () => {
    const { port, reply } = fakePort()
    createClient(port)
    expect(() => reply({ type: 'done', id: 99, value: null })).not.toThrow()
  })
})
