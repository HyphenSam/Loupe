/** Copy the picture and open a site to paste it into (SPEC.md 6.3's Check on SynthID; Forensics' Find it
 * online reuses it). The PNG is made as soon as the tool opens, so the click can write it at once: Chrome
 * refuses clipboard writes from a page without focus, and opening a tab takes the focus away, so the write
 * starts in the click and the tab opens once it's done, still within the click's activation. If the copy
 * fails the tab still opens and the caller offers the PNG to save. Without `ClipboardItem` the click saves
 * the PNG, then opens the site. */
import { useEffect, useState } from 'react'
import { saveBlob } from '@/components/save'

export type CopyAndOpen = {
  /** Copies (or saves) the picture and opens the site. */
  go(): void
  /** Saves the PNG copy. */
  save(): void
  /** Why there's no picture to copy, once the PNG has failed. */
  problem: string | null
  /** The last copy failed; the site opened anyway. */
  copyFailed: boolean
}

export function useCopyAndOpen({
  make,
  source,
  url,
  name,
  canCopy,
}: {
  /** Makes the PNG; called again whenever `source` changes. */
  make: () => Promise<Blob>
  source: unknown
  url: string
  /** The name a saved copy gets. */
  name: string
  /** Whether the clipboard takes images here (`Capabilities.clipboardImage`). */
  canCopy: boolean
}): CopyAndOpen {
  const [png, setPng] = useState<Promise<Blob> | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)

  useEffect(() => {
    let live = true
    setBlob(null)
    setProblem(null)
    setCopyFailed(false)
    const made = make()
    made.catch(() => {})
    setPng(made)
    made.then(
      (b) => live && setBlob(b),
      (error: unknown) => live && setProblem(error instanceof Error ? error.message : String(error)),
    )
    return () => {
      live = false
    }
    // `make` is the client's, the same for the page's life; a new source makes a new PNG.
  }, [source])

  const open = () => window.open(url, '_blank', 'noopener')
  const save = () => void png?.then((b) => saveBlob(b, name))

  function go() {
    if (!png) return
    if (!canCopy) {
      void png.then((b) => {
        saveBlob(b, name)
        open()
      })
      return
    }
    // The Blob itself once it's made; until then the promise, which ClipboardItem waits for.
    const item = new ClipboardItem({ 'image/png': blob ?? png })
    navigator.clipboard.write([item]).then(
      () => {
        setCopyFailed(false)
        open()
      },
      () => {
        setCopyFailed(true)
        open()
      },
    )
  }

  return { go, save, problem, copyFailed }
}
