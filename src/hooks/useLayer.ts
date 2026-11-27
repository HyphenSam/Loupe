/** Forensics' layer or the depth map for the stage (SPEC.md 5 and 6.5): asks the worker for it whenever the view or a slider
 * changes, one request at a time with the latest settings winning, so dragging a slider never queues up
 * re-saves. The last layer drawn stays until the next arrives. */
import { useEffect, useRef, useState } from 'react'
import type { LayerSettings } from '@/lib/forensics/layer'
import { idle, step, type LatestEvent } from '@/lib/latest'
import type { Pixels } from '@/lib/pixels'
import type { Layer, WorkerClient } from '@/lib/protocol'

export type LayerState = {
  layer: Layer
  /** The latest layer drawn of this kind, if any. */
  pixels: Pixels | null
  /** A newer one is on its way. */
  busy: boolean
  error: string | null
}

type Want = { layer: Layer; quality: number; amount: number }

const same = (a: Want, b: Want) => a.layer === b.layer && a.quality === b.quality && a.amount === b.amount

/** `layer` is the stage's layer, or null when it shows something else; `source` is the open file, whose
 * change drops what was drawn. */
export function useLayer(
  layer: Layer | null,
  settings: LayerSettings,
  ask: WorkerClient['layer'],
  source: unknown,
): LayerState | null {
  const [drawn, setDrawn] = useState<{ layer: Layer; pixels: Pixels } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(idle<unknown, Want>(source))

  useEffect(() => {
    setDrawn(null)
    setError(null)
  }, [source])

  // Steps the requests and makes the one it says to; true when an answer or failure belongs to the open file.
  const send = (event: LatestEvent<unknown, Want>): boolean => {
    const next = step(requests.current, event, same)
    requests.current = next.state
    setBusy(next.state.out !== null)
    if (next.ask) {
      const { layer, quality, amount } = next.ask.value
      ask(layer, quality, amount).then(
        (pixels) => {
          if (!send({ type: 'answer' })) return
          setDrawn({ layer, pixels })
          setError(null)
        },
        (e: unknown) => send({ type: 'failure' }) && setError(e instanceof Error ? e.message : String(e)),
      )
    }
    return next.current
  }

  // The depth map has no settings, so the sliders never ask for it again.
  const wanted: Want | null = layer && {
    layer,
    quality: layer === 'depth' ? 0 : settings.quality,
    amount: layer === 'ela' ? settings.brightness : layer === 'noise' ? settings.noise : 0,
  }

  useEffect(() => {
    send({ type: 'want', key: source, value: wanted })
    // `ask` is the client's, the same for the page's life.
  }, [wanted?.layer, wanted?.quality, wanted?.amount, source])

  if (!layer) return null
  return { layer, pixels: drawn?.layer === layer ? drawn.pixels : null, busy, error }
}
