import { describe, expect, it } from 'vitest'
import { fooocus } from './fooocus'

// Fooocus 2.4.3's own scheme, from sd-parsers' real sample (trimmed), with a LoRA as 2.5 writes them.
const PARAMS = {
  base_model: 'juggernautXL_v8Rundiffusion',
  base_model_hash: 'aeb7e9e689',
  guidance_scale: 4,
  loras: [['sdxl_film_photography_style.safetensors', 0.25, '1c2d3e']],
  negative_prompt: '',
  performance: 'Speed',
  prompt: 'a smiling goldfish',
  refiner_model: 'None',
  resolution: '(768, 1280)',
  sampler: 'dpmpp_2m_sde_gpu',
  scheduler: 'karras',
  seed: '6952411511246973023',
  sharpness: 2,
  steps: 30,
  styles: "['Fooocus V2', 'Fooocus Enhance', 'Fooocus Sharp']",
  version: 'Fooocus v2.4.3',
}

describe('fooocus', () => {
  it('reads its parameters JSON, marked by the fooocus_scheme chunk', () => {
    expect(fooocus({ 'png:parameters': JSON.stringify(PARAMS), 'png:fooocus_scheme': 'fooocus' })).toEqual({
      name: 'Fooocus',
      where: ['the PNG text chunks “parameters” and “fooocus_scheme”'],
      prompt: 'a smiling goldfish',
      negative: null,
      model: 'juggernautXL_v8Rundiffusion',
      modelHash: 'aeb7e9e689',
      seed: '6952411511246973023',
      sampler: 'dpmpp_2m_sde_gpu',
      steps: '30',
      cfg: '4',
      size: '768 × 1280',
      loras: [{ name: 'sdxl_film_photography_style.safetensors', weight: '0.25' }],
      rest: [
        { label: 'Styles', value: 'Fooocus V2, Fooocus Enhance, Fooocus Sharp' },
        { label: 'Performance', value: 'Speed' },
        { label: 'Scheduler', value: 'karras' },
        { label: 'Sharpness', value: '2' },
        { label: 'Version', value: 'Fooocus v2.4.3' },
      ],
      workflow: null,
    })
  })

  it('reads A1111-style text when that’s the scheme, and a JPEG’s UserComment named by Software', () => {
    const a1111 =
      'a goldfish\nNegative prompt: murky\nSteps: 30, Sampler: DPM++ 2M SDE, Seed: 1, Version: Fooocus v2.5.5'
    expect(fooocus({ 'png:parameters': a1111, 'png:fooocus_scheme': 'a1111' })).toMatchObject({
      name: 'Fooocus',
      prompt: 'a goldfish',
      negative: 'murky',
    })
    const jpeg = fooocus({ 'exif:usercomment': JSON.stringify(PARAMS), 'exif:software': 'Fooocus v2.5.5' })
    expect(jpeg).toMatchObject({ where: ['EXIF UserComment and Software'], prompt: 'a smiling goldfish' })
  })

  it('finds nothing without Fooocus’s marks', () => {
    expect(fooocus({ 'png:parameters': JSON.stringify(PARAMS) })).toBeNull()
  })
})
