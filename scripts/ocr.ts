// Refreshes public/ocr/ and src/lib/ocr/models.json (SPEC.md 6.12 and 12): the Text tool's models, their
// character lists and ONNX Runtime's wasm, downloaded by the page only when the user asks and kept in Cache
// Storage, never precached. The output is committed; run `pnpm ocr` to refresh it, and after updating
// onnxruntime-web (its wasm must match its JavaScript, which scripts/ocr.test.ts checks).
//
// PaddleOCR publishes its models as ONNX on Hugging Face (PaddlePaddle/<name>_onnx, Apache-2.0), so nothing is
// converted. Each is pinned by its repository's commit and checked against its SHA-256. PP-OCRv6 (June 2026) has
// only general recognisers, whose list holds Han, kana, accented Latin and Greek but no Hangul or Cyrillic, so its
// small recogniser reads Latin, Chinese and Japanese and PP-OCRv5's mobile ones read Korean and Cyrillic. Its tiny
// detector serves every script: it scores above PP-OCRv5 mobile's on PaddleOCR's tables at a third of the size.
// The detector's thresholds and a recogniser's character list are in its inference.yml; the thresholds go into the
// manifest and the list is written out as text, one character a line. A recogniser's classes are CTC's blank, the
// list, then a space (PaddleOCR's `use_space_char`), which src/lib/ocr/ctc.ts assumes.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HUB = 'https://huggingface.co/PaddlePaddle'

/** The detector and one recogniser per script (src/lib/ocr/scripts.ts), pinned. `repo` under PaddlePaddle on
 * Hugging Face. */
export const OCR_MODELS = [
  {
    id: 'detector',
    name: 'ppocrv6-tiny-det',
    repo: 'PP-OCRv6_tiny_det_onnx',
    revision: '2ba1506c0380b8f0b03dd142459aac66d4421f6c',
    sha256: '193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8',
  },
  {
    id: 'latin-cjk',
    name: 'ppocrv6-small-rec',
    repo: 'PP-OCRv6_small_rec_onnx',
    revision: 'b8f84f0b80c529de40b4fbb3544b84fa7233a513',
    sha256: '5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634',
  },
  {
    id: 'korean',
    name: 'ppocrv5-mobile-rec-korean',
    repo: 'korean_PP-OCRv5_mobile_rec_onnx',
    revision: '5c6f574b8e2230adf4287b33e736d71b9fabd28e',
    sha256: '92f0b7785e64fc9090106a241cf4c1eb97472824558272751b88a2a4476d3a08',
  },
  {
    id: 'cyrillic',
    name: 'ppocrv5-mobile-rec-cyrillic',
    repo: 'cyrillic_PP-OCRv5_mobile_rec_onnx',
    revision: '2cef88145434beb8afa9dd82d77d799eb1ad7b29',
    sha256: '5371ee1ddaa7983cc62d0818d99e982b6804638c85e4f960d59a574094e172e5',
  },
] as const

/** DB post-processing's settings from the detector's inference.yml (PostProcess). */
export function detectorSettings(yml: string): { threshold: number; boxThreshold: number; unclipRatio: number } {
  const value = (key: string) => {
    const found = new RegExp(String.raw`^\s+${key}:\s*([\d.]+)\s*$`, 'm').exec(yml)
    if (!found) throw new Error(`No ${key} in the detector’s inference.yml.`)
    return Number(found[1])
  }
  return { threshold: value('thresh'), boxThreshold: value('box_thresh'), unclipRatio: value('unclip_ratio') }
}

/** The recogniser's characters from its inference.yml: the items of `character_dict`, plain or single-quoted
 * (PyYAML's dump). Anything else throws, since one misread item would shift every character after it. */
export function characters(yml: string): string[] {
  const lines = yml.replace(/\r\n?/g, '\n').split('\n')
  const start = lines.findIndex((line) => /^\s*character_dict:\s*$/.test(line))
  if (start < 0) throw new Error('No character_dict in inference.yml.')
  const list: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const item = /^\s*- (.*)$/.exec(lines[i])
    if (!item) break
    const value = item[1]
    if (/^'.*'$/.test(value)) list.push(value.slice(1, -1).replaceAll("''", "'"))
    else if (/^["'|>&*!%@`]/.test(value) || value === '') throw new Error(`Can’t read line ${i + 1}: ${value}`)
    else list.push(value)
  }
  for (const c of list) if (/[\r\n]/.test(c)) throw new Error('A character holds a line break.')
  return list
}

/** `name.ext` as `name.<first 8 of sha256>.ext`. */
export function hashedName(name: string, sha256: string): string {
  const dot = name.lastIndexOf('.')
  return `${name.slice(0, dot)}.${sha256.slice(0, 8)}${name.slice(dot)}`
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return new Uint8Array(await response.arrayBuffer())
}

if (import.meta.main) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const dir = join(root, 'public', 'ocr')
  mkdirSync(dir, { recursive: true })
  for (const old of readdirSync(dir)) if (old !== 'SOURCES.md') rmSync(join(dir, old))

  /** Writes the bytes under a hashed name and describes them for the manifest. */
  const keep = (name: string, bytes: Uint8Array) => {
    const hash = sha256(bytes)
    const file = hashedName(name, hash)
    writeFileSync(join(dir, file), bytes)
    console.log(`  ${file}: ${bytes.length} bytes`)
    return { path: `ocr/${file}`, size: bytes.length, sha256: hash }
  }

  const require = createRequire(import.meta.url)
  const runtime = keep(
    'ort-wasm-simd-threaded.wasm',
    readFileSync(require.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm')),
  )

  let detector: (ReturnType<typeof keep> & ReturnType<typeof detectorSettings>) | undefined
  const scripts: Record<string, { recogniser: ReturnType<typeof keep>; characters: ReturnType<typeof keep> }> = {}
  for (const model of OCR_MODELS) {
    const base = `${HUB}/${model.repo}/resolve/${model.revision}`
    const onnx = await download(`${base}/inference.onnx`)
    if (sha256(onnx) !== model.sha256) throw new Error(`${model.repo}: the model’s SHA-256 doesn’t match.`)
    const recogniser = keep(`${model.name}.onnx`, onnx)
    const yml = new TextDecoder().decode(await download(`${base}/inference.yml`))
    if (model.id === 'detector') {
      detector = { ...recogniser, ...detectorSettings(yml) }
      continue
    }
    const list = characters(yml)
    const text = new TextEncoder().encode(list.join('\n') + '\n')
    scripts[model.id] = { recogniser, characters: keep(`${model.name}.txt`, text) }
  }

  const manifest = { runtime, detector, scripts }
  writeFileSync(join(root, 'src', 'lib', 'ocr', 'models.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log('  src/lib/ocr/models.json')
}
