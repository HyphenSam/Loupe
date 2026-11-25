import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { NO_CAPABILITIES, probeCapabilities } from './lib/capabilities'
import { createClient } from './lib/protocol'
import { c2pa } from './media/c2pa'
import { isSupported } from './lib/support'
import './index.css'

const supported = isSupported()

/** What this browser can do (SPEC.md section 9): an `<img>` decodes each bundled sample, or doesn't. */
const capabilities = supported
  ? await probeCapabilities({
      shows: (url) => {
        const image = new Image()
        image.src = url
        return image.decode().then(
          () => image.naturalWidth > 0,
          () => false,
        )
      },
      clipboardImage: () => typeof ClipboardItem !== 'undefined' && (ClipboardItem.supports?.('image/png') ?? true),
      webgl2: () => !!document.createElement('canvas').getContext('webgl2'),
    })
  : NO_CAPABILITIES

const worker = supported ? new Worker(new URL('./worker/index.ts', import.meta.url), { type: 'module' }) : null
// Without a worker nothing can be opened, and the app says so before anything asks it.
const client = createClient(worker ?? { postMessage: () => {}, addEventListener: () => {} })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App supported={supported} client={client} capabilities={capabilities} provenance={c2pa} />
  </StrictMode>,
)
