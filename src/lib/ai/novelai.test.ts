import { describe, expect, it } from 'vitest'
import { novelai } from './novelai'

// The fields of a real NovelAI Diffusion V5 picture (image to image, upscaled), trimmed.
const V5 = {
  prompt: 'masterpiece, best quality, cute',
  steps: 28,
  height: 1024,
  width: 1024,
  scale: 6.0,
  cfg_rescale: 0.4,
  seed: 4210162474,
  noise_schedule: 'karras',
  v4_prompt: {
    caption: {
      base_caption: 'masterpiece, best quality, cute',
      char_captions: [{ char_caption: 'fang, xtreme', centers: [{ x: 0.5, y: 0.5 }] }],
    },
  },
  sampler: 'k_euler_ancestral',
  strength: 0.5,
  uc: 'nsfw, lowres',
  request_type: 'Img2ImgRequest',
  upscaled_width: 1773,
  upscaled_height: 1773,
  model_name: 'NovelAI Diffusion V5',
  model_hash: '0ADF9AB7',
}

describe('novelai', () => {
  it('reads Software, Source and the Comment JSON', () => {
    const g = novelai({
      'png:software': 'NovelAI',
      'png:source': 'NovelAI Diffusion V5 0ADF9AB7',
      'png:description': 'masterpiece, best quality, cute',
      'png:generation_time': '2.6476672450080514',
      'png:comment': JSON.stringify(V5),
    })
    expect(g).toEqual({
      name: 'NovelAI',
      where: ['the PNG text chunks “Software”, “Source” and “Comment”'],
      prompt: 'masterpiece, best quality, cute',
      negative: 'nsfw, lowres',
      model: 'NovelAI Diffusion V5',
      modelHash: '0ADF9AB7',
      seed: '4210162474',
      sampler: 'k_euler_ancestral',
      steps: '28',
      cfg: '6',
      size: '1024 × 1024',
      loras: [],
      rest: [
        { label: 'Character 1', value: 'fang, xtreme' },
        { label: 'Noise schedule', value: 'karras' },
        { label: 'CFG rescale', value: '0.4' },
        { label: 'Image to image', value: 'Strength 0.5' },
        { label: 'Upscaled to', value: '1773 × 1773' },
        { label: 'Generation time', value: '2.6 s' },
      ],
      workflow: null,
    })
  })

  it('reads a 2022 picture, its model and hash from Source and its prompt from Description', () => {
    const g = novelai({
      'png:software': 'NovelAI',
      'png:source': 'Stable Diffusion 1D44365E',
      'png:description': 'masterpiece, best quality,  cat, space, icon',
      'png:comment': JSON.stringify({
        steps: 50,
        sampler: 'k_euler_ancestral',
        seed: 2253955223,
        strength: 0.4,
        scale: 10.0,
        uc: 'lowres',
      }),
    })
    expect(g).toMatchObject({
      prompt: 'masterpiece, best quality,  cat, space, icon',
      negative: 'lowres',
      model: 'Stable Diffusion',
      modelHash: '1D44365E',
      cfg: '10',
      size: null,
      rest: [],
    })
  })

  it('finds nothing without NovelAI as the Software', () => {
    expect(novelai({ 'png:comment': JSON.stringify(V5) })).toBeNull()
  })
})
