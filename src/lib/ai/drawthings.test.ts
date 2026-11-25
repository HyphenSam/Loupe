import { describe, expect, it } from 'vitest'
import { drawthings } from './drawthings'

// Draw Things' JSON as SD Prompt Reader reads it: c, uc, seed, steps, scale, sampler, model and size.
const SETTINGS = {
  c: 'a koi pond, watercolour',
  uc: 'text',
  seed: 1234,
  steps: 20,
  scale: 4.5,
  sampler: 'DPM++ 2M Karras',
  model: 'sd_xl_base_1.0_f16.ckpt',
  size: '1024x768',
  strength: 1,
  lora: [{ file: 'koi_v1_lora_f16.ckpt', weight: 0.6 }],
  shift: 1,
}

describe('drawthings', () => {
  it('reads XMP UserComment’s JSON, marked by Draw Things as the CreatorTool', () => {
    expect(drawthings({ 'xmp:usercomment': JSON.stringify(SETTINGS), 'xmp:creatortool': 'Draw Things' })).toEqual({
      name: 'Draw Things',
      where: ['XMP UserComment and CreatorTool'],
      prompt: 'a koi pond, watercolour',
      negative: 'text',
      model: 'sd_xl_base_1.0_f16.ckpt',
      modelHash: null,
      seed: '1234',
      sampler: 'DPM++ 2M Karras',
      steps: '20',
      cfg: '4.5',
      size: '1024 × 768',
      loras: [{ name: 'koi_v1_lora_f16.ckpt', weight: '0.6' }],
      rest: [
        { label: 'Strength', value: '1' },
        { label: 'Shift', value: '1' },
      ],
      workflow: null,
    })
  })

  it('finds nothing without Draw Things as the CreatorTool', () => {
    expect(drawthings({ 'xmp:usercomment': JSON.stringify(SETTINGS) })).toBeNull()
  })
})
