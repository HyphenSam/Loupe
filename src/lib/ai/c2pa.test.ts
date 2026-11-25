// The manifest stores in ./manifests are what @contentauth/c2pa-web (src/media/c2pa.ts, with the bundled
// trust lists) returned in Chrome for each C2PA sample in fixtures/c2pa/, and for a picture made with
// ChatGPT and one made with Gemini on 25 November 2026 (the pictures themselves aren't kept); the SDK needs
// a browser. Read again and save them when the SDK or the trust lists change.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ManifestStore } from '@contentauth/c2pa-web'
import { credentialsOf, trustCaption } from './c2pa'

const store = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'manifests', `${name}.json`), 'utf8')) as ManifestStore

describe('credentialsOf', () => {
  it('reads CA.jpg: valid, signed by a test certificate not on any list, opened and adjusted', () => {
    const c = credentialsOf(store('CA'))
    expect(c.state).toBe('untrusted')
    expect(c.list).toBe(null)
    expect(c.signer).toBe('C2PA Test Signing Cert')
    expect(c.certificate).toBe('C2PA Signer')
    expect(c.time).toBe('2024-08-06T21:53:37+00:00')
    expect(c.generator).toBe('make_test_images 0.33.1')
    expect(c.claim).toBe(null)
    expect(c.app).toBe(null)
    expect(c.actions).toEqual([
      { words: 'Opened', source: null, software: null, description: null },
      { words: 'Colours adjusted', source: null, software: null, description: null },
    ])
    expect(c.ingredients).toEqual([
      {
        title: 'A.jpg',
        relationship: 'Edited from',
        thumbnail: expect.stringContaining('c2pa.thumbnail.ingredient.jpeg'),
        signed: false,
      },
    ])
    expect(c.thumbnail).toContain('c2pa.thumbnail.claim.jpeg')
    expect(c.problems).toEqual([])
  })

  it('reads XCA.jpg as changed after signing', () => {
    const c = credentialsOf(store('XCA'))
    expect(c.state).toBe('invalid')
    expect(c.problems).toEqual(['The picture was changed after it was signed.'])
  })

  it('reads genai-actions-v2.jpg: trusted through the interim list, edited with AI from a picture made with AI', () => {
    const c = credentialsOf(store('genai-actions-v2'))
    expect(c.state).toBe('trusted')
    expect(c.list).toBe('interim')
    expect(c.signer).toBe('Adobe Inc.')
    expect(c.generator).toBe('Adobe Firefly')
    expect(c.actions).toEqual([
      { words: 'Edited', source: 'Edited with generative AI', software: 'Adobe Firefly', description: null },
    ])
    expect(c.app).toBe('Adobe Firefly')
    // Its parent's own manifest says Firefly created it from text: made with AI, then edited.
    expect(c.claim).toBe('made')
    expect(c.ingredients).toEqual([
      { title: 'firefly-actions-v2.jpg', relationship: 'Edited from', thumbnail: expect.any(String), signed: true },
    ])
  })

  it('reads composite-dst.jpg: edited with generative AI, under a test certificate', () => {
    const c = credentialsOf(store('composite-dst'))
    expect(c.state).toBe('untrusted')
    expect(c.claim).toBe('edited')
    expect(c.time).toBe(null)
    expect(c.generator).toBe('Adobe Example 0.1')
    expect(c.actions).toEqual([
      { words: 'Edited', source: 'Edited with generative AI', software: 'Adobe Firefly', description: null },
    ])
  })

  it('reads a picture made with ChatGPT: trusted through the C2PA trust list, made with AI', () => {
    const c = credentialsOf(store('chatgpt'))
    expect(c.state).toBe('trusted')
    expect(c.list).toBe('c2pa')
    expect(c.signer).toBe('OpenAI OpCo, LLC')
    expect(c.certificate).toBe('OpenAI Media Service')
    expect(c.generator).toBe('OpenAI Media Service API')
    expect(c.app).toBe('ChatGPT')
    expect(c.claim).toBe('made')
    expect(c.actions.map((a) => a.words)).toEqual(['Created', 'Converted', 'Watermarked'])
    expect(c.problems).toEqual([])
  })

  it('reads a picture made with Gemini: trusted, made with AI, its actions described, the library’s build left out', () => {
    const c = credentialsOf(store('gemini'))
    expect(c.state).toBe('trusted')
    expect(c.list).toBe('c2pa')
    expect(c.signer).toBe('Google LLC')
    expect(c.generator).toBe('Google C2PA Core Generator Library')
    expect(c.app).toBe(null)
    expect(c.claim).toBe('made')
    expect(c.actions).toEqual([
      {
        words: 'Created',
        source: 'Made with generative AI',
        software: null,
        description: 'Created by Google Generative AI.',
      },
      {
        words: 'Edited',
        source: 'Made with generative AI',
        software: null,
        description: 'Applied imperceptible SynthID watermark.',
      },
    ])
  })

  it('says a camera took it when the picture was created from a digital capture', () => {
    const c = credentialsOf(
      fake([
        { action: 'c2pa.created', digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture' },
      ]),
    )
    expect(c.claim).toBe('capture')
    expect(c.actions[0]).toEqual({
      words: 'Created',
      source: 'Captured by a camera',
      software: null,
      description: null,
    })
  })

  it('keeps generative AI over a camera: a photo edited with AI was edited with AI', () => {
    const c = credentialsOf(
      fake([
        { action: 'c2pa.created', digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture' },
        {
          action: 'c2pa.edited',
          digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
        },
      ]),
    )
    expect(c.claim).toBe('edited')
  })

  it('takes a v2 ingredient’s own digital source type into account', () => {
    const s = fake([{ action: 'c2pa.opened' }])
    s.manifests!.m.ingredients = [
      {
        title: 'gen.png',
        relationship: 'parentOf',
        digital_source_type: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
      },
    ]
    expect(credentialsOf(s).claim).toBe('made')
  })

  it('names an action outside C2PA’s list by its label, and reads software agents given as text', () => {
    const c = credentialsOf(fake([{ action: 'com.example.sharpened', softwareAgent: 'Example 2' }]))
    expect(c.actions).toEqual([
      { words: 'com.example.sharpened', source: null, software: 'Example 2', description: null },
    ])
  })

  it('tells the C2PA trust list from the interim one', () => {
    const system = fake([], 'Trusted', 'signing certificate trusted, found in [manifest_system_anchors] trust anchors')
    expect(credentialsOf(system).list).toBe('c2pa')
    const user = fake([], 'Trusted', 'signing certificate trusted, found in [manifest_user_anchors] trust anchors')
    expect(credentialsOf(user).list).toBe('interim')
  })

  it('says why credentials don’t verify, in plain words, each once', () => {
    const s = fake([], 'Invalid')
    s.validation_results!.activeManifest!.failure = [
      { code: 'signingCredential.expired', explanation: 'certificate expired' },
      { code: 'claimSignature.mismatch' },
      { code: 'assertion.hashedURI.mismatch' },
      { code: 'assertion.hashedURI.mismatch' },
      { code: 'signingCredential.untrusted' },
      { code: 'something.else', explanation: 'the thing failed' },
    ]
    expect(credentialsOf(s).problems).toEqual([
      'The signing certificate had expired.',
      'The signature doesn’t match what it signs.',
      'Part of the manifest was changed after it was signed.',
      'The thing failed.',
    ])
  })
})

describe('trustCaption', () => {
  it('says which bundled list was used and when it was fetched', () => {
    expect(trustCaption('2026-11-25', 'c2pa')).toBe(
      'Its signer is on the C2PA trust list. Checked against the trust list bundled on 25 November 2026.',
    )
    expect(trustCaption('2026-11-25', 'interim')).toBe(
      'Its signer is on the Content Authenticity Initiative’s interim trust list, frozen in January 2026. Checked against the trust list bundled on 25 November 2026.',
    )
    expect(trustCaption('2026-11-25', null)).toBe('Checked against the trust list bundled on 25 November 2026.')
  })
})

/** A one-manifest store with these actions, valid and signed by nobody on a list unless told otherwise. */
function fake(actions: Record<string, unknown>[], state: 'Valid' | 'Trusted' | 'Invalid' = 'Valid', trusted = '') {
  return {
    active_manifest: 'm',
    manifests: {
      m: {
        claim_generator_info: [{ name: 'Camera app', version: '1.0' }],
        assertions: [{ label: 'c2pa.actions.v2', data: { actions } }],
        signature_info: { issuer: 'Leica Camera AG', common_name: 'M11', time: '2025-01-01T10:00:00+00:00' },
        ingredients: [],
      },
    },
    validation_results: {
      activeManifest: {
        success: trusted ? [{ code: 'signingCredential.trusted', explanation: trusted }] : [],
        informational: [],
        failure: [],
      },
    },
    validation_state: state,
  } as ManifestStore & { manifests: Record<string, NonNullable<ManifestStore['manifests']>[string]> }
}
