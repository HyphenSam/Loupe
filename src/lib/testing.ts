// Fakes for tests: ImageInfo builders and the worker client. Fakes over mocks (CLAUDE.md): each behaves
// like the real thing in the ways the tests rely on.
import { createHash } from 'node:crypto'
import type { ManifestStore } from '@contentauth/c2pa-web'
import { adjust, type Adjustments } from './adjust'
import type { ProvenanceReader, ReadProvenance } from './ai/c2pa'
import type { Capabilities } from './capabilities'
import type { Camera, ImageInfo } from './info'
import type { Models, OcrFile } from './ocr/models'
import type { Script } from './ocr/scripts'
import type { TextLine, TextProgress } from './ocr/types'
import { pixelAt, rgba, type Pixels } from './pixels'
import type { Plan } from './plans/plan'
import {
  CANCELLED,
  type Fingerprint,
  type Layer,
  type PngSource,
  type Rgba,
  type RunResult,
  type StagePicture,
  type ThumbnailMatch,
  type WorkerClient,
} from './protocol'

/** A browser that can do everything. Tests take away what they need missing. */
export const ALL_CAPABLE: Capabilities = {
  shows: { avif: true, heic: true, jxl: true },
  clipboardImage: true,
  webgl2: true,
}

export function fakeCamera(over: Partial<Camera> = {}): Camera {
  return {
    make: 'Apple',
    model: 'iPhone 15 Pro',
    lens: 'iPhone 15 Pro back triple camera 6.765mm f/1.78',
    exposure: { time: '1/250', aperture: 1.8, iso: 80, bias: null },
    focalLength: 6.765,
    focal35: 24,
    flash: 'Off, Did not fire',
    bodySerial: null,
    lensSerial: null,
    internalSerial: null,
    owner: null,
    shutterCount: null,
    software: '17.4',
    ...over,
  }
}

/** A 12 MP phone JPEG with a camera, dates and no location, unless told otherwise. */
export function fakeInfo(over: Partial<ImageInfo> = {}): ImageInfo {
  return {
    name: 'IMG_0001.jpg',
    size: 2_400_000,
    lastModified: Date.UTC(2025, 2, 12, 2, 0),
    format: 'jpeg',
    formatName: 'JPEG',
    lossless: false,
    extension: null,
    width: 4032,
    height: 3024,
    orientation: 1,
    displayWidth: 4032,
    displayHeight: 3024,
    bitDepth: 8,
    alpha: false,
    colour: { profile: 'Display P3', space: 'display-p3', hdr: null },
    animation: null,
    tags: [
      { family: 'EXIF', group: 'IFD0', name: 'Make', label: 'Make', value: 'Apple' },
      { family: 'EXIF', group: 'IFD0', name: 'Model', label: 'Camera Model Name', value: 'iPhone 15 Pro' },
      { family: 'XMP', group: 'XMP-xmp', name: 'CreatorTool', label: 'Creator Tool', value: '17.4' },
    ],
    json: '[{"SourceFile":"/image.jpg"}]',
    camera: fakeCamera(),
    dates: {
      taken: { local: '2025-03-12T14:32:05', offset: '+13:00' },
      digitised: { local: '2025-03-12T14:32:05', offset: '+13:00' },
      modified: { local: '2025-03-12T14:32:05', offset: '+13:00' },
      gpsUtc: null,
    },
    gps: null,
    place: null,
    kinds: [],
    embedded: [],
    generators: [],
    sourceType: null,
    edits: { software: '17.4', history: [], settings: [], settingsBy: null, ancestors: 0, mismatches: [] },
    jpeg: {
      quality: 92,
      tables: 'custom',
      tablesName: null,
      subsampling: '4:2:0',
      progressive: false,
      mcu: { width: 16, height: 16 },
    },
    trailer: null,
    unknownChunks: [],
    motion: null,
    ...over,
  }
}

/** An open the fake client was asked for; the test settles it. */
export type FakeOpen = {
  file: File
  shows: Capabilities['shows']
  picture(picture: StagePicture): void
  resolve(info: ImageInfo): void
  reject(message: string): void
}

