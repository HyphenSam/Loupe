/** Forensics' layer or the depth map for the stage (SPEC.md 5 and 6.5): asks the worker for it whenever the view or a slider
 * changes, one request at a time with the latest settings winning, so dragging a slider never queues up
 * re-saves. The last layer drawn stays until the next arrives. */
import { useEffect, useRef, useState } from 'react'
import type { LayerSettings } from '@/lib/forensics/layer'
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

const same = (a: Want | null, b: Want | null) =>
  !!a && !!b && a.layer === b.layer && a.quality === b.quality && a.amount === b.amount

/** `layer` is the stage's layer, or null when it shows something else; `source` is the open file, whose
 * change drops what was drawn. */
export function useLayer(
  layer: Layer | null,
  settings: LayerSettings,
  ask: WorkerClient['layer'],
  source: unknown,
): LayerState | null {
  const [drawn, setDrawn] = useState<{ want: Want; pixels: Pixels } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const want = useRef<Want | null>(null)
  const asking = useRef(false)
  const live = useRef(source)

  useEffect(() => {
    live.current = source
    setDrawn(null)
    setError(null)
  }, [source])

  // The depth map has no settings, so the sliders never ask for it again.
  const wanted: Want | null = layer && {
    layer,
    quality: layer === 'depth' ? 0 : settings.quality,
    amount: layer === 'ela' ? settings.brightness : layer === 'noise' ? settings.noise : 0,
  }

  useEffect(() => {
    want.current = wanted
    if (!wanted) return
    const go = () => {
      const next = want.current
      if (!next || asking.current) return
      asking.current = true
      setBusy(true)
      const from = live.current
      ask(next.layer, next.quality, next.amount)
        .then(
          (pixels) => {
            if (from !== live.current) return
            setDrawn({ want: next, pixels })
            setError(null)
          },
          (e: unknown) => from === live.current && setError(e instanceof Error ? e.message : String(e)),
        )
        .finally(() => {
          asking.current = false
          if (want.current && !same(want.current, next)) go()
          else setBusy(false)
        })
    }
    go()
    // `ask` is the client's, the same for the page's life.
  }, [wanted?.layer, wanted?.quality, wanted?.amount, source])

  if (!layer) return null
  return { layer, pixels: drawn?.want.layer === layer ? drawn.pixels : null, busy, error }
}
