/** Messages between the page and the worker (SPEC.md section 7), and the page's promise-based client.
 * The worker holds the open file, its bytes and its decoded pixels between requests. */
import type { Capabilities } from './capabilities'
import type { Format } from './formats'
import type { ImageInfo, Orientation } from './info'
import type { Adjustments } from './adjust'
import type { Script } from './ocr/scripts'
import type { TextLine, TextProgress } from './ocr/types'
import type { Pixels } from './pixels'
import type { Plan } from './plans/plan'

/** A finished job: the result, and what it holds when the plan asked for it to be read again (Privacy). `fitted`:
 * the quality Export's target size search settled on, and whether the file fits (SPEC.md 6.11). */
export type RunResult = { blob: Blob; info: ImageInfo | null; fitted?: { quality: number; fits: boolean } | null }

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

/** Every request but `open` and `release` names the file it's about by its open's id (`fileId`, null before any), and the worker
 * refuses one about a file it doesn't hold with OTHER_FILE rather than answer for another. */
export type Request =
  | { type: 'open'; id: number; file: File; shows: Capabilities['shows'] }
  // The Text tool's models, whichever file is open.
  | { type: 'release'; id: number }
  | ({ id: number; fileId: number | null } & (
      | { type: 'pixels'; maxSide: number }
      | { type: 'adjusted'; maxSide: number; adjustments: Adjustments }
      | { type: 'pixel'; x: number; y: number }
      | { type: 'layer'; layer: Layer; quality: number; amount: number }
      | { type: 'fingerprint'; file?: File }
      | { type: 'thumbnail' }
      | { type: 'png'; source?: PngSource }
      | { type: 'extract'; item: string }
      | { type: 'run'; plan: Plan }
      | { type: 'text'; script: Script }
    ))

export type Reply =
  | { type: 'picture'; id: number; picture: StagePicture }
  | { type: 'progress'; id: number; fraction: number | null } // null = indeterminate
  | { type: 'reading'; id: number; progress: TextProgress } // the Text tool's read
  | { type: 'done'; id: number; value: unknown }
  | { type: 'failed'; id: number; message: string }

/** What the page asks of the worker. App takes one as a prop, so tests pass a fake. */
export type WorkerClient = {
  /** Opens a file: `onPicture` hears what the stage can show as soon as the worker knows, then the
   * promise settles with ImageInfo, or rejects with a sentence for the user. */
  open(file: File, shows: Capabilities['shows'], onPicture: (picture: StagePicture) => void): Promise<ImageInfo>
  /** The open picture's upright pixels, the longer side at most `maxSide`. */
  pixels(maxSide: number): Promise<Pixels>
  /** The same, adjusted (SPEC.md 6.10): Adjust's preview, worked out off the page so the sliders keep moving. */
  adjusted(maxSide: number, adjustments: Adjustments): Promise<Pixels>
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
  /** The open picture's lines of text in reading order (SPEC.md 6.12), read with `script`'s models from Cache
   * Storage. */
  text(script: Script, onProgress?: (progress: TextProgress) => void): Promise<TextLine[]>
  /** Frees the Text tool's models once any read has finished (Remove), so the next read loads them from the cache. */
  releaseText(): Promise<void>
  /** Runs a plan on the open file. */
  run(plan: Plan, onProgress?: (fraction: number | null) => void): Promise<RunResult>
  /** Stops the running job. Encoders can't be interrupted, so the worker is replaced (as Bytesize's
   * `EngineClient.restart`): everything waiting rejects with CANCELLED, and the new worker reopens the open
   * file under the same id. Resolves once it holds it again, or rejects with `notHeld`'s sentence when it can't. */
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
/** The worker's answer to a request about a file it doesn't hold: one still opening, or one it has lost. */
export const OTHER_FILE = 'Loupe doesn’t have that file open.'
/** A cancel's reopen failed, so the worker holds nothing. */
export const notHeld = (name: string, reason: string) =>
  `Loupe couldn’t open “${name}” again. ${reason} Choose the file again to carry on.`

type Waiting = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onPicture?: (picture: StagePicture) => void
  onProgress?: (fraction: number | null) => void
  onReading?: (progress: TextProgress) => void
}