/** A job the fake client was asked to run; the test reports its progress and settles it. */
export type FakeRun = {
  plan: Plan
  progress(fraction: number | null): void
  resolve(result: RunResult): void
  reject(message: string): void
}

/** A cancel the fake client was asked for: it resolves once the new worker holds the file again, or rejects with the
 * client's sentence when it couldn't reopen it. */
export type FakeCancel = { resolve(): void; reject(message: string): void }

/** A read of the picture's text the fake client was asked for; the test reports its progress and settles it. */
export type FakeText = {
  script: Script
  progress(progress: TextProgress): void
  resolve(lines: TextLine[]): void
  reject(message: string): void
}

/** A worker client whose opens, runs and cancels the test settles, with `image` as the open picture's pixels. */
export class FakeClient implements WorkerClient {
  opens: FakeOpen[] = []
  runs: FakeRun[] = []
  /** Cancels asked for, each settled by the test. */
  cancels: FakeCancel[] = []
  /** What `png` was asked to convert: undefined for the open picture. */
  pngSources: (PngSource | undefined)[] = []
  pixelRequests: number[] = []
  /** The exact pixels asked for: the stage's readout. */
  pixelAsks: { x: number; y: number }[] = []
  /** How many times the open picture was asked for as a PNG. */
  pngRequests = 0
  /** The items `extract` was asked for, and what it answers: an item's bytes, or a failure's message. */
  extracts: string[] = []
  extractResult: Blob | string = new Blob(['PK'], { type: 'application/zip' })
  /** What `png` answers: a PNG of the picture, or a failure's message. */
  pngResult: Blob | string = new Blob(['png'], { type: 'image/png' })
  /** The layers asked for, and what each answers: `image` unless told otherwise, or a failure's message. */
  layers: { layer: Layer; quality: number; amount: number }[] = []
  layerResult: Pixels | string | null = null
  /** The files `fingerprint` was asked about (undefined for the open one), and what it answers for each. */
  fingerprints: (File | undefined)[] = []
  fingerprintResult: (file?: File) => Fingerprint | string = (file) =>
    file ? { sha256: 'b'.repeat(64), phash: '000000000000000f' } : { sha256: 'a'.repeat(64), phash: '0000000000000000' }
  /** How many times the thumbnail was asked for, and what it answers: a match, none, or a failure's message. */
  thumbnailRequests = 0
  thumbnailResult: ThumbnailMatch | null | string = null

  constructor(public image: Pixels = rgba(4, 3, (x, y) => [x * 60, y * 80, 100, 255])) {}

  open(file: File, shows: Capabilities['shows'], onPicture: (picture: StagePicture) => void): Promise<ImageInfo> {
    return new Promise((resolve, reject) => {
      this.opens.push({ file, shows, picture: onPicture, resolve, reject: (message) => reject(new Error(message)) })
    })
  }

  /** The latest open. */
  get last(): FakeOpen {
    return this.opens[this.opens.length - 1]
  }

  async pixels(maxSide: number): Promise<Pixels> {
    this.pixelRequests.push(maxSide)
    return this.image
  }

  /** The adjustments Adjust's preview asked for. */
  adjustedRequests: Adjustments[] = []

  async adjusted(_maxSide: number, adjustments: Adjustments): Promise<Pixels> {
    this.adjustedRequests.push(adjustments)
    return adjust(this.image, adjustments)
  }

  // An arrow, as the real client's are closures: the stage takes it unbound.
  pixel = async (x: number, y: number): Promise<Rgba | null> => {
    this.pixelAsks.push({ x, y })
    return pixelAt(this.image, x, y)
  }

