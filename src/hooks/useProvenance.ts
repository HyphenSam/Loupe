import type { ManifestStore } from '@contentauth/c2pa-web'
import { useEffect, useState } from 'react'
import { credentialsOf, type Credentials, type ProvenanceReader } from '@/lib/ai/c2pa'

/** The open file's Content Credentials (SPEC.md 6.3), read by the C2PA SDK alongside the worker's read.
 * `thumbnails` maps resource identifiers to object URLs, revoked when the file changes. */
export type ProvenanceState =
  | { status: 'none' }
  | { status: 'reading' }
  | { status: 'read'; credentials: Credentials | null; store: ManifestStore | null; thumbnails: Record<string, string> }
  | { status: 'failed'; message: string }

/** `bundledOn`: the day the bundled trust lists were fetched, for the caption; null until known. */
export function useProvenance(
  reader: ProvenanceReader,
  file: File | null,
): ProvenanceState & { bundledOn: string | null } {
  const [state, setState] = useState<ProvenanceState>(file ? { status: 'reading' } : { status: 'none' })
  const [bundledOn, setBundledOn] = useState<string | null>(null)

  useEffect(() => {
    reader.bundledOn().then(setBundledOn, () => {})
  }, [reader])

  useEffect(() => {
    if (!file) return setState({ status: 'none' })
    let current = true
    let urls: string[] = []
    setState({ status: 'reading' })
    reader.read(file).then(
      (read) => {
        if (!current) return
        const thumbnails = Object.fromEntries(
          Object.entries(read?.thumbnails ?? {}).map(([id, blob]) => [id, URL.createObjectURL(blob)]),
        )
        urls = Object.values(thumbnails)
        setState({
          status: 'read',
          credentials: read ? credentialsOf(read.store) : null,
          store: read?.store ?? null,
          thumbnails,
        })
      },
      (e: unknown) => {
        if (current)
          setState({
            status: 'failed',
            message: `Loupe couldn’t read the Content Credentials: ${e instanceof Error ? e.message : String(e)}`,
          })
      },
    )
    return () => {
      current = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [reader, file])

  return { ...state, bundledOn }
}
