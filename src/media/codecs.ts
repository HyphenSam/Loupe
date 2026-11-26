/** Decoding pictures to plain, upright RGBA with their stored values (SPEC.md section 5): jSquash for PNG,
 * JPEG, WebP and JPEG XL (Bytesize's), libheif for HEIC and HEIF, the browser for AVIF, GIF and BMP, and a
 * raw file's largest embedded preview. jSquash leaves EXIF orientation to the caller; libheif and libjxl
 * stand their pictures upright themselves, so EXIF Orientation isn't applied to those again. Encoding, resizing
 * and oxipng's PNG recompression are Bytesize's engine; AVIF, JPEG XL and oxipng use threads where the page is
 * cross-origin isolated. */
import encodeAvif from '@jsquash/avif/encode.js'
import decodeJpeg from '@jsquash/jpeg/decode.js'
import encodeJpegBytes from '@jsquash/jpeg/encode.js'
import decodeJxl from '@jsquash/jxl/decode.js'
import encodeJxl from '@jsquash/jxl/encode.js'
import decodePng from '@jsquash/png/decode.js'
import optimisePng from '@jsquash/oxipng/optimise.js'
import encodePngBytes from '@jsquash/png/encode.js'
import resizeImage from '@jsquash/resize'
import decodeWebp from '@jsquash/webp/decode.js'
import encodeWebp from '@jsquash/webp/encode.js'
import libheif from 'libheif-js/libheif-wasm/libheif.js'
import heifWasmUrl from 'libheif-js/libheif-wasm/libheif.wasm?url'
import { loading, Said } from '@/lib/errors'
import { formatName, sniff, type Format } from '@/lib/formats'
import { FORMAT_NAMES } from '@/lib/plans/pixel-edit'
import type { Encoding } from '@/lib/plans/plan'
import type { Embedded, Orientation } from '@/lib/info'
import { flatten, hasAlpha, orient, type Pixels } from '@/lib/pixels'
import { readBinary } from './exiftool'

const plain = (image: ImageData): Pixels => ({ width: image.width, height: image.height, data: image.data })

/** The picture in `bytes`, upright. Throws for a format with no decoder here (TIFF, raw) or bytes the decoder
 * can't read. Each codec's wasm is fetched on its first use, so a failure to load names the codec. */
export const decode = (bytes: Uint8Array, format: Format, orientation: Orientation): Promise<Pixels> =>
  loading(`The ${formatName(format, format.toUpperCase())} decoder`, () => decodeAny(bytes, format, orientation))

async function decodeAny(bytes: Uint8Array, format: Format, orientation: Orientation): Promise<Pixels> {
  const buffer = bytes.slice().buffer
  switch (format) {
    case 'jpeg':
      return orient(plain(await decodeJpeg(buffer, { preserveOrientation: false })), orientation)
    case 'png':
      return orient(plain(await decodePng(buffer)), orientation)
    case 'webp':
      return orient(plain(await decodeWebp(buffer)), orientation)
    case 'jxl':
      return plain(await decodeJxl(buffer))
    case 'heic':
      return decodeHeif(bytes)
    case 'avif':
    case 'gif':
    case 'bmp':
      return viaBrowser(bytes, `image/${format}`)
    case 'tiff':
    case 'raw':
      throw new Said(`There's no decoder for ${format.toUpperCase()} pictures here.`)
  }
}

/** Through the browser's own decoder, which stands the picture upright. Its values are kept as stored (no
 * premultiplied alpha), or converted to sRGB with `convert`. GIFs give their first frame. */
async function viaBrowser(bytes: Uint8Array, type: string, convert = false): Promise<Pixels> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type }), {
    imageOrientation: 'from-image',
    colorSpaceConversion: convert ? 'default' : 'none',
    premultiplyAlpha: 'none',
  })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return plain(context.getImageData(0, 0, canvas.width, canvas.height))
}

/** The picture converted to sRGB by the browser, upright (Bytesize's), for a format that can't carry its colour
 * profile (SPEC.md 6.11). Where the browser can't decode the file (HEIC, mostly), the stored pixels from `stored`,
 * a Display P3 picture's converted through a canvas. */
