/** Decoding pictures to plain, upright RGBA with their stored values (SPEC.md section 5): jSquash for PNG,
 * JPEG, WebP and JPEG XL (Bytesize's), libheif for HEIC and HEIF, the browser for AVIF, GIF and BMP, and a
 * raw file's largest embedded preview. jSquash leaves EXIF orientation to the caller; libheif and libjxl
 * stand their pictures upright themselves, so EXIF Orientation isn't applied to those again. */
import decodeJpeg from '@jsquash/jpeg/decode.js'
import decodeJxl from '@jsquash/jxl/decode.js'
import decodePng from '@jsquash/png/decode.js'
import decodeWebp from '@jsquash/webp/decode.js'
import libheif from 'libheif-js/libheif-wasm/libheif.js'
import heifWasmUrl from 'libheif-js/libheif-wasm/libheif.wasm?url'
import { sniff, type Format } from '@/lib/formats'
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

/** A raw file's largest embedded picture that decodes, upright for the raw file's Orientation; null if none
 * does. Raw files' previews are JPEGs. */
export async function largestPreview(
  name: string,
  bytes: Uint8Array,
  embedded: Embedded[],
  orientation: Orientation,
): Promise<Pixels | null> {
  const candidates = embedded
    .filter((e) => e.isImage && (e.kind === 'preview' || e.kind === 'thumbnail' || e.kind === 'mpf-image'))
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
  for (const candidate of candidates) {
    try {
      // ExifTool warns, and the wrapper throws, when asked for a stub preview's bytes.
      const preview = await readBinary(name, bytes, candidate.id)
      if (!preview || sniff(preview) !== 'jpeg') continue
      return await decode(preview, 'jpeg', orientation)
    } catch {
      // A stub or a broken preview: try the next.
    }
  }
  return null
}
