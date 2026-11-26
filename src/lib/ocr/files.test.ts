import { describe, expect, it } from 'vitest'
import {
  defaultScript,
  downloadSize,
  filesFor,
  heldScripts,
  keptWords,
  megabytes,
  progressWords,
  staleKeys,
} from './files'
import { MODELS, textCacheUrl } from './models'

const ORIGIN = 'https://loupe.hyphensam.com'
const paths = (script: Parameters<typeof filesFor>[0]) => filesFor(script).map((f) => f.path)

describe('filesFor', () => {
  it('needs ONNX Runtime, the detector, and the script’s recogniser and character list', () => {
    expect(paths('korean')).toEqual([
      MODELS.runtime.path,
      MODELS.detector.path,
      MODELS.scripts.korean.recogniser.path,
      MODELS.scripts.korean.characters.path,
    ])
  })
})

describe('downloadSize', () => {
  it('adds up every file when nothing is held: about 38 MB for Latin, Chinese and Japanese', () => {
    const size = downloadSize('latin-cjk', [])
    expect(size).toBe(filesFor('latin-cjk').reduce((sum, f) => sum + f.size, 0))
    expect(megabytes(size)).toBe('38 MB')
  })

  it('leaves out what’s held: Korean after Latin needs only its recogniser and characters', () => {
    const size = downloadSize('korean', paths('latin-cjk'))
    expect(size).toBe(MODELS.scripts.korean.recogniser.size + MODELS.scripts.korean.characters.size)
    expect(megabytes(size)).toBe('13 MB')
  })

  it('is nothing when the script is held', () => {
    expect(downloadSize('cyrillic', paths('cyrillic'))).toBe(0)
  })
})

describe('defaultScript', () => {
  it('follows the first language', () => {
    expect(defaultScript(['ko-KR', 'en'])).toBe('korean')
    expect(defaultScript(['uk', 'en'])).toBe('cyrillic')
    for (const language of ['ru', 'be', 'bg', 'sr-Cyrl', 'mk', 'kk']) expect(defaultScript([language])).toBe('cyrillic')
  })

  it('is Latin, Chinese and Japanese for anything else, or nothing', () => {
    expect(defaultScript(['en-NZ', 'ko'])).toBe('latin-cjk')
    expect(defaultScript(['ja'])).toBe('latin-cjk')
    expect(defaultScript([])).toBe('latin-cjk')
  })
})

describe('staleKeys', () => {
  it('finds cached files an older manifest named', () => {
    const current = textCacheUrl(MODELS.detector, ORIGIN)
    const old = `${ORIGIN}/ocr/ppocrv5-mobile-det.0123abcd.onnx`
    expect(staleKeys([current, old], ORIGIN)).toEqual([old])
  })
})

describe('heldScripts and keptWords', () => {
  it('lists the scripts whose files are all held, and their size', () => {
    const held = [...paths('latin-cjk'), ...paths('korean')]
    expect(heldScripts(held)).toEqual(['latin-cjk', 'korean'])
    expect(keptWords(held)).toBe('Kept on this device: Latin, Chinese and Japanese; Korean (51 MB).')
  })

  it('says nothing when no script is whole', () => {
    expect(heldScripts([MODELS.runtime.path])).toEqual([])
    expect(keptWords([MODELS.runtime.path])).toBeNull()
  })
})

describe('progressWords', () => {
  it('gives what’s done to a tenth of a megabyte against the whole', () => {
    expect(progressWords(9_640_000, 37_863_756)).toBe('9.6 of 38 MB')
    expect(progressWords(0, 13_466_238)).toBe('0.0 of 13 MB')
  })
})
