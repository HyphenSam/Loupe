import { readdirSync } from 'node:fs'
import { relative, sep } from 'node:path'

// The service worker, Workbox's runtime and Cloudflare's headers file are served but never precached.
const SKIP = /^(sw\.js|workbox-[\w-]+\.js|_headers)$/

/** Built files the service worker's precache list (`sw`, the generated sw.js) leaves out: anything here
 * would be missing offline, such as an encoder add-on fetched only when a job needs it. */
export function unprecached(dir: string, sw: string): string[] {
  const listed = new Set([...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]))
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, `${entry.parentPath}${sep}${entry.name}`).split(sep).join('/'))
    .filter((path) => !SKIP.test(path) && !listed.has(path))
    .sort()
}

/** The service worker's runtime caches, beyond the precache. Only the app launcher's list and icons: map
 * tiles must never be kept (OpenStreetMap's tile policy, SPEC.md 6.2), and Workbox caches no other
 * cross-origin request unless a route here says so. */
export const RUNTIME_CACHING = [
  {
    // Shown from the cache at once (and offline), refreshed in the background.
    urlPattern: ({ url }: { url: URL }) => url.origin === 'https://apps.hyphensam.com',
    handler: 'StaleWhileRevalidate' as const,
    options: { cacheName: 'hyphensam-apps', expiration: { maxEntries: 30 } },
  },
]
