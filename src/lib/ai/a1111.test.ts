import { describe, expect, it } from 'vitest'
import { a1111, parseParameters } from './a1111'

// Forge's text as it writes it (two LoRAs, a hires pass), and sd-parsers' real A1111 sample, which predates
// the Version field.
const FORGE = [
  'a lighthouse at dusk, <lora:film_grain:0.6>, <lora:Coastal Style:1>',
  'with fog',
  'Negative prompt: blurry,',
  'lowres',
  'Steps: 28, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 6.5, Seed: 3141592653, Size: 832x1216, ' +
    'Model hash: 6ce0161689, Model: juggernautXL_v9, Denoising strength: 0.4, Hires upscale: 1.5, ' +
    'Lora hashes: "film_grain: 1a2b3c4d5e6f, Coastal Style: 0f9e8d7c6b5a", Version: f2.0.1v1.10.1-previous-313-g8a042934',
].join('\n')
const DUCK =
  'photo of a duck\nNegative prompt: monochrome\nSteps: 15, Sampler: UniPC, CFG scale: 5, Seed: 235284042, ' +
  'Size: 512x400, Model hash: c0d1994c73, Model: realistic_realisticVisionV20_v20'

describe('parseParameters', () => {
  it('splits the prompt, the negative prompt and the settings line, each prompt keeping its lines', () => {
    const p = parseParameters(FORGE)!
    expect(p.prompt).toBe('a lighthouse at dusk, <lora:film_grain:0.6>, <lora:Coastal Style:1>\nwith fog')
    expect(p.negative).toBe('blurry,\nlowres')
    expect(p.settings).toContainEqual(['Lora hashes', 'film_grain: 1a2b3c4d5e6f, Coastal Style: 0f9e8d7c6b5a'])
    expect(p.settings[0]).toEqual(['Steps', '28'])
  })

  it('reads a prompt with no negative prompt, and refuses text without a settings line', () => {
    expect(parseParameters('a cat\nSteps: 20, Seed: 1')).toEqual({
      prompt: 'a cat',
      negative: null,
      settings: [
        ['Steps', '20'],
        ['Seed', '1'],
      ],
    })
    expect(parseParameters('Screenshot')).toBeNull()
    expect(parseParameters('{"sui_image_params": {}}')).toBeNull()
  })
})

describe('a1111', () => {
  it('reads Forge’s parameters chunk, naming the front end from Version', () => {
    expect(a1111({ 'png:parameters': FORGE })).toEqual({
      name: 'Forge',
      where: ['the PNG text chunk “parameters”'],
      prompt: 'a lighthouse at dusk, <lora:film_grain:0.6>, <lora:Coastal Style:1>\nwith fog',
      negative: 'blurry,\nlowres',
      model: 'juggernautXL_v9',
      modelHash: '6ce0161689',
      seed: '3141592653',
      sampler: 'DPM++ 2M',
      steps: '28',
      cfg: '6.5',
      size: '832 × 1216',
      loras: [
        { name: 'film_grain', weight: '0.6' },
        { name: 'Coastal Style', weight: '1' },
      ],
      rest: [
        { label: 'Schedule type', value: 'Karras' },
        { label: 'Denoising strength', value: '0.4' },
        { label: 'Hires upscale', value: '1.5' },
        { label: 'Lora hashes', value: 'film_grain: 1a2b3c4d5e6f, Coastal Style: 0f9e8d7c6b5a' },
        { label: 'Version', value: 'f2.0.1v1.10.1-previous-313-g8a042934' },
      ],
      workflow: null,
    })
  })

  it('reads EXIF UserComment in a JPEG or WebP, and calls it AUTOMATIC1111 without a Version', () => {
    const g = a1111({ 'exif:usercomment': DUCK })!
    expect(g).toMatchObject({ name: 'AUTOMATIC1111', where: ['EXIF UserComment'], prompt: 'photo of a duck' })
    expect(g).toMatchObject({ negative: 'monochrome', size: '512 × 400', model: 'realistic_realisticVisionV20_v20' })
  })

  it('names A1111 by its version, and SD.Next by its App field', () => {
    const version = (v: string) => a1111({ 'png:parameters': `a cat\nSteps: 20, Version: ${v}` })?.name
    expect(version('v1.10.1')).toBe('AUTOMATIC1111')
    expect(version('neo')).toBe('Forge')
    expect(a1111({ 'png:parameters': 'a cat\nSteps: 20, App: SD.Next, Version: 7f4ce2a' })?.name).toBe('SD.Next')
  })

  it('finds nothing in other text', () => {
    expect(a1111({ 'exif:usercomment': 'Screenshot' })).toBeNull()
    expect(a1111({})).toBeNull()
  })
})
