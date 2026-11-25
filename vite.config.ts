/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { oversized } from './scripts/pages-limit.ts'
import { RUNTIME_CACHING, unprecached } from './scripts/precache.ts'
import { APP_DESCRIPTION, APP_NAME } from './src/lib/brand.ts'
import { FILE_TYPES } from './src/lib/file-types.ts'

const root = fileURLToPath(new URL('.', import.meta.url))

// The AVIF and JPEG XL encoders use threads, which need cross-origin isolation (as Bytesize).
// public/_headers sets the same in production.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

/** Fails the build if Cloudflare would refuse a file (static assets are capped at 25 MiB each). */
function pagesLimit(): Plugin {
  return {
    name: 'pages-limit',
    apply: 'build',
    closeBundle() {
      const big = oversized(join(root, 'dist'))
      if (big.length) {
        throw new Error(
          `Over Cloudflare's 25 MiB asset limit: ${big.map((f) => `${f.path} (${f.size} bytes)`).join(', ')}`,
        )
      }
    },
  }
}

/** Fails the build if the service worker would leave a file out, so the whole app works offline. Runs
 * after vite-plugin-pwa has written sw.js. */
function precacheAll(): Plugin {
  return {
    name: 'precache-all',
    apply: 'build',
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const dist = join(root, 'dist')
        const missing = unprecached(dist, readFileSync(join(dist, 'sw.js'), 'utf8'))
        if (missing.length) throw new Error(`Not precached, so missing offline: ${missing.join(', ')}`)
      },
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // The glob below takes every icon; listing them again only repeats them in the precache.
      includeManifestIcons: false,
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_DESCRIPTION,
        lang: 'en-GB',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0e0e10',
        theme_color: '#0e0e10',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [{ action: '/', accept: FILE_TYPES }],
      },
      workbox: {
        // Everything (ExifTool, the C2PA SDK, the codecs, the map data, as they arrive), so the whole app
        // works offline once installed.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm,bin,json,pem}'],
        // Workbox quietly skips files over 2 MiB by default; zeroperl's wasm is 24.2 MiB. The precache
        // check below catches anything still left out.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: RUNTIME_CACHING,
      },
    }),
    pagesLimit(),
    precacheAll(),
  ],
  resolve: {
    alias: { '@': join(root, 'src') },
  },
  worker: { format: 'es' },
  server: { headers: isolation },
  preview: { headers: isolation },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    // vite-plugin-pwa serves its module only to builds and the dev server; tests get one that never
    // finds an update, and mock it where they need one.
    alias: { 'virtual:pwa-register/react': join(root, 'src/test-pwa.ts') },
  },
})
