/** Reading text (SPEC.md 6.12) with ONNX Runtime Web's plain WebAssembly build: the detector finds the lines, the
 * script's recogniser reads them, and the steps between are src/lib/ocr/'s. The files come through `load`: from
 * Cache Storage in the browser, where the Text tool keeps them once downloaded; from public/ in Node's tests. */
import * as ort from 'onnxruntime-web/wasm'
import { Said } from '@/lib/errors'
import { decode } from '@/lib/ocr/ctc'
import { detectorInput, findLines } from '@/lib/ocr/detect'
import { cutLine, LINE_HEIGHT, recogniserInput, turnTall } from '@/lib/ocr/line'
import { MODELS, TEXT_CACHE, textCacheUrl, type OcrFile } from '@/lib/ocr/models'
import { readingOrder } from '@/lib/ocr/order'
import type { Script } from '@/lib/ocr/scripts'
import type { TextLine, TextProgress } from '@/lib/ocr/types'
import type { Pixels } from '@/lib/pixels'

export const MODEL_NOT_LOADED = 'The text recognition model couldn’t be loaded. Download it again from the Text tool.'

/** The detector reads the picture with its long side at most this (SPEC.md 6.12). */
const DETECT_SIDE = 960

type Load = (file: OcrFile) => Promise<Uint8Array>
type Recogniser = { session: ort.InferenceSession; characters: string[] }

async function fromCache(file: OcrFile): Promise<Uint8Array> {
  const response = await (await caches.open(TEXT_CACHE)).match(textCacheUrl(file, self.location.origin))
  if (!response) throw new Said(MODEL_NOT_LOADED)
  return new Uint8Array(await response.arrayBuffer())
}

let load: Load = fromCache
let runtime: Promise<void> | null = null
let detector: Promise<ort.InferenceSession> | null = null
const recognisers = new Map<Script, Promise<Recogniser>>()
// One read at a time: a session runs one call at once, and the page asks again when the script changes.
let queue: Promise<unknown> = Promise.resolve()

/** Where the files come from (Node's tests: public/). */
export function setOcrSource(source: Load) {
  load = source
}

/** Forgets the sessions, so the next read loads its files again. */
export function closeOcr() {
  void detector?.then((session) => session.release()).catch(() => {})
  for (const recogniser of recognisers.values()) void recogniser.then((r) => r.session.release()).catch(() => {})
  detector = null
  recognisers.clear()
}

/** ONNX Runtime's wasm, handed over as bytes once before the first session: it fetches nothing itself. */
function ready(): Promise<void> {
  runtime ??= load(MODELS.runtime).then((bytes) => {
    ort.env.wasm.wasmBinary = bytes
  })
  runtime.catch(() => (runtime = null))
  return runtime
}

async function session(file: OcrFile): Promise<ort.InferenceSession> {
  await ready()
  return ort.InferenceSession.create(await load(file), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    // PaddleOCR's export leaves unused initialisers, which ONNX Runtime warns about on every load.
    logSeverityLevel: 3,
  })
}

function detectorSession(): Promise<ort.InferenceSession> {
  const made = (detector ??= session(MODELS.detector))
  made.catch(() => detector === made && (detector = null))
  return made
}

function recogniserFor(script: Script): Promise<Recogniser> {
  let made = recognisers.get(script)
  if (!made) {
    const { recogniser, characters } = MODELS.scripts[script]
    made = Promise.all([session(recogniser), load(characters)]).then(([s, bytes]) => ({
      session: s,
      characters: new TextDecoder().decode(bytes).split('\n').slice(0, -1),
    }))
    recognisers.set(script, made)
    made.catch(() => recognisers.get(script) === made && recognisers.delete(script))
  }
  return made
}

async function only(session: ort.InferenceSession, data: Float32Array, dims: number[]): Promise<ort.Tensor> {
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, dims) })
  return out[session.outputNames[0]]
}

async function read(pixels: Pixels, script: Script, onProgress: (progress: TextProgress) => void): Promise<TextLine[]> {
  onProgress(null)
  let models: [ort.InferenceSession, Recogniser]
  try {
    models = await Promise.all([detectorSession(), recogniserFor(script)])
  } catch {
    throw new Said(MODEL_NOT_LOADED)
  }
  const [det, rec] = models
  const input = detectorInput(pixels, DETECT_SIDE)
  const map = await only(det, input.data, [1, 3, input.height, input.width])
  const quads = findLines(
    { width: input.width, height: input.height, data: map.data as Float32Array },
    MODELS.detector,
    pixels,
  )
  const lines: TextLine[] = []
  for (const [i, quad] of quads.entries()) {
    onProgress({ line: i + 1, lines: quads.length })
    const cut = cutLine(pixels, quad)
    const turned = turnTall(cut)
    const line = recogniserInput(turned ?? cut)
    const out = await only(rec.session, line.data, [1, 3, LINE_HEIGHT, line.width])
    const { text, confidence } = decode(out.data as Float32Array, rec.characters)
    if (text.trim()) lines.push({ text: text.trim(), confidence, quad, vertical: turned !== null })
  }
  return readingOrder(lines)
}

/** The lines of text in the upright picture, in reading order, read with `script`'s recogniser. */
export function readText(
  pixels: Pixels,
  script: Script,
  onProgress: (progress: TextProgress) => void = () => {},
): Promise<TextLine[]> {
  const result = queue.then(() => read(pixels, script, onProgress))
  queue = result.catch(() => {})
  return result
}
