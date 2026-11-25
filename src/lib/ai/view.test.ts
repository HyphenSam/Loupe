import { describe, expect, it } from 'vitest'
import { credentialsOf, type Credentials } from './c2pa'
import { fakeStore } from '../testing'
import { actionRows, credentialRows, sourceTypeRows } from './view'

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
