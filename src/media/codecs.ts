/** Decoding pictures to plain, upright RGBA with their stored values (SPEC.md section 5): jSquash for PNG,
 * JPEG, WebP and JPEG XL (Bytesize's), libheif for HEIC and HEIF, the browser for AVIF, GIF and BMP, and a
 * raw file's largest embedded preview. jSquash leaves EXIF orientation to the caller; libheif and libjxl
 * stand their pictures upright themselves, so EXIF Orientation isn't applied to those again. */
import encodeAvif from '@jsquash/avif/encode.js'
import decodeJpeg from '@jsquash/jpeg/decode.js'
import encodeJpegBytes from '@jsquash/jpeg/encode.js'
import decodeJxl from '@jsquash/jxl/decode.js'
import encodeJxl from '@jsquash/jxl/encode.js'
import decodePng from '@jsquash/png/decode.js'
import encodePngBytes from '@jsquash/png/encode.js'
import decodeWebp from '@jsquash/webp/decode.js'
import encodeWebp from '@jsquash/webp/encode.js'
import libheif from 'libheif-js/libheif-wasm/libheif.js'
import heifWasmUrl from 'libheif-js/libheif-wasm/libheif.wasm?url'
import { sniff, type Format } from '@/lib/formats'
import type { Encoding } from '@/lib/plans/plan'
import type { Embedded, Orientation } from '@/lib/info'
import { orient, type Pixels } from '@/lib/pixels'
import { readBinary } from './exiftool'

const plain = (image: ImageData): Pixels => ({ width: image.width, height: image.height, data: image.data })

/** The picture in `bytes`, upright. Throws for a format with no decoder here (TIFF, raw) or bytes the decoder
 * can't read. */
export async function decode(bytes: Uint8Array, format: Format, orientation: Orientation): Promise<Pixels> {
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
      throw new Error(`There's no decoder for ${format.toUpperCase()} pictures here.`)
  }
}

/** Through the browser's own decoder, which stands the picture upright. Its values are kept as stored: no
 * colour conversion, no premultiplied alpha. GIFs give their first frame. */
async function viaBrowser(bytes: Uint8Array, type: string): Promise<Pixels> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type }), {
    imageOrientation: 'from-image',
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return plain(context.getImageData(0, 0, canvas.width, canvas.height))
}

/** Upright pixels as a PNG, values kept exactly (for the clipboard and Save a PNG copy). */
export async function encodePng(p: Pixels): Promise<Blob> {
  const image = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height)
  return new Blob([await encodePngBytes(image)], { type: 'image/png' })
}

/** Upright pixels written as a pixel edit's result (SPEC.md 6.0), with Bytesize's encoder settings. Lossless
 * WebP keeps the colour under transparent pixels (`exact`), so every value survives. */
export async function encode(p: Pixels, e: Encoding): Promise<Uint8Array> {
  const image = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height)
  const quality = e.quality ?? 100
  switch (e.format) {
    case 'jpeg':
      return new Uint8Array(await encodeJpegBytes(image, { quality }))
    case 'png':
      return new Uint8Array(await encodePngBytes(image))
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
export async function resaveJpeg(p: Pixels, quality: number): Promise<Pixels> {
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
          onAbort: (why: unknown) => reject(new Error(`libheif couldn't start: ${String(why)}`)),
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
    if (!image) throw new Error('libheif found no picture in this file.')
    const width = image.get_width()
    const height = image.get_height()
    const target = { width, height, data: new Uint8ClampedArray(width * height * 4) }
    const result = await new Promise<Pixels | null>((resolve) => image.display(target, resolve))
    if (!result) throw new Error('libheif couldn’t decode this picture.')
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
