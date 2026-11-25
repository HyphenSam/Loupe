import { describe, expect, it } from 'vitest'
import { tensorart } from './tensorart'

// A real Tensor.Art picture's chunks, trimmed: its own `generation_data`, and the ComfyUI graph it ran.
const GENERATION_DATA = {
  prompt: '1girl, solo, beach, ',
  negativePrompt: 'bad quality, worst quality,',
  width: 1024,
  height: 1360,
  steps: 25,
  cfgScale: 7,
  seed: '-1',
  clipSkip: 2,
  baseModel: { modelFileName: 'WAI-Nsfw-Illustrious-14', hash: 'BDB59BAC77D94AE7' },
  sdVae: 'Automatic',
  ksamplerName: 'dpmpp_2s_ancestral',
  schedule: 'sgm_uniform',
  models: [{ modelFileName: 'beach-style', weight: 0.7, type: 'LORA' }],
}
const PROMPT = {
  '10001': { class_type: 'ECHOCheckpointLoaderSimple', inputs: { ckpt_name: 'EMS-939787-EMS.safetensors' } },
  '10021': { class_type: 'EmptyLatentImage', inputs: { batch_size: 1, height: 1360, width: 1024 } },
  '10032': { class_type: 'BNK_CLIPTextEncodeAdvanced', inputs: { text: '1girl, solo, beach' } },
  '10033': { class_type: 'BNK_CLIPTextEncodeAdvanced', inputs: { text: 'bad quality, worst quality' } },
  '11002': {
    class_type: 'KSampler_A1111',
    inputs: {
      cfg: 7.0,
      latent_image: ['10021', 0],
      model: ['10001', 0],
      negative: ['10033', 0],
      positive: ['10032', 0],
      sampler_name: 'dpmpp_2s_ancestral',
      scheduler: 'sgm_uniform',
      seed: 3013050530,
      steps: 25,
    },
  },
}

describe('tensorart', () => {
  it('reads generation_data, taking the seed that ran from the graph when it says -1 (random)', () => {
    const prompt = JSON.stringify(PROMPT)
    expect(tensorart({ 'png:generation_data': JSON.stringify(GENERATION_DATA), 'png:prompt': prompt })).toEqual({
      name: 'Tensor.Art',
      where: ['the PNG text chunks “generation_data” and “prompt”'],
      prompt: '1girl, solo, beach,',
      negative: 'bad quality, worst quality,',
      model: 'WAI-Nsfw-Illustrious-14',
      modelHash: 'BDB59BAC77D94AE7',
      seed: '3013050530',
      sampler: 'dpmpp_2s_ancestral',
      steps: '25',
      cfg: '7',
      size: '1024 × 1360',
      loras: [{ name: 'beach-style', weight: '0.7' }],
      rest: [
        { label: 'Scheduler', value: 'sgm_uniform' },
        { label: 'Clip skip', value: '2' },
        { label: 'VAE', value: 'Automatic' },
      ],
      workflow: { json: prompt, nodes: 5 },
    })
  })

  it('finds nothing without generation_data', () => {
    expect(tensorart({ 'png:prompt': JSON.stringify(PROMPT) })).toBeNull()
  })
})
