import { useCallback, useRef, useState } from 'react'
import type { Capabilities } from '@/lib/capabilities'
import type { ImageInfo } from '@/lib/info'
import type { Pixels } from '@/lib/pixels'
import type { StagePicture, WorkerClient } from '@/lib/protocol'

/** The longer side of the pixels the page keeps for the histogram and the readout at fit. */
export const PREVIEW_SIDE = 2048

/** The open file. `id` is new for every open, so views keyed by it start afresh even for the same file
 * again. The picture, ImageInfo and the pixels arrive in that order; each is null until it has. */
export type Source = {
  id: number
  file: File
  picture: StagePicture | null
  info: ImageInfo | null
  pixels: Pixels | null
}

/** The open file (SPEC.md section 3). A new file shows at once; if it can't be opened, the previous one
 * comes back and `error` says why. The last open asked for wins. */
export function useSource(client: WorkerClient, shows: Capabilities['shows']) {
  const [source, setSource] = useState<Source | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)
  // The last file that opened fully, to go back to.
  const settled = useRef<Source | null>(null)

  const open = useCallback(
    (file: File) => {
      const id = ++latest.current
      const update = (change: Partial<Source>) =>
        setSource((s) => {
          if (id !== latest.current || !s || s.id !== id) return s
          const next = { ...s, ...change }
          if (next.info) settled.current = next
          return next
        })
      let shown: StagePicture | null = null
      setError(null)
      setSource({ id, file, picture: null, info: null, pixels: null })
      const onPicture = (picture: StagePicture) => {
        shown = picture
        update({ picture })
      }
      client.open(file, shows, onPicture).then(
        (info) => {
          update({ info })
          // Pixels for the histogram and the readout, unless there's no picture to read.
          if (id === latest.current && shown?.type !== 'none')
            client.pixels(PREVIEW_SIDE).then(
              (pixels) => update({ pixels }),
              () => {},
            )
        },
        (e: unknown) => {
          if (id !== latest.current) return
          setError(e instanceof Error ? e.message : String(e))
          setSource(settled.current)
        },
      )
    },
    [client, shows],
  )

  const dismissError = useCallback(() => setError(null), [])

  return { source, error, open, dismissError }
}
