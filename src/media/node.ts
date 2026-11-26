/** For Node's tests only: the WebAssembly the browser fetches, read from node_modules instead, and the
 * fixtures. Never imported by the app. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import * as ort from 'onnxruntime-web/wasm'
import { setPlacesSource } from '@/worker/places'
import { setHeifWasmSource } from './codecs'
import { setWasmSource } from './exiftool'
import { setJpegtranWasmSource } from './jpegtran'
import { setOcrSource } from './ocr'

const require = createRequire(import.meta.url)

export const FIXTURES = join(import.meta.dirname, '../../fixtures')
export const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)))

/** ExifTool's wasm from disk. */
export function useNodeExifTool() {
  const path = require.resolve('@6over3/zeroperl-ts/zeroperl.wasm')
  setWasmSource(async () => new Response(readFileSync(path), { headers: { 'content-type': 'application/wasm' } }))
}

/** A package file's bytes, for initialising a codec. */
export const packageFile = (pkg: string, file: string) => readFileSync(join(dirname(require.resolve(pkg)), file))

/** jSquash's decoders, its PNG, JPEG and WebP encoders and libheif, initialised with their wasm from disk as Bytesize's tests do. */
export async function useNodeCodecs() {
  globalThis.ImageData ??= class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  } as unknown as typeof ImageData
  const compile = (pkg: string, file: string) => WebAssembly.compile(packageFile(pkg, file))
  const [{ init: jpeg }, { init: png }, { init: webp }, { init: jxl }, { init: pngEncoder }, { init: jpegEncoder }] =
    await Promise.all([
      import('@jsquash/jpeg/decode.js'),
      import('@jsquash/png/decode.js'),
      import('@jsquash/webp/decode.js'),
      import('@jsquash/jxl/decode.js'),
      import('@jsquash/png/encode.js'),
      import('@jsquash/jpeg/encode.js'),
    ])
  await jpeg(await compile('@jsquash/jpeg/decode.js', 'codec/dec/mozjpeg_dec.wasm'))
  await png(await compile('@jsquash/png/decode.js', 'codec/pkg/squoosh_png_bg.wasm'))
  await pngEncoder(await compile('@jsquash/png/encode.js', 'codec/pkg/squoosh_png_bg.wasm'))
  await jpegEncoder(await compile('@jsquash/jpeg/encode.js', 'codec/enc/mozjpeg_enc.wasm'))
  await webp(await compile('@jsquash/webp/decode.js', 'codec/dec/webp_dec.wasm'))
  await jxl(await compile('@jsquash/jxl/decode.js', 'codec/dec/jxl_dec.wasm'))
  // Node has SIMD, so the WebP encoder asks for its SIMD build.
  const { init: webpEncoder } = await import('@jsquash/webp/encode.js')
  await webpEncoder(await compile('@jsquash/webp/encode.js', 'codec/enc/webp_enc_simd.wasm'))
  // Export's: AVIF and JPEG XL on one thread (jSquash picks it in Node), oxipng and the resizer.
  const [{ init: avifEncoder }, { init: jxlEncoder }, { init: oxipng }, { initResize }] = await Promise.all([
    import('@jsquash/avif/encode.js'),
    import('@jsquash/jxl/encode.js'),
    import('@jsquash/oxipng/optimise.js'),
    import('@jsquash/resize'),
  ])
  await avifEncoder(await compile('@jsquash/avif/encode.js', 'codec/enc/avif_enc.wasm'))
  await jxlEncoder(await compile('@jsquash/jxl/encode.js', 'codec/enc/jxl_enc.wasm'))
  await oxipng(await compile('@jsquash/oxipng/optimise.js', 'codec/pkg/squoosh_oxipng_bg.wasm'))
  await initResize(await compile('@jsquash/resize', 'lib/resize/pkg/squoosh_resize_bg.wasm'))
  const heif = require.resolve('libheif-js/libheif-wasm/libheif.wasm')
  setHeifWasmSource(async () => new Uint8Array(readFileSync(heif)).buffer)
}

/** jpegtran's committed wasm from disk. */
export function useNodeJpegtran() {
  const path = join(import.meta.dirname, '../vendor/jpegtran/jpegtran.wasm')
  setJpegtranWasmSource(async () => new Uint8Array(readFileSync(path)).buffer)
}

/** The places data from public/ and the outlines from node_modules, as the worker fetches them. */
export function useNodePlaces() {
  const publicFile = (name: string) => readFileSync(join(import.meta.dirname, '../../public', name))
  setPlacesSource(async () => ({
    bin: new Uint8Array(publicFile('places.bin')),
    regions: JSON.parse(publicFile('regions.json').toString('utf8')),
    topology: JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8')),
  }))
}

/** The text recognition files from public/ocr/ (what the browser keeps in Cache Storage), on one thread: Node isn't
 * cross-origin isolated. */
export function useNodeOcr() {
  ort.env.wasm.numThreads = 1
  setOcrSource(async (file) => new Uint8Array(readFileSync(join(import.meta.dirname, '../../public', file.path))))
}