export async function decodeSrgb(
  bytes: Uint8Array,
  format: Format,
  space: string | null,
  stored: () => Promise<Pixels>,
): Promise<Pixels> {
  try {
    return await viaBrowser(bytes, `image/${format}`, true)
  } catch {
    const p = await stored()
    if (space !== 'display-p3') return p
    const canvas = new OffscreenCanvas(p.width, p.height)
    const context = canvas.getContext('2d', { colorSpace: 'display-p3', willReadFrequently: true })!
    const image = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height, { colorSpace: 'display-p3' })
    context.putImageData(image, 0, 0)
    return plain(context.getImageData(0, 0, p.width, p.height, { colorSpace: 'srgb' }))
  }
}

/** The picture at `width` × `height`: Lanczos3 in linear light with premultiplied alpha, as Squoosh does. */
export const resize = (p: Pixels, width: number, height: number) =>
  loading('The resizer', () => resizeAny(p, width, height))

async function resizeAny(p: Pixels, width: number, height: number): Promise<Pixels> {
  const image = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height)
  const options = {
    width,
    height,
    method: 'lanczos3',
    fitMethod: 'stretch',
    premultiply: true,
    linearRGB: true,
  } as const
  return plain(await resizeImage(image, options))
}

/** oxipng's settings: level 2 (Bytesize's), with the colour under transparent pixels kept so every value survives. */
const OXIPNG = { level: 2, interlace: false, optimiseAlpha: false }

/** A PNG file recompressed by oxipng, its chunks and bit depth kept: Export's PNG written as PNG. */
export const repackPng = (png: Uint8Array) =>
  loading('The PNG encoder', async () => new Uint8Array(await optimisePng(png.slice().buffer, OXIPNG)))

/** Upright pixels as a PNG, values kept exactly (for the clipboard and Save a PNG copy). Quick rather than small:
 * oxipng is for files that are kept. */
export const encodePng = (p: Pixels): Promise<Blob> =>
  loading('The PNG encoder', async () => {
    const image = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height)
    return new Blob([await encodePngBytes(image)], { type: 'image/png' })
  })

/** Upright pixels written as a pixel edit's result (SPEC.md 6.0), with Bytesize's encoder settings. Lossless
 * WebP keeps the colour under transparent pixels (`exact`), so every value survives. JPEG has no transparency, so
 * a transparent picture goes over white first. */
export const encode = (p: Pixels, e: Encoding): Promise<Uint8Array> =>
  loading(`The ${FORMAT_NAMES[e.format]} encoder`, () => encodeAny(p, e))

async function encodeAny(p: Pixels, e: Encoding): Promise<Uint8Array> {
  const image = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height)
  const quality = e.quality ?? 100
  switch (e.format) {
    case 'jpeg': {
      const opaque = hasAlpha(p) ? flatten(p) : p
      return new Uint8Array(
        await encodeJpegBytes(new ImageData(new Uint8ClampedArray(opaque.data), p.width, p.height), { quality }),
      )
    }
    case 'png':
      return new Uint8Array(await optimisePng(image, OXIPNG))
    case 'webp':
      // In lossless mode libwebp's quality is effort; 75 is its default.
      return new Uint8Array(
        await encodeWebp(
          image,
          e.lossless ? { lossless: 1, exact: 1, quality: 75, method: 4 } : { quality, method: 4 },
        ),
      )
    case 'avif':
      // Speed 7: about 2.5× faster than libavif's default 6, files within a percent or two (Bytesize).
      return new Uint8Array(await encodeAvif(image, e.lossless ? { lossless: true, speed: 7 } : { quality, speed: 7 }))
    case 'jxl':
      return new Uint8Array(await encodeJxl(image, e.lossless ? { lossless: true, effort: 7 } : { quality, effort: 7 }))
  }
}

/** The picture saved as a JPEG at `quality` by MozJPEG and decoded again, for Error levels (SPEC.md 6.5).
 * Colour at full resolution (4:4:4), so the re-save adds no error of its own from shrinking and growing
 * colour; with that, MozJPEG's own tables showed edits more clearly than libjpeg's (src/media/layers.test.ts).
 * Baseline with fixed Huffman tables changes no pixel and is quicker. */
