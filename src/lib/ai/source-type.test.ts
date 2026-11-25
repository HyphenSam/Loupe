import { describe, expect, it } from 'vitest'
import { SOURCE_TYPES, sourceType } from './source-type'

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/'

describe('sourceType', () => {
  // IPTC's vocabulary (https://cv.iptc.org/newscodes/digitalsourcetype/, retired terms too) and C2PA's two.
  it.each([
    ['digitalCapture', 'Captured by a camera', null, true],
    ['computationalCapture', 'Captured by a camera, from several frames combined', null, true],
    ['negativeFilm', 'Scanned from a film negative', null, false],
    ['positiveFilm', 'Scanned from a slide', null, false],
    ['print', 'Scanned from a print', null, false],
    ['minorHumanEdits', 'Lightly edited by a person', null, false],
    ['humanEdits', 'Edited by a person without generative AI', null, false],
    ['compositeWithTrainedAlgorithmicMedia', 'Edited with generative AI', 'edited', false],
    ['algorithmicallyEnhanced', 'Enhanced by software without changing what it shows', null, false],
    ['softwareImage', 'Made by software', null, false],
    ['digitalArt', 'Digital art made by a person', null, false],
    ['digitalCreation', 'Made by a person with software, without generative AI', null, false],
    ['dataDrivenMedia', 'A picture of data, such as a chart', null, false],
    ['trainedAlgorithmicMedia', 'Made with generative AI', 'made', false],
    ['algorithmicMedia', 'Made by software without training data', null, false],
    ['screenCapture', 'A screenshot', null, false],
    ['virtualRecording', 'A recording of a virtual event', null, false],
    ['composite', 'A composite of several pictures, any of which may be generative AI', null, false],
    ['compositeCapture', 'A composite of photos', null, false],
    ['compositeSynthetic', 'A composite including generative AI', 'edited', false],
    ['empty', 'Empty: it has no content of its own', null, false],
    ['trainedAlgorithmicData', 'Data for training AI', null, false],
  ] as const)('%s is “%s”', (term, words, ai, capture) => {
    expect(sourceType(IPTC + term)).toEqual({ term, words, ai, capture })
  })

  it('covers the whole vocabulary', () => {
    expect(Object.keys(SOURCE_TYPES)).toHaveLength(22)
  })

  it('reads the URI over HTTPS, with a trailing slash, C2PA’s own namespace, or the bare term', () => {
    for (const value of [
      'https://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
      'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia/',
      'trainedAlgorithmicMedia',
      'digsrctype:trainedAlgorithmicMedia',
    ])
      expect(sourceType(value)!.words).toBe('Made with generative AI')
    expect(sourceType('http://c2pa.org/digitalsourcetype/trainedAlgorithmicData')!.term).toBe('trainedAlgorithmicData')
  })

  it('quotes a term outside the vocabulary rather than guessing', () => {
    expect(sourceType(IPTC + 'somethingNew')).toEqual({
      term: 'somethingNew',
      words: 'Digital source type “somethingNew”',
      ai: null,
      capture: false,
    })
  })

  it('is null for nothing', () => {
    expect(sourceType('')).toBe(null)
    expect(sourceType(null)).toBe(null)
  })
})
