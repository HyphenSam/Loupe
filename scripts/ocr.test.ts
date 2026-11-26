import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../src/lib/ocr/models.json' with { type: 'json' }
import { characters, detectorSettings, hashedName } from './ocr.ts'

const yml = (list: string) => `Global:
  model_name: latin_PP-OCRv5_mobile_rec
PostProcess:
  name: CTCLabelDecode
  character_dict:
${list}
`

describe('characters', () => {
  it('reads the recogniser’s character list from its inference.yml, unquoting as YAML does', () => {
    expect(characters(yml(`  - '0'\n  - a\n  - ''''\n  - '#'\n  - 　\n  - é`))).toEqual(['0', 'a', "'", '#', '　', 'é'])
  })

  it('stops at the end of the list', () => {
    expect(characters(yml('  - a\n  - b') + 'Other:\n  - c\n')).toEqual(['a', 'b'])
  })

  it('refuses what it can’t read rather than shifting every character after it', () => {
    expect(() => characters(yml(`  - a\n  - "\\u00e9"`))).toThrow(/line 7/)
    expect(() => characters('Global:\n  model_name: x\n')).toThrow(/character_dict/)
  })
})

describe('detectorSettings', () => {
  it('reads DB post-processing’s thresholds from the detector’s inference.yml', () => {
    const yml = `PostProcess:
  box_thresh: 0.4
  max_candidates: 3000
  name: DBPostProcess
  thresh: 0.2
  unclip_ratio: 1.4
PreProcess:
`
    expect(detectorSettings(yml)).toEqual({ threshold: 0.2, boxThreshold: 0.4, unclipRatio: 1.4 })
  })

  it('refuses a file without them', () => {
    expect(() => detectorSettings('PostProcess:\n  thresh: 0.2\n')).toThrow(/box_thresh/)
  })
})

describe('hashedName', () => {
  it('puts the start of the SHA-256 before the extension, so a new model never meets an old cache', () => {
    expect(hashedName('ppocrv5-det.onnx', 'a431985659dc9219')).toBe('ppocrv5-det.a4319856.onnx')
  })
})

describe('models.json', () => {
  const file = (path: string) => readFileSync(join(import.meta.dirname, '../public', path))
  const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

  it('describes the files in public/ocr/ as they are', () => {
    const all = [
      manifest.runtime,
      manifest.detector,
      ...Object.values(manifest.scripts).flatMap((s) => [s.recogniser, s.characters]),
    ]
    for (const { path, size, sha256: hash } of all) {
      const bytes = file(path)
      expect(bytes.length, path).toBe(size)
      expect(sha256(bytes), path).toBe(hash)
    }
  })

  it('holds the ONNX Runtime wasm the installed onnxruntime-web was built with (run pnpm ocr after updating it)', () => {
    const require = createRequire(import.meta.url)
    const installed = readFileSync(require.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm'))
    expect(sha256(installed)).toBe(manifest.runtime.sha256)
  })
})
