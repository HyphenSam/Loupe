/** Messages between the page and the worker (SPEC.md section 7), and the page's promise-based client.
 * The worker holds the open file, its bytes and its decoded pixels between requests. Jobs (run, cancel)
 * and the forensic layers, PNG copies, extraction and fingerprints join in later phases. */
import type { Capabilities } from './capabilities'
import type { ImageInfo } from './info'
import type { Pixels } from './pixels'

/** What the stage shows: the file itself in an `<img>` where the browser decodes it, upright pixels the
 * worker decoded (a raw file's embedded preview, or scaled to fit a canvas this browser can make), or why
 * there's no picture. */
export type StagePicture =
  | { type: 'file' }
  | { type: 'pixels'; pixels: Pixels; scaled: boolean; preview: boolean }
  | { type: 'none'; message: string }

export type Rgba = [number, number, number, number]

export type Request =
  | { type: 'open'; id: number; file: File; shows: Capabilities['shows'] }
  | { type: 'pixels'; id: number; maxSide: number }
  | { type: 'pixel'; id: number; x: number; y: number }

export type Reply =
  | { type: 'picture'; id: number; picture: StagePicture }
  | { type: 'progress'; id: number; fraction: number | null } // null = indeterminate
  | { type: 'done'; id: number; value: unknown }
  | { type: 'failed'; id: number; message: string }

/** What the page asks of the worker. App takes one as a prop, so tests pass a fake. */
export type WorkerClient = {
  /** Opens a file: `onPicture` hears what the stage can show as soon as the worker knows, then the
   * promise settles with ImageInfo, or rejects with a sentence for the user. */
  open(file: File, shows: Capabilities['shows'], onPicture: (picture: StagePicture) => void): Promise<ImageInfo>
  /** The open picture's upright pixels, the longer side at most `maxSide`. */
  pixels(maxSide: number): Promise<Pixels>
  /** One exact pixel of the open picture, upright; null outside it. */
  pixel(x: number, y: number): Promise<Rgba | null>
}

/** The parts of a Worker the client uses. */
export type Port = {
  postMessage(message: Request): void
  addEventListener(type: 'message', listener: (event: { data: Reply }) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
}

export const WORKER_STOPPED = 'Loupe’s background worker stopped. Reload the page to carry on.'

type Waiting = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onPicture?: (picture: StagePicture) => void
}

/** Each request gets an id, and the reply with that id settles it (Moviola's). */
export function createClient(port: Port): WorkerClient {
  let nextId = 1
  const pending = new Map<number, Waiting>()

  port.addEventListener('message', ({ data }) => {
    const waiting = pending.get(data.id)
    if (!waiting) return
    if (data.type === 'picture') return waiting.onPicture?.(data.picture)
    if (data.type === 'progress') return
    pending.delete(data.id)
    if (data.type === 'done') waiting.resolve(data.value)
    else waiting.reject(new Error(data.message))
  })

  // A worker that failed answers nothing more, so everything waiting is told, and so is whatever is asked
  // afterwards: a promise left pending would show as "Reading metadata…" for ever.
  let stopped = false
  const stop = () => {
    stopped = true
    for (const waiting of pending.values()) waiting.reject(new Error(WORKER_STOPPED))
    pending.clear()
  }
  port.addEventListener('error', stop)
  port.addEventListener('messageerror', stop)

  function send<T>(request: Request, onPicture?: Waiting['onPicture']): Promise<T> {
    if (stopped) return Promise.reject(new Error(WORKER_STOPPED))
    return new Promise<T>((resolve, reject) => {
      pending.set(request.id, { resolve: resolve as (value: unknown) => void, reject, onPicture })
      port.postMessage(request)
    })
  }

  return {
    open: (file, shows, onPicture) => send<ImageInfo>({ type: 'open', id: nextId++, file, shows }, onPicture),
    pixels: (maxSide) => send<Pixels>({ type: 'pixels', id: nextId++, maxSide }),
    pixel: (x, y) => send<Rgba | null>({ type: 'pixel', id: nextId++, x, y }),
  }
}
