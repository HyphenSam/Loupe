import { describe, expect, it } from 'vitest'
import type { Credentials } from './c2pa'
import { verdict } from './verdict'

const credentials = (over: Partial<Credentials> = {}): Credentials => ({
  state: 'trusted',
  list: 'c2pa',
  signer: 'OpenAI',
  certificate: 'Truepic Lens CLI in Sora',
  time: '2026-11-20T10:00:00+00:00',
  generator: 'OpenAI Media Service API',
  app: 'ChatGPT',
  claim: 'made',
  actions: [],
  ingredients: [],
  thumbnail: null,
  problems: [],
  ...over,
})

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/'
const none = { sourceType: null, generators: [] }

// SPEC.md 6.3's verdict table, row by row.
describe('verdict', () => {
  it('valid, trusted C2PA saying generative AI made it: Made with AI', () => {
    expect(verdict({ ...none, credentials: credentials() })).toEqual({
      verdict: 'Made with AI',
      detail: 'Content Credentials signed by OpenAI say it was made with generative AI in ChatGPT.',
      rests: 'signed',
      restsWords: 'Signed by OpenAI and verified.',
    })
  })

  it('valid, trusted C2PA saying AI edited it: Edited with AI', () => {
    const v = verdict({
      ...none,
      credentials: credentials({ claim: 'edited', signer: 'Adobe Inc.', app: 'Adobe Firefly' }),
    })
    expect(v).toEqual({
      verdict: 'Edited with AI',
      detail: 'Content Credentials signed by Adobe Inc. say it was edited with generative AI in Adobe Firefly.',
      rests: 'signed',
      restsWords: 'Signed by Adobe Inc. and verified.',
    })
  })

  it('valid, trusted C2PA from a camera’s capture: Signed by the camera', () => {
    const v = verdict({
      ...none,
      credentials: credentials({ claim: 'capture', signer: 'Leica', app: null, generator: 'Leica M11-P' }),
    })
    expect(v).toEqual({
      verdict: 'Signed by the camera',
      detail: 'Content Credentials signed by Leica say a camera took it, in Leica M11-P.',
      rests: 'signed',
      restsWords: 'Signed by Leica and verified.',
    })
  })

  it('valid C2PA whose signer isn’t on the trust list: the claim, resting on a signer Loupe doesn’t recognise', () => {
    const v = verdict({
      ...none,
      credentials: credentials({ state: 'untrusted', list: null, signer: 'C2PA Test Signing Cert' }),
    })
    expect(v.verdict).toBe('Made with AI')
    expect(v.rests).toBe('unrecognised')
    expect(v.restsWords).toBe('Signed by a signer Loupe doesn’t recognise.')
  })

  it('C2PA that doesn’t validate: Content Credentials don’t verify', () => {
    const v = verdict({
      ...none,
      credentials: credentials({ state: 'invalid', problems: ['The picture was changed after it was signed.'] }),
    })
    expect(v).toEqual({
      verdict: 'Content Credentials don’t verify',
      detail: 'The picture was changed after it was signed.',
      rests: 'broken',
      restsWords: 'The file was changed after signing, or the signature is broken. What they claim is listed below.',
    })
  })

  it('Digital Source Type only: Says it was made with AI, stated in the metadata', () => {
    expect(verdict({ credentials: null, sourceType: IPTC + 'trainedAlgorithmicMedia', generators: [] })).toEqual({
      verdict: 'Says it was made with AI',
      detail: 'Its Digital Source Type says “Made with generative AI”.',
      rests: 'stated',
      restsWords: 'Stated in the file’s metadata; anyone can add or remove this.',
    })
  })

  it('a Digital Source Type of AI editing says so', () => {
    const v = verdict({ credentials: null, sourceType: IPTC + 'compositeWithTrainedAlgorithmicMedia', generators: [] })
    expect(v.verdict).toBe('Says it was edited with AI')
  })

  it('generator metadata only: Says it was made with AI, naming the generator', () => {
    // A hand-made finding; phase 6's parsers make the real ones.
    expect(verdict({ credentials: null, sourceType: null, generators: [{ name: 'ComfyUI' }] })).toEqual({
      verdict: 'Says it was made with AI in ComfyUI',
      detail: 'Its metadata holds ComfyUI’s generation settings.',
      rests: 'stated',
      restsWords: 'Stated in the file’s metadata; anyone can add or remove this.',
    })
  })

  it('nothing: No AI markers found', () => {
    expect(verdict({ ...none, credentials: null })).toEqual({
      verdict: 'No AI markers found',
      detail: null,
      rests: 'nothing',
      restsWords: 'Most sites remove metadata, so this doesn’t mean it wasn’t made with AI.',
    })
  })
})

describe('verdict, between sources', () => {
  it('lets signed credentials’ claim outrank the metadata', () => {
    const v = verdict({
      credentials: credentials({ claim: 'capture', signer: 'Leica' }),
      sourceType: IPTC + 'trainedAlgorithmicMedia',
      generators: [],
    })
    expect(v.verdict).toBe('Signed by the camera')
  })

  it('falls back to the metadata when the credentials claim nothing', () => {
    const v = verdict({
      credentials: credentials({ claim: null }),
      sourceType: IPTC + 'trainedAlgorithmicMedia',
      generators: [],
    })
    expect(v.verdict).toBe('Says it was made with AI')
  })

  it('says credentials that claim nothing don’t mention AI, resting on their signature', () => {
    const v = verdict({
      ...none,
      credentials: credentials({ claim: null, signer: 'Adobe Inc.', generator: 'Adobe Photoshop' }),
    })
    expect(v).toEqual({
      verdict: 'No AI markers found',
      detail: 'Content Credentials signed by Adobe Inc. don’t mention AI.',
      rests: 'signed',
      restsWords: 'Signed by Adobe Inc. and verified.',
    })
  })

  it('a Digital Source Type that isn’t about AI is no AI marker', () => {
    expect(verdict({ credentials: null, sourceType: IPTC + 'digitalCapture', generators: [] }).verdict).toBe(
      'No AI markers found',
    )
  })

  it('names the claim generator when no action names the app', () => {
    const v = verdict({
      ...none,
      credentials: credentials({ app: null, generator: 'Google C2PA Core Generator Library' }),
    })
    expect(v.detail).toBe(
      'Content Credentials signed by OpenAI say it was made with generative AI in Google C2PA Core Generator Library.',
    )
  })

  it('credentials whose signature names no organisation use its certificate’s name', () => {
    const v = verdict({ ...none, credentials: credentials({ signer: null, certificate: 'Some Signer' }) })
    expect(v.restsWords).toBe('Signed by Some Signer and verified.')
  })
})
