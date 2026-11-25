// Fakes for tests: ImageInfo builders and the worker client. Fakes over mocks (CLAUDE.md): each behaves
// like the real thing in the ways the tests rely on.
import type { ManifestStore } from '@contentauth/c2pa-web'
import type { ProvenanceReader, ReadProvenance } from './ai/c2pa'
import type { Capabilities } from './capabilities'
import type { Camera, ImageInfo } from './info'
import { pixelAt, rgba, type Pixels } from './pixels'
import type { Plan } from './plans/plan'
import { CANCELLED, type PngSource, type Rgba, type RunResult, type StagePicture, type WorkerClient } from './protocol'

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

/** A worker client whose opens, runs and cancels the test settles, with `image` as the open picture's pixels. */
export class FakeClient implements WorkerClient {
  opens: FakeOpen[] = []
  runs: FakeRun[] = []
  /** Cancels asked for: each settles once the test calls it, as the new worker has reopened the file. */
  cancels: (() => void)[] = []
  /** What `png` was asked to convert: undefined for the open picture. */
  pngSources: (PngSource | undefined)[] = []
  pixelRequests: number[] = []
  /** How many times the open picture was asked for as a PNG. */
  pngRequests = 0
  /** What `png` answers: a PNG of the picture, or a failure's message. */
  pngResult: Blob | string = new Blob(['png'], { type: 'image/png' })

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

  async pixel(x: number, y: number): Promise<Rgba | null> {
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
    return new Promise((resolve) => this.cancels.push(resolve))
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
