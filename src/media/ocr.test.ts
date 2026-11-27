// Reading text end to end in Node: ONNX Runtime Web with the real models from public/ocr/, on the fixtures.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Said } from '@/lib/errors'
import type { Script } from '@/lib/ocr/scripts'
import type { TextLine, TextProgress } from '@/lib/ocr/types'
import { decode } from './codecs'
import { fixture, useNodeCodecs, useNodeOcr } from './node'
import { closeOcr, MODEL_NOT_LOADED, readText, setOcrSource } from './ocr'

beforeAll(async () => {
  await useNodeCodecs()
  useNodeOcr()
})
// A test that changes where the files come from puts it back, even when it fails.
afterEach(() => useNodeOcr())
vi.setConfig({ testTimeout: 60_000 })

async function read(name: string, script: Script, onProgress?: (progress: TextProgress) => void) {
  const pixels = await decode(fixture(name), name.endsWith('.jpg') ? 'jpeg' : 'png', 1)
  return readText(pixels, script, onProgress)
}
const texts = (lines: TextLine[]) => lines.map((line) => line.text)

describe('readText', () => {
  it('reads Latin lines in reading order: two columns as rows, and the line set at an angle', async () => {
    expect(texts(await read('text-latin.png', 'latin-cjk'))).toEqual([
      'Opening hours',
      'Monday to Friday',
      '9:00-17:30',
      'Saturday',
      '10:00-16:00',
      'Sunday',
      'Closed',
      'Crème brûlée £4.50',
    ])
  })

  it('reads Chinese and Japanese with the same recogniser', async () => {
    expect(texts(await read('text-cjk.png', 'latin-cjk'))).toEqual([
      '今日はいい天気です',
      '欢迎使用文字识别',
      '歡迎光臨',
    ])
  })

  it('turns vertical Japanese to read it, and reads its columns right to left', async () => {
    const lines = await read('text-vertical.png', 'latin-cjk')
    expect(texts(lines)).toEqual(['縦書きの文章', '右から左へ', '読みます'])
    expect(lines.every((line) => line.vertical)).toBe(true)
  })

  it('reads Korean', async () => {
    expect(texts(await read('text-korean.png', 'korean'))).toEqual([
      '안녕하세요',
      '한국어 문자 인식',
      '서울특별시 종로구',
    ])
  })

  it('reads Cyrillic', async () => {
    expect(texts(await read('text-cyrillic.png', 'cyrillic'))).toEqual([
      'Добро пожаловать',
      'Съешь же ещё этих мягких французских булок',
      'Київ, Україна',
    ])
  })

  it('reads a photo of a sign', async () => {
    const all = texts(await read('commons/text-sign.jpg', 'latin-cjk')).join('\n')
    for (const words of ['THE', 'TOWN FRYER', 'FISH', 'CHIPS', '01752 815357']) expect(all).toContain(words)
  })

  it('gives each line’s box in the picture’s pixels and its confidence', async () => {
    const [first] = await read('text-latin.png', 'latin-cjk')
    // “Opening hours” is drawn from x 40 with its baseline at 70, 40 px high.
    expect(first.quad[0].x).toBeGreaterThan(30)
    expect(first.quad[0].x).toBeLessThan(45)
    expect(first.quad[2].y).toBeGreaterThan(70)
    expect(first.quad[2].y).toBeLessThan(90)
    expect(first.confidence).toBeGreaterThan(0.9)
    expect(first.vertical).toBe(false)
  })

  it('says how far it has got: finding the lines, then each line', async () => {
    const progress: TextProgress[] = []
    await read('text-cjk.png', 'latin-cjk', (p) => progress.push(p))
    expect(progress).toEqual([null, { line: 1, lines: 3 }, { line: 2, lines: 3 }, { line: 3, lines: 3 }])
  })

  it('finds nothing in a picture without text', async () => {
    expect(await read('png-16-alpha.png', 'latin-cjk')).toEqual([])
  })

  it('words a model it can’t load for the user, and tries again next time', async () => {
    await closeOcr()
    setOcrSource(async () => {
      throw new Error('Not in the cache.')
    })
    await expect(read('text-cjk.png', 'latin-cjk')).rejects.toThrow(MODEL_NOT_LOADED)
    useNodeOcr()
    expect(await read('text-cjk.png', 'latin-cjk')).toHaveLength(3)
  })

  it('loads the files again after closing, so files gone since are found missing', async () => {
    expect(await read('text-cjk.png', 'latin-cjk')).toHaveLength(3)
    await closeOcr()
    setOcrSource(async () => {
      throw new Said(MODEL_NOT_LOADED)
    })
    await expect(read('text-cjk.png', 'latin-cjk')).rejects.toThrow(MODEL_NOT_LOADED)
  })

  it('lets a read that’s running finish before closing', async () => {
    let closing: Promise<void> | undefined
    const lines = await read('text-cjk.png', 'latin-cjk', (progress) => {
      if (progress?.line === 1) closing = closeOcr()
    })
    expect(lines).toHaveLength(3)
    await closing
  })
})
