/** jpegtran (libjpeg-turbo, built by tools/jpegtran/), the only place it runs: turns, flips and crops of a JPEG's
 * blocks, so no pixel is decoded or re-encoded. One function: bytes and a transform in, bytes out. */
import { loading, Said } from '@/lib/errors'
import type { Rect } from '@/lib/pixels'
import type { JpegTransform } from '@/lib/plans/plan'
import createJpegtran, { type JpegtranModule } from '@/vendor/jpegtran/jpegtran.js'
import wasmUrl from '@/vendor/jpegtran/jpegtran.wasm?url'

export type JpegtranOptions = {
  transform: JpegTransform
  /** In the turned picture. jpegtran moves a left or top edge off the block grid up or left onto it. */
  crop?: Rect | null
  /** Fail unless every block can move (-perfect). */
  perfect?: boolean
  /** Drop the partial blocks on edges that move (-trim). */
  trim?: boolean
  /** Which markers to keep: 'none' (the default) leaves only what libjpeg writes itself (JFIF, Adobe). */
  copy?: 'all' | 'none'
}

// transupp.h's JXFORM_CODE.
const CODES: Record<JpegTransform, number> = {
  none: 0,
  'flip-horizontal': 1,
  'flip-vertical': 2,
  transpose: 3,
  transverse: 4,
  'rotate-90': 5,
  'rotate-180': 6,
  'rotate-270': 7,
}
const PERFECT = 1
const TRIM = 2
const COPY_ALL = 4

let wasm = () => fetch(wasmUrl).then((response) => response.arrayBuffer())
let module: Promise<JpegtranModule> | null = null

/** Where the wasm comes from outside the browser (Node's tests). */
export function setJpegtranWasmSource(source: () => Promise<ArrayBuffer>) {
  wasm = source
  module = null
}

function load(): Promise<JpegtranModule> {
  module ??= wasm().then((wasmBinary) => createJpegtran({ wasmBinary }))
  // Nothing is remembered after a failure: the next job tries again (SPEC.md section 7).
  module.catch(() => (module = null))
  return module
}

export async function jpegtran(bytes: Uint8Array, options: JpegtranOptions): Promise<Uint8Array> {
  const m = await loading('jpegtran', load)
  const { crop } = options
  const spec = crop ? `${crop.width}x${crop.height}+${crop.x}+${crop.y}` : ''
  const flags = (options.perfect ? PERFECT : 0) | (options.trim ? TRIM : 0) | (options.copy === 'all' ? COPY_ALL : 0)
  const input = m._malloc(bytes.length)
  const specBytes = m.lengthBytesUTF8(spec) + 1
  const text = m._malloc(specBytes)
  const out = m._malloc(8)
  try {
    m.HEAPU8.set(bytes, input)
    m.stringToUTF8(spec, text, specBytes)
    const error = m._jpegtran(input, bytes.length, CODES[options.transform], flags, text, out, out + 4)
    if (error) throw new Said(`jpegtran couldn’t turn this picture: ${m.UTF8ToString(error)}`)
    // The heap may have grown during the call, so its views are read afresh.
    const [pointer, length] = [m.HEAPU32[out >> 2], m.HEAPU32[(out + 4) >> 2]]
    const result = m.HEAPU8.slice(pointer, pointer + length)
    m._free(pointer)
    return result
  } finally {
    m._free(input)
    m._free(text)
    m._free(out)
  }
}