  run(plan: Plan, onProgress?: (fraction: number | null) => void): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      this.runs.push({
        plan,
        progress: (fraction) => onProgress?.(fraction),
        resolve,
        reject: (message) => reject(new Error(message)),
      })
    })
  }

  /** As the real client: what's running rejects at once; the promise settles when the test says. */
  cancel(): Promise<void> {
    for (const run of this.runs) run.reject(CANCELLED)
    for (const read of this.texts) read.reject(CANCELLED)
    return new Promise((resolve, reject) =>
      this.cancels.push({ resolve, reject: (message) => reject(new Error(message)) }),
    )
  }

  /** The reads `text` was asked for; the test reports progress and settles each. */
  texts: FakeText[] = []

  text(script: Script, onProgress?: (progress: TextProgress) => void): Promise<TextLine[]> {
    return new Promise((resolve, reject) => {
      this.texts.push({
        script,
        progress: (progress) => onProgress?.(progress),
        resolve,
        reject: (message) => reject(new Error(message)),
      })
    })
  }

  async extract(item: string): Promise<Blob> {
    this.extracts.push(item)
    if (typeof this.extractResult === 'string') throw new Error(this.extractResult)
    return this.extractResult
  }

  async layer(layer: Layer, quality: number, amount: number): Promise<Pixels> {
    this.layers.push({ layer, quality, amount })
    if (typeof this.layerResult === 'string') throw new Error(this.layerResult)
    return this.layerResult ?? this.image
  }

  async fingerprint(file?: File): Promise<Fingerprint> {
    this.fingerprints.push(file)
    const result = this.fingerprintResult(file)
    if (typeof result === 'string') throw new Error(result)
    return result
  }

  async thumbnail(): Promise<ThumbnailMatch | null> {
    this.thumbnailRequests++
    if (typeof this.thumbnailResult === 'string') throw new Error(this.thumbnailResult)
    return this.thumbnailResult
  }

  async png(source?: PngSource): Promise<Blob> {
    this.pngSources.push(source)
    this.pngRequests++
    if (typeof this.pngResult === 'string') throw new Error(this.pngResult)
    return this.pngResult
  }
}

/** A read the fake provenance reader was asked for; the test settles it. */
export type FakeRead = { file: File; resolve(value: ReadProvenance | null): void; reject(message: string): void }

/** The C2PA SDK, as src/media/c2pa.ts wraps it: reads the test settles, and the bundled lists' date. */
export class FakeProvenance implements ProvenanceReader {
  reads: FakeRead[] = []

  constructor(public fetched = '2026-11-25') {}

  read(file: File): Promise<ReadProvenance | null> {
    return new Promise((resolve, reject) => {
      this.reads.push({ file, resolve, reject: (message) => reject(new Error(message)) })
    })
  }

  get last(): FakeRead {
    return this.reads[this.reads.length - 1]
  }

  async bundledOn(): Promise<string> {
    return this.fetched
  }
}

/** A trusted manifest store saying ChatGPT made the picture with generative AI, with a thumbnail. */
export function fakeStore(over: Partial<ManifestStore> = {}): ManifestStore {
  return {
    active_manifest: 'urn:c2pa:1',
    manifests: {
      'urn:c2pa:1': {
        claim_generator_info: [{ name: 'ChatGPT' }],
        thumbnail: { format: 'image/jpeg', identifier: 'self#jumbf=c2pa.thumbnail.claim.jpeg' },
        assertions: [
          {
            label: 'c2pa.actions.v2',
            data: {
              actions: [
                {
                  action: 'c2pa.created',
                  digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
                  softwareAgent: { name: 'GPT-4o' },
                },
              ],
            },
          },
        ],
        ingredients: [],
        signature_info: {
          issuer: 'OpenAI',
          common_name: 'Truepic Lens CLI in Sora',
          time: '2026-11-20T10:00:00+00:00',
        },
      },
    },
    validation_results: {
      activeManifest: {
        success: [
          {
            code: 'signingCredential.trusted',
            explanation: 'signing certificate trusted, found in System trust anchors',
          },
        ],
        informational: [],
        failure: [],
      },
    },
    validation_state: 'Trusted',
    ...over,
  }
}

/** A line of text at `x`, `y` in the upright picture, `width` × 20 px, read with `confidence`. */
export const fakeLine = (text: string, x: number, y: number, confidence = 0.95, width = 100): TextLine => ({
  text,
  confidence,
  vertical: false,
  quad: [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + 20 },
    { x, y: y + 20 },
  ],
})

/** A manifest of small text recognition files (a few MB in all), with their real SHA-256, and the bytes each holds: what `FakeServer`
 * serves in place of the 38 MB of models. */
