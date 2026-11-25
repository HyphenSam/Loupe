import { describe, expect, it } from 'vitest'
import { comfyui, nodeCount } from './comfyui'

// Shaped like a real Anima workflow: a text-to-image subgraph (60:…) with a LoRA, then a second low-denoise
// pass at 0.5× (96:…).
const ANIMA = {
  '46': { inputs: { filename_prefix: 'Anima', images: ['60:8', 0] }, class_type: 'SaveImage' },
  '96:71': { inputs: { text: '', clip: ['96:62', 0] }, class_type: 'CLIPTextEncode' },
  '96:66': { inputs: { unet_name: 'animayume_v05.safetensors' }, class_type: 'UNETLoader' },
  '96:62': { inputs: { clip_name: 'qwen_3_06b_base.safetensors', type: 'lumina2' }, class_type: 'CLIPLoader' },
  '96:67': { inputs: { text: 'masterpiece, 8k', clip: ['96:62', 0] }, class_type: 'CLIPTextEncode' },
  '96:80': { inputs: { pixels: ['60:8', 0], vae: ['60:15', 0] }, class_type: 'VAEEncode' },
  '96:69': {
    inputs: {
      seed: 1111900383257905,
      steps: 5,
      cfg: 1,
      sampler_name: 'dpmpp_2m_sde',
      scheduler: 'beta',
      denoise: 0.33,
      model: ['96:66', 0],
      positive: ['96:67', 0],
      negative: ['96:71', 0],
      latent_image: ['96:80', 0],
    },
    class_type: 'KSampler',
  },
  '60:45': { inputs: { clip_name: 'qwen_3_06b_base.safetensors', type: 'stable_diffusion' }, class_type: 'CLIPLoader' },
  '60:15': { inputs: { vae_name: 'qwen_image_vae.safetensors' }, class_type: 'VAELoader' },
  '60:8': { inputs: { samples: ['60:19', 0], vae: ['60:15', 0] }, class_type: 'VAEDecode' },
  '60:28': { inputs: { width: 1024, height: 1536, batch_size: 1 }, class_type: 'EmptyLatentImage' },
  '60:12': { inputs: { text: 'worst quality, blurry', clip: ['60:45', 0] }, class_type: 'CLIPTextEncode' },
  '60:11': {
    inputs: { text: '@BlueArchStyle\n1girl, solo,\ncoffee in a cafe', clip: ['60:45', 0] },
    class_type: 'CLIPTextEncode',
  },
  '60:44': { inputs: { unet_name: 'animayume_v05.safetensors', weight_dtype: 'default' }, class_type: 'UNETLoader' },
  '60:19': {
    inputs: {
      seed: 369507617469248,
      steps: 30,
      cfg: 5.0,
      sampler_name: 'er_sde',
      scheduler: 'simple',
      denoise: 1.0,
      model: ['60:99', 0],
      positive: ['60:11', 0],
      negative: ['60:12', 0],
      latent_image: ['60:28', 0],
    },
    class_type: 'KSampler',
  },
  '60:99': {
    inputs: { lora_name: 'BlueArchiveStyleB1.safetensors', strength_model: 1.0, model: ['60:44', 0] },
    class_type: 'LoraLoaderModelOnly',
  },
}

// A workflow whose top level holds two notes, a Save Image and two subgraphs (9 and 13 nodes inside).
const WORKFLOW = {
  nodes: [{ type: 'MarkdownNote' }, { type: 'Note' }, { type: 'sub-a' }, { type: 'SaveImage' }, { type: 'sub-b' }],
  definitions: {
    subgraphs: [
      { id: 'sub-a', nodes: Array.from({ length: 9 }, () => ({ type: 'KSampler' })) },
      { id: 'sub-b', nodes: Array.from({ length: 13 }, () => ({ type: 'KSampler' })) },
    ],
  },
}

