import { describe, expect, it } from 'vitest'
import { midjourney } from './midjourney'

describe('midjourney', () => {
  it('reads the PNG Description chunk: the prompt, its parameters and the Job ID, and the Author', () => {
    expect(
      midjourney({
        'png:description':
          'Bolognese spaghetti, food photography --ar 3:2 --no garnish --seed 42 --style raw --v 6 Job ID: dc948a90-42b7-4439-a508-e05758d02e22',
        'png:author': 'cringeshifter',
      }),
    ).toEqual({
      name: 'Midjourney',
      where: ['the PNG text chunks “Description” and “Author”'],
      prompt: 'Bolognese spaghetti, food photography',
      negative: 'garnish',
      model: 'Midjourney 6',
      modelHash: null,
      seed: '42',
      sampler: null,
      steps: null,
      cfg: null,
      size: null,
      loras: [],
      rest: [
        { label: 'Aspect ratio', value: '3:2' },
        { label: 'Style', value: 'raw' },
        { label: 'Parameters', value: '--ar 3:2 --no garnish --seed 42 --style raw --v 6' },
        { label: 'Job ID', value: 'dc948a90-42b7-4439-a508-e05758d02e22' },
        { label: 'Account', value: 'cringeshifter' },
      ],
      workflow: null,
    })
  })

  it('names Niji, and reads XMP’s description where there’s no PNG chunk', () => {
    const g = midjourney({ 'xmp:description': 'a cat --niji 6 Job ID: 0b0a5c1e-0000-4000-8000-000000000000' })
    expect(g).toMatchObject({ where: ['XMP description'], prompt: 'a cat', model: 'Niji 6' })
  })

  it('finds nothing in a description without a Job ID', () => {
    expect(midjourney({ 'png:description': 'Holiday at the beach' })).toBeNull()
  })
})