/** Each request gets an id, and the reply with that id settles it (Moviola's). `start` makes a worker; it's
 * called again to replace one that was cancelled. */
export function createClient(start: () => Port): WorkerClient {
  let nextId = 1
  let pending = new Map<number, Waiting>()
  let stopped = false
  // The file requests are about, and the one the worker has said it holds. They differ while an open runs and while
  // a new worker reopens after a cancel; after a failed open, requests go back to the held file. An open overtaken by
  // another can finish in the worker without the client knowing whether it was kept: the worker's check refuses
  // requests then, and useSource has the file it shows opened again.
  type Asked = { id: number; file: File; shows: Capabilities['shows'] }
  let asked: Asked | null = null
  let held: Asked | null = null

  function listen(port: Port): Port {
    // Each worker answers only its own requests: a cancelled worker's late replies find nothing waiting.
    const mine = pending
    port.addEventListener('message', ({ data }) => {
      const waiting = mine.get(data.id)
      if (!waiting) return
      if (data.type === 'picture') return waiting.onPicture?.(data.picture)
      if (data.type === 'progress') return waiting.onProgress?.(data.fraction)
      if (data.type === 'reading') return waiting.onReading?.(data.progress)
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

  /** Asks the worker to open a file, keeping track of whether it holds it. */
  function hold(file: Asked, onPicture?: (picture: StagePicture) => void): Promise<ImageInfo> {
    asked = file
    return send<ImageInfo>({ type: 'open', ...file }, { onPicture }).then(
      (info) => {
        if (asked === file) held = file
        return info
      },
      (error: unknown) => {
        // The worker keeps the file it held when an open fails.
        if (asked === file) asked = held
        throw error
      },
    )
  }

  // A request's id, and the file it's about by its open's id.
  const about = () => ({ id: nextId++, fileId: asked?.id ?? null })

  return {
    open: (file, shows, onPicture) => hold({ id: nextId++, file, shows }, onPicture),
    pixels: (maxSide) => send<Pixels>({ type: 'pixels', ...about(), maxSide }),
    adjusted: (maxSide, adjustments) => send<Pixels>({ type: 'adjusted', ...about(), maxSide, adjustments }),
    pixel: (x, y) => send<Rgba | null>({ type: 'pixel', ...about(), x, y }),
    layer: (layer, quality, amount) => send<Pixels>({ type: 'layer', ...about(), layer, quality, amount }),
    fingerprint: (file) => send<Fingerprint>({ type: 'fingerprint', ...about(), ...(file ? { file } : {}) }),
    thumbnail: () => send<ThumbnailMatch | null>({ type: 'thumbnail', ...about() }),
    png: (source) => send<Blob>({ type: 'png', ...about(), ...(source ? { source } : {}) }),
    extract: (item) => send<Blob>({ type: 'extract', ...about(), item }),
    text: (script, onReading) => send<TextLine[]>({ type: 'text', ...about(), script }, { onReading }),
    releaseText: () => send<void>({ type: 'release', id: nextId++ }),
    run: (plan, onProgress) => send<RunResult>({ type: 'run', ...about(), plan }, { onProgress }),
    cancel: async () => {
      port.terminate()
      const old = pending
      pending = new Map()
      stopped = false
      for (const waiting of old.values()) waiting.reject(new Error(CANCELLED))
      port = listen(start())
      held = null
      const reopening = asked
      if (!reopening) return
      await hold(reopening).catch((error: unknown) => {
        // A file asked for since speaks for itself.
        if (asked) return
        throw new Error(notHeld(reopening.file.name, error instanceof Error ? error.message : String(error)))
      })
    },
  }
}