// Flux through the custom sampler: the settings sit on the nodes feeding it, the prompt behind FluxGuidance,
// and a string primitive holds the text.
const FLUX = {
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'flux1-dev.safetensors' } },
  '2': { class_type: 'LoraLoader', inputs: { lora_name: 'detail.safetensors', strength_model: 0.8, model: ['1', 0] } },
  '3': { class_type: 'PrimitiveString', inputs: { value: 'a red fox in snow' } },
  '4': { class_type: 'CLIPTextEncode', inputs: { text: ['3', 0], clip: ['9', 0] } },
  '5': { class_type: 'FluxGuidance', inputs: { guidance: 3.5, conditioning: ['4', 0] } },
  '6': { class_type: 'BasicGuider', inputs: { model: ['2', 0], conditioning: ['5', 0] } },
  '7': { class_type: 'RandomNoise', inputs: { noise_seed: 18446744073709551615 } },
  '8': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
  '9': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 't5xxl.safetensors', clip_name2: 'clip_l.safetensors' } },
  '10': { class_type: 'BasicScheduler', inputs: { scheduler: 'simple', steps: 20, denoise: 1, model: ['2', 0] } },
  '11': { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 768, batch_size: 1 } },
  '12': {
    class_type: 'SamplerCustomAdvanced',
    inputs: { noise: ['7', 0], guider: ['6', 0], sampler: ['8', 0], sigmas: ['10', 0], latent_image: ['11', 0] },
  },
}

describe('comfyui', () => {
  it('reads the first pass of a two-pass graph: its prompts, model, LoRA, settings and size', () => {
    const g = comfyui({ 'png:prompt': JSON.stringify(ANIMA), 'png:workflow': JSON.stringify(WORKFLOW) })!
    expect(g).toMatchObject({
      name: 'ComfyUI',
      where: ['the PNG text chunks “prompt” and “workflow”'],
      prompt: '@BlueArchStyle\n1girl, solo,\ncoffee in a cafe',
      negative: 'worst quality, blurry',
      model: 'animayume_v05.safetensors',
      modelHash: null,
      seed: '369507617469248',
      sampler: 'er_sde',
      steps: '30',
      cfg: '5',
      size: '1024 × 1536',
      loras: [{ name: 'BlueArchiveStyleB1.safetensors', weight: '1' }],
    })
    expect(g.rest).toEqual([
      { label: 'Scheduler', value: 'simple' },
      { label: 'VAE', value: 'qwen_image_vae.safetensors' },
      { label: 'Another pass', value: '5 steps, dpmpp_2m_sde, CFG 1, denoise 0.33' },
    ])
  })

  it('keeps the workflow to save, counting the nodes inside its subgraphs', () => {
    const workflow = JSON.stringify(WORKFLOW)
    expect(comfyui({ 'png:prompt': JSON.stringify(ANIMA), 'png:workflow': workflow })?.workflow).toEqual({
      json: workflow,
      nodes: 25,
    })
    expect(nodeCount(WORKFLOW)).toBe(25)
  })

  it('without a workflow, keeps the prompt graph to save instead', () => {
    const prompt = JSON.stringify(ANIMA)
    expect(comfyui({ 'png:prompt': prompt })?.workflow).toEqual({ json: prompt, nodes: 16 })
  })

  it('follows the custom sampler’s inputs, a guider and a string primitive, keeping a 64-bit seed exact', () => {
    const g = comfyui({ 'png:prompt': JSON.stringify(FLUX).replace('18446744073709552000', '18446744073709551615') })!
    expect(g).toMatchObject({
      prompt: 'a red fox in snow',
      negative: null,
      model: 'flux1-dev.safetensors',
      seed: '18446744073709551615',
      sampler: 'euler',
      steps: '20',
      size: '1024 × 768',
      loras: [{ name: 'detail.safetensors', weight: '0.8' }],
    })
    expect(g.rest).toContainEqual({ label: 'Guidance', value: '3.5' })
  })

  it('reads a WebP’s EXIF Model and Make, as ComfyUI writes them', () => {
    const g = comfyui({
      'exif:model': `prompt:${JSON.stringify(ANIMA)}`,
      'exif:make': `workflow:${JSON.stringify(WORKFLOW)}`,
    })!
    expect(g).toMatchObject({ where: ['EXIF Model and Make (“prompt:” and “workflow:”)'], seed: '369507617469248' })
    expect(g.workflow?.nodes).toBe(25)
  })

  it('takes the settings from A1111-style parameters beside the graph, as saver nodes write them', () => {
    const g = comfyui({
      'png:prompt': JSON.stringify(ANIMA),
      'png:parameters': 'a cat\nNegative prompt: a dog\nSteps: 12, Sampler: Euler, Seed: 7, Model: sdxl',
    })!
    expect(g).toMatchObject({ name: 'ComfyUI', prompt: 'a cat', negative: 'a dog', steps: '12', model: 'sdxl' })
    expect(g.workflow?.nodes).toBe(16)
  })

  it('finds nothing without a graph', () => {
    expect(comfyui({ 'png:prompt': 'a cat' })).toBeNull()
    expect(comfyui({ 'exif:model': 'Canon EOS R5' })).toBeNull()
  })
})
