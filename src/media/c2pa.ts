// Content Credentials (SPEC.md 6.3), read and validated by the C2PA SDK in its own worker on the page.
// The only place that calls @contentauth/c2pa-web; src/lib/ai/c2pa.ts turns what it returns into findings.
import { Context, createC2pa, Reader, type C2pa, type Settings } from '@contentauth/c2pa-web'
import wasmUrl from '@contentauth/c2pa-web/resources/c2pa.wasm?url'
import type { ProvenanceReader, ReadProvenance } from '@/lib/ai/c2pa'

// The bundled lists (scripts/trust.ts), same-origin so the service worker serves them offline. The SDK
// fetches a setting only when it starts with "http", so they're absolute. The C2PA trust list's anchors are
// "system" anchors and the frozen interim list's are "user" ones, so results say which a signer chained to.
const trust = (file: string) => new URL(`/trust/${file}`, location.href).href

const SETTINGS: Settings = {
  trust: {
    trustAnchors: trust('c2pa-anchors.pem'),
    userAnchors: trust('itl-anchors.pem'),
    allowedList: trust('itl-allowed.pem'),
  },
  tsaTrust: { trustAnchors: trust('c2pa-tsa-anchors.pem') },
  // Nothing leaves the device (SPEC.md section 10): no revocation checks, no remote manifests.
  verify: { verifyTrust: true, verifyAfterReading: true, ocspFetch: false, remoteManifestFetch: false },
}

let sdk: Promise<C2pa> | null = null
let context: Context | null = null

function start(): Promise<C2pa> {
  // A failed start isn't kept, so the next file tries again.
  sdk ??= createC2pa({ wasmSrc: wasmUrl }).catch((e: unknown) => {
    sdk = null
    throw e
  })
  // One Context: it fetches the trust lists once and keeps the result.
  context ??= new Context(SETTINGS)
  return sdk
}

/** The file's Content Credentials, or null when it has none. Throws when the SDK can't read them. The
 * thumbnails are the active manifest's and the ingredients'. */
async function read(file: File): Promise<ReadProvenance | null> {
  const c2pa = await start()
  // An empty type (HEIC on Windows, say) lets the SDK sniff the bytes itself.
  const reader = await Reader.fromBlob(c2pa, file.type || undefined, file, context!)
  if (!reader) return null
  try {
    const store = await reader.manifestStore()
    const thumbnails: Record<string, Blob> = {}
    for (const manifest of Object.values(store.manifests ?? {})) {
      for (const ref of [manifest.thumbnail, ...(manifest.ingredients ?? []).map((i) => i.thumbnail)]) {
        if (!ref || thumbnails[ref.identifier]) continue
        try {
          thumbnails[ref.identifier] = new Blob([await reader.resourceToBytes(ref.identifier)], { type: ref.format })
        } catch {
          // A thumbnail the manifest names but doesn't carry: the ingredient is listed without it.
        }
      }
    }
    return { store, thumbnails }
  } finally {
    await reader.free()
  }
}

/** The day public/trust/ was fetched (`pnpm trust` writes trust.json). */
async function bundledOn(): Promise<string> {
  const index = (await (await fetch(trust('trust.json'))).json()) as { fetched: string }
  return index.fetched
}

export const c2pa: ProvenanceReader = { read, bundledOn }