export const resaveJpeg = (p: Pixels, quality: number) => loading('The JPEG encoder', () => resaveAny(p, quality))

async function resaveAny(p: Pixels, quality: number): Promise<Pixels> {
  const image = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height)
  const bytes = await encodeJpegBytes(image, {
    quality,
    progressive: false,
    optimize_coding: false,
    auto_subsample: false,
    chroma_subsample: 1,
  })
  return plain(await decodeJpeg(bytes, { preserveOrientation: false }))
}

// libheif: the Emscripten build with its wasm as a separate file (LGPL-3.0: replaceable), loaded once.

type HeifImage = {
  get_width(): number
  get_height(): number
  is_primary(): boolean
  display(target: Pixels, done: (result: Pixels | null) => void): void
  free(): void
}
type HeifModule = {
  HeifDecoder: new () => { decoder: number; decode(bytes: Uint8Array): HeifImage[] }
  heif_context_free(context: number): void
}

let heifWasm = () => fetch(heifWasmUrl).then((response) => response.arrayBuffer())
// Wrapped: an Emscripten module can look like a promise.
let heif: Promise<{ lib: HeifModule }> | null = null

/** Where libheif's wasm comes from outside the browser (Node's tests). */
export function setHeifWasmSource(source: () => Promise<ArrayBuffer>) {
  heifWasm = source
  heif = null
}

function loadHeif(): Promise<{ lib: HeifModule }> {
  heif ??= heifWasm().then(
    (wasmBinary) =>
      new Promise((resolve, reject) => {
        // Emscripten calls this on the module, sometimes before the factory has returned it.
        ;(libheif as unknown as (options: object) => HeifModule)({
          wasmBinary,
          onRuntimeInitialized(this: HeifModule) {
            resolve({ lib: this })
          },
          onAbort: (why: unknown) => reject(new Said(`libheif couldn't start: ${String(why)}`)),
          print: () => {},
          printErr: () => {},
        })
      }),
  )
  heif.catch(() => (heif = null))
  return heif
}

async function decodeHeif(bytes: Uint8Array): Promise<Pixels> {
  const { lib } = await loadHeif()
  const decoder = new lib.HeifDecoder()
  const images = decoder.decode(bytes)
  try {
    const image = images.find((i) => i.is_primary()) ?? images[0]
    if (!image) throw new Said('libheif found no picture in this file.')
    const width = image.get_width()
    const height = image.get_height()
    const target = { width, height, data: new Uint8ClampedArray(width * height * 4) }
    const result = await new Promise<Pixels | null>((resolve) => image.display(target, resolve))
    if (!result) throw new Said('libheif couldn’t decode this picture.')
    return result
  } finally {
    for (const image of images) image.free()
    if (decoder.decoder) lib.heif_context_free(decoder.decoder)
  }
}

/** The largest of `kinds` among a file's embedded pictures that decodes, and which it was, upright for the
 * file's Orientation; null if none does. Embedded pictures are JPEGs, stored the way the main picture is. */
export async function largestEmbedded(
  name: string,
  bytes: Uint8Array,
  embedded: Embedded[],
  orientation: Orientation,
  kinds: Embedded['kind'][],
): Promise<{ item: Embedded; pixels: Pixels } | null> {
  const candidates = embedded
    .filter((e) => e.isImage && kinds.includes(e.kind))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
  for (const item of candidates) {
    try {
      // ExifTool warns, and the wrapper throws, when asked for a stub preview's bytes.
      const picture = await readBinary(name, bytes, item.id)
      if (!picture || sniff(picture) !== 'jpeg') continue
      return { item, pixels: await decode(picture, 'jpeg', orientation) }
    } catch {
      // A stub or a broken picture: try the next.
    }
  }
  return null
}

/** A raw file's largest embedded picture that decodes, upright for the raw file's Orientation; null if none
 * does. */
export async function largestPreview(
  name: string,
  bytes: Uint8Array,
  embedded: Embedded[],
  orientation: Orientation,
): Promise<Pixels | null> {
  const found = await largestEmbedded(name, bytes, embedded, orientation, ['preview', 'thumbnail', 'mpf-image'])
  return found?.pixels ?? null
}