export function fakeModels(): { models: Models; bytes: Map<string, Uint8Array<ArrayBuffer>> } {
  const bytes = new Map<string, Uint8Array<ArrayBuffer>>()
  const file = (path: string, size: number): OcrFile => {
    const data = new Uint8Array(size).map((_, i) => (i * 7 + path.length) & 255)
    bytes.set(path, data)
    return { path, size, sha256: createHash('sha256').update(data).digest('hex') }
  }
  const script = (name: string) => ({
    recogniser: file(`ocr/${name}-rec.onnx`, 2_000_000),
    characters: file(`ocr/${name}.txt`, 100_000),
  })
  const models: Models = {
    runtime: file('ocr/ort.wasm', 1_500_000),
    detector: { ...file('ocr/det.onnx', 500_000), threshold: 0.2, boxThreshold: 0.4, unclipRatio: 1.4 },
    scripts: { 'latin-cjk': script('latin'), korean: script('korean'), cyrillic: script('cyrillic') },
  }
  return { models, bytes }
}

/** A download `FakeServer` is serving: half its bytes go at once, the rest when the test calls `release`, unless the
 * server isn't holding them back. */
type Serving = { path: string; release(): void }

/** The site's files over `fetch`: each response streams in two halves, so progress can be seen; `holding` keeps the
 * second half back until `release`. `offline` makes every fetch fail as a browser's does, and `corrupt` serves one
 * path with a byte changed. An aborted fetch rejects, and so does its body, with an AbortError. */
export class FakeServer {
  holding = false
  offline = false
  corrupt: string | null = null
  requests: string[] = []
  private serving: Serving[] = []

  constructor(
    public files: Map<string, Uint8Array<ArrayBuffer>>,
    public origin = 'https://loupe.test',
  ) {}

  /** Sends the rest of every held response. */
  release() {
    const now = this.serving
    this.serving = []
    for (const s of now) s.release()
  }

  fetch = async (url: string, init: { signal?: AbortSignal } = {}): Promise<Response> => {
    const path = new URL(url).pathname.slice(1)
    this.requests.push(path)
    if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    if (this.offline) throw new TypeError('Failed to fetch')
    const found = this.files.get(path)
    if (!found) return new Response('Not found', { status: 404 })
    const data = found.slice()
    if (this.corrupt === path) data[0] ^= 1
    const half = Math.ceil(data.length / 2)
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(data.slice(0, half))
        const rest = () => {
          controller.enqueue(data.slice(half))
          controller.close()
        }
        init.signal?.addEventListener('abort', () =>
          controller.error(new DOMException('The operation was aborted.', 'AbortError')),
        )
        if (this.holding) this.serving.push({ path, release: rest })
        else rest()
      },
    })
    return new Response(body, { status: 200 })
  }
}

/** Cache Storage with one kind of cache: puts keep the bytes, `full` makes a put fail as a full disk does.
 * `holdingKeys` keeps each listing back, as the cache was when it was asked for, until `releaseKeys`. */
export class FakeCaches {
  full = false
  holdingKeys = false
  stores = new Map<string, Map<string, Uint8Array<ArrayBuffer>>>()
  private listings: (() => void)[] = []

  /** How many listings are held back. */
  get keysHeld() {
    return this.listings.length
  }

  releaseKeys() {
    const now = this.listings
    this.listings = []
    for (const release of now) release()
  }

  async open(name: string) {
    let store = this.stores.get(name)
    if (!store) this.stores.set(name, (store = new Map()))
    const kept = store
    return {
      keys: async () => {
        const now = [...kept.keys()].map((url) => ({ url }))
        if (this.holdingKeys) await new Promise<void>((release) => this.listings.push(release))
        return now
      },
      match: async (url: string) => (kept.has(url) ? new Response(kept.get(url)!.slice()) : undefined),
      put: async (url: string, response: Response) => {
        if (this.full) throw new DOMException('Quota exceeded.', 'QuotaExceededError')
        kept.set(url, new Uint8Array(await response.arrayBuffer()))
      },
      delete: async (url: string) => kept.delete(url),
    }
  }

  async delete(name: string) {
    return this.stores.delete(name)
  }

  /** The paths kept in `name`. */
  paths(name: string): string[] {
    return [...(this.stores.get(name)?.keys() ?? [])].map((url) => new URL(url).pathname.slice(1))
  }
}
