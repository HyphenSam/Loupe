/** The Text tool's reads of the open picture (SPEC.md 6.12), one per script, kept until another file opens. The
 * worker reads; this keeps its progress and result, so leaving the tool and coming back doesn't read again. */
import { useCallback, useRef, useState } from 'react'
import type { Script } from '@/lib/ocr/scripts'
import type { TextLine, TextProgress } from '@/lib/ocr/types'
import { CANCELLED, type WorkerClient } from '@/lib/protocol'

export type TextRead =
  | { status: 'reading'; progress: TextProgress }
  | { status: 'read'; lines: TextLine[] }
  | { status: 'failed'; message: string }

/** A job's Cancel replaces the worker, and a read on it stops with the job. */
export const READ_STOPPED = 'Reading stopped when the job was cancelled.'

type Reads = { source: unknown; by: Partial<Record<Script, TextRead>> }

export function useTextReads(text: WorkerClient['text'], source: unknown) {
  const [reads, setReads] = useState<Reads>({ source, by: {} })
  const live = useRef(source)
  live.current = source

  const set = useCallback((from: unknown, script: Script, read: TextRead | null) => {
    setReads((current) => {
      if (live.current !== from) return current
      const by = { ...(current.source === from ? current.by : {}) }
      if (read) by[script] = read
      else delete by[script]
      return { source: from, by }
    })
  }, [])

  const start = useCallback(
    (script: Script) => {
      const from = source
      set(from, script, { status: 'reading', progress: null })
      text(script, (progress) => set(from, script, { status: 'reading', progress })).then(
        (lines) => set(from, script, { status: 'read', lines }),
        (e: unknown) => {
          const message = e instanceof Error ? e.message : String(e)
          set(from, script, { status: 'failed', message: message === CANCELLED ? READ_STOPPED : message })
        },
      )
    },
    [text, source, set],
  )

  /** Drops a script's read, so it's read again once its files are held. */
  const forget = useCallback((script: Script) => set(source, script, null), [source, set])

  return { reads: reads.source === source ? reads.by : {}, start, forget }
}
