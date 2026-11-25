import { describe, expect, it } from 'vitest'
import { invokeai } from './invokeai'

describe('invokeai', () => {
  it('reads invokeai_metadata (InvokeAI 4 and later): model with hash, LoRAs, scheduler', () => {
    const g = invokeai({
      'png:invokeai_metadata': JSON.stringify({
        app_version: '5.6.0',
        generation_mode: 'sdxl_txt2img',
        positive_prompt: 'a castle on a hill',
        negative_prompt: 'blurry',
        width: 1024,
        height: 1024,
        seed: 3293022630,
        cfg_scale: 7.5,
        steps: 30,
        scheduler: 'dpmpp_2m_k',
        model: { name: 'Juggernaut XL v9', hash: 'blake3:0a1b2c', base: 'sdxl' },
        loras: [{ model: { name: 'Pixel Art XL' }, weight: 0.75 }],
        vae: { name: 'sdxl-vae-fp16-fix' },
      }),
    })
    expect(g).toEqual({
      name: 'InvokeAI',
      where: ['the PNG text chunk “invokeai_metadata”'],
      prompt: 'a castle on a hill',
      negative: 'blurry',
      model: 'Juggernaut XL v9',
      modelHash: 'blake3:0a1b2c',
      seed: '3293022630',
      sampler: 'dpmpp_2m_k',
      steps: '30',
      cfg: '7.5',
      size: '1024 × 1024',
      loras: [{ name: 'Pixel Art XL', weight: '0.75' }],
      rest: [
        { label: 'Mode', value: 'sdxl_txt2img' },
        { label: 'VAE', value: 'sdxl-vae-fp16-fix' },
        { label: 'Version', value: '5.6.0' },
      ],
      workflow: null,
    })
  })

  it('reads InvokeAI 3’s model_name', () => {
    const g = invokeai({
      'png:invokeai_metadata': JSON.stringify({
        positive_prompt: 'oil painting',
        model: { model_name: 'juggernautXL' },
      }),
    })
    expect(g?.model).toBe('juggernautXL')
  })

  it('reads sd-metadata (InvokeAI 2)', () => {
    const g = invokeai({
      'png:sd-metadata': JSON.stringify({
        model_weights: 'deliberateForInvoke_v08',
        model_hash: '56d1442a',
        app_version: '2.3.0',
        image: {
          prompt: [{ prompt: 'portrait of a woman [blurry]', weight: 1.0 }],
          steps: 50,
          cfg_scale: 5,
          height: 768,
          width: 512,
          seed: 2980747362,
          sampler: 'k_lms',
        },
      }),
      'png:dream': '"portrait of a woman [blurry]" -s 50 -S 2980747362',
    })
    expect(g).toMatchObject({
      where: ['the PNG text chunk “sd-metadata”'],
      prompt: 'portrait of a woman [blurry]',
      model: 'deliberateForInvoke_v08',
      modelHash: '56d1442a',
      seed: '2980747362',
      sampler: 'k_lms',
      steps: '50',
      cfg: '5',
      size: '512 × 768',
      rest: [{ label: 'Version', value: '2.3.0' }],
    })
  })

  it('reads a Dream command line (early InvokeAI)', () => {
    const g = invokeai({ 'png:dream': '"a fox, [ugly]" -s 50 -S 2980747362 -W 512 -H 768 -C 5 -A k_lms -G 0.9' })
    expect(g).toMatchObject({
      where: ['the PNG text chunk “Dream”'],
      prompt: 'a fox, [ugly]',
      seed: '2980747362',
      sampler: 'k_lms',
      steps: '50',
      cfg: '5',
      size: '512 × 768',
      rest: [{ label: 'Command', value: '"a fox, [ugly]" -s 50 -S 2980747362 -W 512 -H 768 -C 5 -A k_lms -G 0.9' }],
    })
  })

  it('finds nothing without its chunks', () => {
    expect(invokeai({ 'png:parameters': 'a cat\nSteps: 20' })).toBeNull()
  })
})
