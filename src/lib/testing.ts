// Fakes for tests: ImageInfo builders and the worker client. Fakes over mocks (CLAUDE.md): each behaves
// like the real thing in the ways the tests rely on.
import type { Capabilities } from './capabilities'
import type { Camera, ImageInfo } from './info'
import { pixelAt, rgba, type Pixels } from './pixels'
import type { Rgba, StagePicture, WorkerClient } from './protocol'

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
    kinds: [],
    embedded: [],
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

/** A worker client whose opens the test settles, with `image` as the open picture's pixels. */
export class FakeClient implements WorkerClient {
  opens: FakeOpen[] = []
  pixelRequests: number[] = []

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
}
