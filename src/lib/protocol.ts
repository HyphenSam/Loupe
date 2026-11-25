/** Messages between the page and the worker (SPEC.md section 7), and the page's promise-based client.
 * The worker holds the open file, its bytes and its decoded pixels between requests. */
import type { Capabilities } from './capabilities'
import type { Format } from './formats'
import type { ImageInfo, Orientation } from './info'
import type { Pixels } from './pixels'
import type { Plan } from './plans/plan'

/** A finished job: the result, and what it holds when the plan asked for it to be read again (Privacy). */
export type RunResult = { blob: Blob; info: ImageInfo | null }

/** A picture other than the open one for `png` to convert: a result, which Copy puts on the clipboard. */
export type PngSource = { blob: Blob; format: Format; orientation: Orientation }

/** What the stage shows: the file itself in an `<img>` where the browser decodes it, upright pixels the
 * worker decoded (a raw file's embedded preview, or scaled to fit a canvas this browser can make), or why
 * there's no picture. */
export type StagePicture =
  | { type: 'file' }
  | { type: 'pixels'; pixels: Pixels; scaled: boolean; preview: boolean }
  | { type: 'none'; message: string }

export type Rgba = [number, number, number, number]

/** What the stage draws over the picture: Forensics' layers (SPEC.md 6.5) and the depth map. */
export type Layer = 'ela' | 'noise' | 'depth'

/** A file's SHA-256 and its picture's perceptual hash, both in hexadecimal; no hash when Loupe can't show the
 * picture (TIFF, a raw file without a preview). */
export type Fingerprint = { sha256: string; phash: string | null }

/** The largest embedded thumbnail or preview, upright, beside a small copy of the picture, both as PNGs, and
 * whether they match (`thumbnailCheck`). */
export type ThumbnailMatch = {
  label: string
  thumbnail: Blob
  picture: Blob
  matches: boolean
  distance: number
  aspectDiffers: boolean
}

export type Request =
  | { type: 'open'; id: number; file: File; shows: Capabilities['shows'] }
  | { type: 'pixels'; id: number; maxSide: number }
  | { type: 'pixel'; id: number; x: number; y: number }
  | { type: 'layer'; id: number; layer: Layer; quality: number; amount: number }
  | { type: 'fingerprint'; id: number; file?: File }
  | { type: 'thumbnail'; id: number }
  | { type: 'png'; id: number; source?: PngSource }
  | { type: 'extract'; id: number; item: string }
  | { type: 'run'; id: number; plan: Plan }

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
  /** A layer of the open picture, upright, as opaque grey pixels: error levels re-saved at `quality`, or noise,
   * each amplified by `amount`; or the depth map as it's stored, at its own size. */
  layer(layer: Layer, quality: number, amount: number): Promise<Pixels>
  /** The open file's fingerprints, or `file`'s (Compare with another image). */
  fingerprint(file?: File): Promise<Fingerprint>
  /** The open file's largest embedded thumbnail or preview beside its picture; null when it has none. */
  thumbnail(): Promise<ThumbnailMatch | null>
  /** The open picture, or `source`, upright, as a PNG: what Check on SynthID and Copy put on the clipboard. */
  png(source?: PngSource): Promise<Blob>
  /** An embedded item of the open file (`Embedded.id`), its bytes as they are. */
  extract(item: string): Promise<Blob>
  /** Runs a plan on the open file. */
  run(plan: Plan, onProgress?: (fraction: number | null) => void): Promise<RunResult>
  /** Stops the running job. Encoders can't be interrupted, so the worker is replaced (as Bytesize's
   * `EngineClient.restart`): everything waiting rejects with CANCELLED, and the new worker reopens the open
   * file. Settles once it has. */
  cancel(): Promise<void>
}

/** The parts of a Worker the client uses. */
export type Port = {
  postMessage(message: Request): void
  addEventListener(type: 'message', listener: (event: { data: Reply }) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
  terminate(): void
}

export const WORKER_STOPPED = 'Loupe’s background worker stopped. Reload the page to carry on.'
export const CANCELLED = 'Cancelled.'

type Waiting = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onPicture?: (picture: StagePicture) => void
  onProgress?: (fraction: number | null) => void
}

/** Each request gets an id, and the reply with that id settles it (Moviola's). `start` makes a worker; it's
 * called again to replace one that was cancelled. */
export function createClient(start: () => Port): WorkerClient {
  let nextId = 1
  let pending = new Map<number, Waiting>()
  let stopped = false
  // What the worker was last asked to open, so a new worker can hold it too.
  let opened: { file: File; shows: Capabilities['shows'] } | null = null

  function listen(port: Port): Port {
    // Each worker answers only its own requests: a cancelled worker's late replies find nothing waiting.
    const mine = pending
    port.addEventListener('message', ({ data }) => {
      const waiting = mine.get(data.id)
      if (!waiting) return
      if (data.type === 'picture') return waiting.onPicture?.(data.picture)
      if (data.type === 'progress') return waiting.onProgress?.(data.fraction)
      mine.delete(data.id)
      if (data.type === 'done') waiting.resolve(data.value)
      else waiting.reject(new Error(data.message))
    })
    // A worker that failed answers nothing more, so everything waiting is told, and so is whatever is asked
    // afterwards: a promise left pending would show as "Reading metadata…" for ever.
    const stop = () => {
      if (mine !== pending) return
      stopped = true
      for (const waiting of mine.values()) waiting.reject(new Error(WORKER_STOPPED))
      mine.clear()
    }
    port.addEventListener('error', stop)
    port.addEventListener('messageerror', stop)
    return port
  }

  let port = listen(start())

  function send<T>(request: Request, on: Omit<Waiting, 'resolve' | 'reject'> = {}): Promise<T> {
    if (stopped) return Promise.reject(new Error(WORKER_STOPPED))
    return new Promise<T>((resolve, reject) => {
      pending.set(request.id, { resolve: resolve as (value: unknown) => void, reject, ...on })
      port.postMessage(request)
    })
  }

  return {
    open: (file, shows, onPicture) => {
      opened = { file, shows }
      return send<ImageInfo>({ type: 'open', id: nextId++, file, shows }, { onPicture })
    },
    pixels: (maxSide) => send<Pixels>({ type: 'pixels', id: nextId++, maxSide }),
    pixel: (x, y) => send<Rgba | null>({ type: 'pixel', id: nextId++, x, y }),
    layer: (layer, quality, amount) => send<Pixels>({ type: 'layer', id: nextId++, layer, quality, amount }),
    fingerprint: (file) => send<Fingerprint>({ type: 'fingerprint', id: nextId++, ...(file ? { file } : {}) }),
    thumbnail: () => send<ThumbnailMatch | null>({ type: 'thumbnail', id: nextId++ }),
    png: (source) => send<Blob>({ type: 'png', id: nextId++, ...(source ? { source } : {}) }),
    extract: (item) => send<Blob>({ type: 'extract', id: nextId++, item }),
    run: (plan, onProgress) => send<RunResult>({ type: 'run', id: nextId++, plan }, { onProgress }),
    cancel: async () => {
      port.terminate()
      const old = pending
      pending = new Map()
      stopped = false
      for (const waiting of old.values()) waiting.reject(new Error(CANCELLED))
      port = listen(start())
      if (!opened) return
      await send({ type: 'open', id: nextId++, file: opened.file, shows: opened.shows }).catch(() => {})
    },
  }
}
