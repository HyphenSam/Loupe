import { describe, expect, it } from 'vitest'
import { swarmui } from './swarmui'

// SwarmUI's documented example (docs/Image Metadata Format.md), with LoRAs added.
const EXAMPLE = {
  sui_image_params: {
    prompt: 'a photo of a cat',
    model: 'OfficialStableDiffusion/sd_xl_base_1.0',
    seed: 1,
    steps: 20,
    cfgscale: 7.0,
    aspectratio: '1:1',
    width: 1024,
    height: 1024,
    sampler: 'euler',
    scheduler: 'karras',
    loras: ['pixel-art', 'film'],
    loraweights: ['0.8', '1'],
    automaticvae: true,
    negativeprompt: '',
    swarm_version: '0.9.3.1',
  },
  sui_extra_data: { date: '2025-01-25', prep_time: '6.11 sec', generation_time: '4.84 sec' },
  sui_models: [
    {
      name: 'OfficialStableDiffusion/sd_xl_base_1.0.safetensors',
      param: 'model',
      hash: '0xd7a9105a900fd52748f20725fe52fe52b507fd36bee4fc107b1550a26e6ee1d7',
    },
  ],
}

describe('swarmui', () => {
  it('reads sui_image_params from the parameters chunk, the model’s hash from sui_models', () => {
    expect(swarmui({ 'png:parameters': JSON.stringify(EXAMPLE, null, 2) })).toEqual({
      name: 'SwarmUI',
      where: ['the PNG text chunk “parameters”'],
      prompt: 'a photo of a cat',
      negative: null,
      model: 'OfficialStableDiffusion/sd_xl_base_1.0',
      modelHash: '0xd7a9105a900fd52748f20725fe52fe52b507fd36bee4fc107b1550a26e6ee1d7',
      seed: '1',
      sampler: 'euler',
      steps: '20',
      cfg: '7',
      size: '1024 × 1024',
      loras: [
        { name: 'pixel-art', weight: '0.8' },
        { name: 'film', weight: '1' },
      ],
      rest: [
        { label: 'Scheduler', value: 'karras' },
        { label: 'Aspect ratio', value: '1:1' },
        { label: 'automaticvae', value: 'true' },
        { label: 'Version', value: '0.9.3.1' },
        { label: 'Generation time', value: '4.84 sec' },
      ],
      workflow: null,
    })
  })

  it('reads EXIF UserComment in a JPEG, and LoRAs as a comma-separated list', () => {
    const params = { prompt: 'a dog', loras: 'a,b', loraweights: '0.5,0.6' }
    const g = swarmui({ 'exif:usercomment': JSON.stringify({ sui_image_params: params }) })
    expect(g).toMatchObject({
      where: ['EXIF UserComment'],
      prompt: 'a dog',
      loras: [
        { name: 'a', weight: '0.5' },
        { name: 'b', weight: '0.6' },
      ],
    })
  })

  it('finds nothing in other JSON', () => {
    expect(swarmui({ 'png:parameters': '{"prompt": "a cat"}' })).toBeNull()
  })
})
