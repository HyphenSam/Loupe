/** For Node's tests only: the WebAssembly the browser fetches, read from node_modules instead, and the
 * fixtures. Never imported by the app. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { setPlacesSource } from '@/worker/places'
import { setHeifWasmSource } from './codecs'
import { setWasmSource } from './exiftool'

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

/** jSquash's decoders and libheif, initialised with their wasm from disk as Bytesize's tests do. */
export async function useNodeCodecs() {
  globalThis.ImageData ??= class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  } as unknown as typeof ImageData
  const compile = (pkg: string, file: string) => WebAssembly.compile(packageFile(pkg, file))
  const [{ init: jpeg }, { init: png }, { init: webp }, { init: jxl }] = await Promise.all([
    import('@jsquash/jpeg/decode.js'),
    import('@jsquash/png/decode.js'),
    import('@jsquash/webp/decode.js'),
    import('@jsquash/jxl/decode.js'),
  ])
  await jpeg(await compile('@jsquash/jpeg/decode.js', 'codec/dec/mozjpeg_dec.wasm'))
  await png(await compile('@jsquash/png/decode.js', 'codec/pkg/squoosh_png_bg.wasm'))
  await webp(await compile('@jsquash/webp/decode.js', 'codec/dec/webp_dec.wasm'))
  await jxl(await compile('@jsquash/jxl/decode.js', 'codec/dec/jxl_dec.wasm'))
  const heif = require.resolve('libheif-js/libheif-wasm/libheif.wasm')
  setHeifWasmSource(async () => new Uint8Array(readFileSync(heif)).buffer)
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
