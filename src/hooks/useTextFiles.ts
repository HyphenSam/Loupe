/** The Text tool's files on this device (SPEC.md 6.12): which are held in Cache Storage, downloading a script's with
 * progress and Cancel, and Remove. The download is the page's, not a job's, so other tools and jobs carry on. Each
 * file is checked against its SHA-256 and nothing is kept until all of them are good. */
import { useCallback, useRef, useState } from 'react'
import { Said } from '@/lib/errors'
import { DOWNLOAD_CORRUPT, DOWNLOAD_FAILED, filesFor, heldPaths, noRoomWords, staleKeys } from '@/lib/ocr/files'
import { MODELS, TEXT_CACHE, textCacheUrl, type Models } from '@/lib/ocr/models'
import type { Script } from '@/lib/ocr/scripts'

type CacheLike = {
  keys(): Promise<readonly { url: string }[]>
  put(url: string, response: Response): Promise<void>
  delete(url: string): Promise<boolean>
}

/** Where the files come from and are kept: the browser's `fetch` and `caches` on the page, fakes in tests. */
export type TextStore = {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  caches: { open(name: string): Promise<CacheLike>; delete(name: string): Promise<boolean> }
  origin: string
}

/** The page's own: looked up only when the Text tool first asks, so pages that never open it touch nothing. */
export const BROWSER_STORE: TextStore = {
  fetch: (url, init) => fetch(url, init),
  caches: {
    open: (name) => caches.open(name) as Promise<CacheLike>,
    delete: (name) => caches.delete(name),
  },
  get origin() {
    return location.origin
  },
}

export type Downloading = { script: Script; done: number; total: number }

/**
 * Where the files stand. `held` is what the latest look at the cache found, kept up to date in every phase but the
 * first:
 *
 *     unchecked → held (the first look)
 *     held → downloading → held (finished, with the files it kept; or cancelled)
 *                        → failed → downloading
 *
 * Remove makes it `held` with nothing. A look that finishes after a newer one has started, or after Remove, changes
 * nothing.
 */
export type TextFilesState =
  | { phase: 'unchecked' }
  | { phase: 'held'; held: string[] }
  | { phase: 'downloading'; held: string[]; downloading: Downloading }
  | { phase: 'failed'; held: string[]; error: string }

export type TextFiles = {
  state: TextFilesState
  /** The paths held, null until first checked. */
  held: string[] | null
  /** Looks at what's held again, deleting what an older manifest left. */
  check(): void
  /** Whether it started: not while another download runs. */
  download(script: Script): boolean
  cancel(): void
  remove(): void
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** A response's bytes, telling `onBytes` as each part arrives. */
async function readAll(response: Response, onBytes: (count: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || !response.body) throw new Said(DOWNLOAD_FAILED)
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    length += value.length
    onBytes(value.length)
  }
  const bytes = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

export function useTextFiles(store: TextStore, models: Models = MODELS): TextFiles {
  const [state, setState] = useState<TextFilesState>({ phase: 'unchecked' })
  const running = useRef<AbortController | null>(null)
  const latestHeld = useRef<string[]>([])
  // Counts looks and Removes, so only the latest one's answer is kept.
  const looks = useRef(0)

  const look = useCallback(async () => {
    const mine = ++looks.current
    let held: string[]
    try {
      const cache = await store.caches.open(TEXT_CACHE)
      const keys = (await cache.keys()).map((request) => request.url)
      const stale = staleKeys(keys, store.origin, models)
      await Promise.all(stale.map((key) => cache.delete(key)))
      held = heldPaths(keys.filter((key) => !stale.includes(key)))
    } catch {
      // No Cache Storage here (a private window in some browsers): nothing is held, and a download says why.
      held = []
    }
    if (mine !== looks.current) return
    latestHeld.current = held
    setState((s) => (s.phase === 'unchecked' ? { phase: 'held', held } : { ...s, held }))
  }, [store, models])

  const check = useCallback(() => void look(), [look])

  const download = useCallback(
    (script: Script) => {
      if (running.current) return false
      const controller = new AbortController()
      running.current = controller
      const needed = filesFor(script, models).filter((file) => !latestHeld.current.includes(file.path))
      const total = needed.reduce((sum, file) => sum + file.size, 0)
      let done = 0
      const downloading = (done: number) =>
        setState({ phase: 'downloading', held: latestHeld.current, downloading: { script, done, total } })
      downloading(done)
      void (async () => {
        const got: { url: string; bytes: Uint8Array<ArrayBuffer> }[] = []
        let kept: string[] = []
        let error: string | null = null
        try {
          for (const file of needed) {
            const url = textCacheUrl(file, store.origin)
            let response: Response
            try {
              response = await store.fetch(url, { signal: controller.signal })
            } catch (e) {
              throw controller.signal.aborted ? e : new Said(DOWNLOAD_FAILED)
            }
            const bytes = await readAll(response, (count) => {
              done += count
              downloading(done)
            }).catch((e: unknown) => {
              throw controller.signal.aborted || e instanceof Said ? e : new Said(DOWNLOAD_FAILED)
            })
            if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== file.sha256) throw new Said(DOWNLOAD_CORRUPT)
            got.push({ url, bytes })
          }
          if (controller.signal.aborted) return
          const cache = await store.caches.open(TEXT_CACHE)
          try {
            for (const { url, bytes } of got) await cache.put(url, new Response(bytes))
          } catch {
            // Nothing partial is kept.
            await Promise.all(got.map(({ url }) => cache.delete(url).catch(() => false)))
            throw new Said(noRoomWords(total))
          }
          kept = needed.map((file) => file.path)
        } catch (e) {
          if (!controller.signal.aborted) error = e instanceof Said ? e.message : DOWNLOAD_FAILED
        } finally {
          running.current = null
          // What it put counts as held at once; the look that follows confirms it.
          const held = [...latestHeld.current, ...kept]
          latestHeld.current = held
          setState(error ? { phase: 'failed', held, error } : { phase: 'held', held })
          await look()
        }
      })()
      return true
    },
    [store, models, look],
  )

  const cancel = useCallback(() => running.current?.abort(), [])

  const remove = useCallback(() => {
    const mine = ++looks.current
    void store.caches
      .delete(TEXT_CACHE)
      .catch(() => false)
      .then(() => {
        if (mine !== looks.current) return
        latestHeld.current = []
        setState({ phase: 'held', held: [] })
      })
  }, [store])

  const held = state.phase === 'unchecked' ? null : state.held
  return { state, held, check, download, cancel, remove }
}
