import { useCallback, useEffect, useRef, useState } from 'react'
import { uniqueName } from '@/lib/names'
import type { Plan } from '@/lib/plans/plan'
import { CANCELLED, type PngSource, type RunResult, type WorkerClient } from '@/lib/protocol'

/** A result in the exports strip (SPEC.md section 7): held in memory with a URL to download it, or failed.
 * `notes` say what the job found on reading it back; `png` is how Copy turns it into a PNG, null where it
 * can't; `used` once it's been downloaded, copied or opened, so leaving no longer asks about it. */
export type Export = { id: number; name: string; sourceSize: number; tag?: string } & (
  | { blob: Blob; url: string; size: number; notes: string[]; png: PngSource | null; used: boolean; error?: never }
  | { error: string; blob?: never; url?: never; size?: never; notes?: never; png?: never; used?: never }
)

export type Made = Extract<Export, { url: string }>

/**
 * Where the one job slot stands (SPEC.md section 7, Moviola's without the save dialog). Anything but `idle`
 * holds the slot, so nothing else can start:
 *
 *     idle → running → idle (an export, made or failed)
 *     idle → copying → idle
 *     running → cancelling → idle
 *
 * `cancelling` lasts until the new worker has reopened the file, or has said it couldn’t (`error`).
 */
export type JobState =
  | { phase: 'idle' }
  | { phase: 'running'; doing: string; name: string; fraction: number | null }
  | { phase: 'copying' }
  | { phase: 'cancelling' }

export type Running = Extract<JobState, { phase: 'running' }>

/** What a job needs besides its plan: the progress bar's verb, the source's size for the strip's change,
 * what to say about the result once it's read back, and how Copy makes it a PNG. */
export type JobOptions = {
  doing: string
  size: number
  notes?: (result: RunResult) => string[]
  png?: (blob: Blob, result: RunResult) => PngSource | null
  /** Kept on the export, so the page can find what a tool made (Export's Compare view). */
  tag?: string
}

const IDLE: JobState = { phase: 'idle' }
const worded = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The job slot (one job or copy at a time) and the exports strip. */
export function useJob(client: WorkerClient) {
  // The ref is the truth, read inside a click before React has rendered; `state` shows it.
  const slot = useRef<JobState>(IDLE)
  const [state, setState] = useState<JobState>(IDLE)
  const go = useCallback((next: JobState) => {
    slot.current = next
    setState(next)
  }, [])
  const [exports, setExports] = useState<Export[]>([])
  // What became of the last job, in a sentence for screen readers.
  const [note, setNote] = useState('')
  // A cancel whose new worker couldn't open the file again, for the page's error banner.
  const [error, setError] = useState<string | null>(null)
  const nextExport = useRef(1)
  const latest = useRef(exports)
  latest.current = exports

  const start = useCallback(
    (plan: Plan, options: JobOptions) => {
      if (slot.current.phase !== 'idle') return
      const name = uniqueName(
        plan.name,
        latest.current.map((e) => e.name),
      )
      go({ phase: 'running', doing: options.doing, name, fraction: null })
      const add = (result: Partial<Export>, said: string) => {
        go(IDLE)
        setNote(said)
        const id = nextExport.current++
        setExports((list) => [{ id, name, sourceSize: options.size, tag: options.tag, ...result } as Export, ...list])
      }
      client
        .run(plan, (fraction) => {
          if (slot.current.phase === 'running') go({ ...slot.current, fraction })
        })
        .then(
          (result) =>
            add(
              {
                blob: result.blob,
                url: URL.createObjectURL(result.blob),
                size: result.blob.size,
                notes: options.notes?.(result) ?? [],
                png: options.png?.(result.blob, result) ?? null,
                used: false,
              },
              `${name} is ready to download.`,
            ),
          (error: unknown) => {
            // Cancelled: nothing is added, and the slot frees once the new worker is ready (`cancel`).
            if (worded(error) === CANCELLED) return
            add({ error: worded(error) }, `${name} wasn’t made. ${worded(error)}`)
          },
        )
    },
    [client, go],
  )

  /** Stops the running job. The worker is replaced, so the slot frees once the new one holds the file, or once it
   * has said it couldn't open it again. */
  const cancel = useCallback(async () => {
    if (slot.current.phase !== 'running') return
    go({ phase: 'cancelling' })
    await client.cancel().catch((e: unknown) => setError(worded(e)))
    go(IDLE)
  }, [client, go])

  const dismissError = useCallback(() => setError(null), [])

  /** Marks a result as downloaded, copied or opened, so leaving no longer asks about it. */
  const used = useCallback((id: number) => {
    setExports((list) => list.map((e) => (e.id === id && e.url ? { ...e, used: true } : e)))
  }, [])

  /** Copies a result to the clipboard as a PNG, in the job slot. Call it straight from the click: the
   * clipboard write starts in it, holding the PNG's promise (CLAUDE.md). Resolves with whether it worked. */
  const copy = useCallback(
    (id: number): Promise<boolean> => {
      const item = latest.current.find((e) => e.id === id)
      if (slot.current.phase !== 'idle' || !item?.png) return Promise.resolve(false)
      go({ phase: 'copying' })
      const png = client.png(item.png)
      png.catch(() => {})
      let written: Promise<void>
      try {
        written = navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      } catch (error) {
        written = Promise.reject(error)
      }
      // The clipboard can refuse while the worker is still drawing: wait for both.
      return Promise.allSettled([png, written]).then(([made, wrote]) => {
        go(IDLE)
        const ok = made.status === 'fulfilled' && wrote.status === 'fulfilled'
        if (ok) used(id)
        setNote(ok ? `Copied ${item.name}.` : 'Copying didn’t work here. Download it instead.')
        return ok
      })
    },
    [client, go, used],
  )

  /** Takes a result off the strip and frees the memory it held. */
  const remove = useCallback((id: number) => {
    const gone = latest.current.find((e) => e.id === id)
    if (gone?.url) URL.revokeObjectURL(gone.url)
    setExports((list) => list.filter((e) => e.id !== id))
  }, [])

  useEffect(() => () => latest.current.forEach((e) => e.url && URL.revokeObjectURL(e.url)), [])

  // While a job runs or a result hasn't been downloaded, copied or opened, leaving the page asks first
  // (SPEC.md section 7).
  const running = state.phase === 'running'
  const unused = exports.filter((e) => e.url && !e.used).length
  const losing = running || unused > 0
  useEffect(() => {
    if (!losing) return
    const ask = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [losing])

  return { state, exports, note, error, dismissError, unused, start, cancel, copy, used, remove }
}
