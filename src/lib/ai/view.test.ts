import { describe, expect, it } from 'vitest'
import { credentialsOf, type Credentials } from './c2pa'
import { fakeStore } from '../testing'
import { finding } from './finding'
import { actionRows, credentialRows, generatorCaption, generatorRows, sourceTypeRows } from './view'

const trusted = credentialsOf(fakeStore())

describe('credentialRows', () => {
  it('says who signed it, when, with what, and that it verified', () => {
    expect(credentialRows(trusted)).toEqual([
      { label: 'Signed by', value: 'OpenAI', note: 'Certificate “Truepic Lens CLI in Sora”.' },
      { label: 'Signed on', value: '20 November 2026 at 10:00 (UTC)' },
      { label: 'Claim generator', value: 'ChatGPT' },
      { label: 'Result', value: 'Verified' },
    ])
  })

  it('says when the signer isn’t on the trust list, and why credentials don’t verify', () => {
    const untrusted: Credentials = { ...trusted, state: 'untrusted', list: null, time: null, generator: null }
    expect(credentialRows(untrusted).at(-1)).toEqual({
      label: 'Result',
      value: 'Valid, but its signer isn’t on the trust list',
    })
    expect(credentialRows(untrusted).map((r) => r.label)).toEqual(['Signed by', 'Result'])
    const invalid: Credentials = {
      ...trusted,
      state: 'invalid',
      problems: ['The picture was changed after it was signed.'],
    }
    expect(credentialRows(invalid).at(-1)).toEqual({
      label: 'Result',
      value: 'Doesn’t verify',
      note: 'The picture was changed after it was signed.',
    })
  })

  it('names the signer by its certificate when there’s no organisation, and times with fractions and Z', () => {
    const c: Credentials = { ...trusted, signer: null, time: '2026-01-02T03:04:05.678Z' }
    expect(credentialRows(c).slice(0, 2)).toEqual([
      { label: 'Signed by', value: 'Truepic Lens CLI in Sora' },
      { label: 'Signed on', value: '2 January 2026 at 03:04 (UTC)' },
    ])
  })
})

describe('actionRows', () => {
  it('lists each action with its source type and software', () => {
    expect(actionRows(trusted)).toEqual([{ label: 'Created', value: 'Made with generative AI', note: 'By GPT-4o.' }])
    const plain: Credentials = {
      ...trusted,
      actions: [{ words: 'Opened', source: null, software: null, description: null }],
    }
    expect(actionRows(plain)).toEqual([{ label: 'Opened', value: '—' }])
    const described: Credentials = {
      ...trusted,
      actions: [
        { words: 'Edited', source: null, software: 'Gemini', description: 'Applied imperceptible SynthID watermark.' },
      ],
    }
    expect(actionRows(described)).toEqual([
      { label: 'Edited', value: 'Applied imperceptible SynthID watermark.', note: 'By Gemini.' },
    ])
  })
})

describe('sourceTypeRows', () => {
  it('words the stated term and keeps it as stated', () => {
    const value = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
    expect(sourceTypeRows(value)).toEqual([{ label: 'Stated', value: 'Made with generative AI', note: value }])
    expect(sourceTypeRows(null)).toEqual([])
  })
})

describe('generatorRows', () => {
  const g = finding('Forge', 'the PNG text chunk “parameters”', {
    prompt: 'a lighthouse',
    model: 'juggernautXL_v9',
    modelHash: '6ce0161689',
    seed: '3141592653',
    sampler: 'DPM++ 2M',
    steps: '28',
    cfg: '6.5',
    size: '832 × 1216',
    loras: [
      { name: 'film_grain', weight: '0.6' },
      { name: 'Coastal Style', weight: null },
    ],
    rest: [{ label: 'Schedule type', value: 'Karras' }],
  })

  it('lists the model with its hash, the settings, each LoRA and the rest, in that order', () => {
    expect(generatorRows(g)).toEqual([
      { label: 'Model', value: 'juggernautXL_v9', note: 'Hash 6ce0161689.' },
      { label: 'Seed', value: '3141592653' },
      { label: 'Sampler', value: 'DPM++ 2M' },
      { label: 'Steps', value: '28' },
      { label: 'CFG scale', value: '6.5' },
      { label: 'Size', value: '832 × 1216' },
      { label: 'LoRA', value: 'film_grain', note: 'Weight 0.6.' },
      { label: 'LoRA', value: 'Coastal Style' },
      { label: 'Schedule type', value: 'Karras' },
    ])
  })

  it('leaves out what the generator didn’t record', () => {
    expect(generatorRows(finding('Adobe Firefly', 'CreatorTool “Adobe Firefly”'))).toEqual([])
  })
})

describe('generatorCaption', () => {
  it('says where it was found and that anyone can change it', () => {
    expect(generatorCaption(finding('Forge', 'the PNG text chunk “parameters”'))).toBe(
      'Found in the PNG text chunk “parameters”. Stated in the file’s metadata; anyone can add or remove it.',
    )
  })

  it('says that stealth metadata survives removing the metadata', () => {
    const both = {
      ...finding('NovelAI', 'the PNG text chunks “Software”, “Source” and “Comment”'),
      where: ['the PNG text chunks “Software”, “Source” and “Comment”', 'the lowest bits of the alpha channel'],
    }
    expect(generatorCaption(both)).toBe(
      'Found in the PNG text chunks “Software”, “Source” and “Comment”, and in the lowest bits of the alpha ' +
        'channel, which removing metadata doesn’t clear. Anyone can add or remove it.',
    )
    expect(generatorCaption(finding('AUTOMATIC1111', 'the lowest bits of the red, green and blue channels'))).toBe(
      'Found in the lowest bits of the red, green and blue channels, which removing metadata doesn’t clear. ' +
        'Anyone can add or remove it.',
    )
  })
})
