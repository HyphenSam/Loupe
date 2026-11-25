import { describe, expect, it } from 'vitest'
import type { Tag } from '../info'
import { generatorsOf, textsOf, withStealth } from './generators'

const tag = (family: string, name: string, value: string): Tag => ({ family, group: family, name, label: name, value })
const A1111 = 'a cat\nNegative prompt: a dog\nSteps: 20, Sampler: Euler, Seed: 1, Version: v1.10.1'

describe('textsOf', () => {
  it('keys each tag by its family and name in lower case, the first of a name winning', () => {
    expect(
      textsOf([tag('PNG', 'Parameters', 'one'), tag('PNG', 'Parameters', 'two'), tag('EXIF', 'UserComment', 'three')]),
    ).toEqual({ 'png:parameters': 'one', 'exif:usercomment': 'three' })
  })
})

describe('generatorsOf', () => {
  it('gives the generator whose marker the file carries', () => {
    expect(generatorsOf([tag('PNG', 'Parameters', A1111)]).map((g) => g.name)).toEqual(['AUTOMATIC1111'])
    expect(
      generatorsOf([tag('PNG', 'Prompt', '{"1": {"class_type": "KSampler", "inputs": {"steps": 2}}}')])[0].name,
    ).toBe('ComfyUI')
  })

  it('lets the more particular marker win: Fooocus’s scheme over A1111-style text, Tensor.Art over ComfyUI', () => {
    const fooocus = [tag('PNG', 'Parameters', A1111), tag('PNG', 'Fooocus_scheme', 'a1111')]
    expect(generatorsOf(fooocus).map((g) => g.name)).toEqual(['Fooocus'])
    const tensor = [tag('PNG', 'Generation_data', '{"prompt": "a cat"}'), tag('PNG', 'Prompt', '{}')]
    expect(generatorsOf(tensor).map((g) => g.name)).toEqual(['Tensor.Art'])
  })

  it('names a known generator from Software or CreatorTool when nothing else says more', () => {
    expect(generatorsOf([tag('XMP', 'CreatorTool', 'Adobe Firefly')])).toEqual([
      expect.objectContaining({ name: 'Adobe Firefly', where: ['CreatorTool “Adobe Firefly”'], prompt: null }),
    ])
    expect(generatorsOf([tag('EXIF', 'Software', 'Leonardo.Ai')])[0].name).toBe('Leonardo.Ai')
  })

  it('finds nothing in an ordinary photo’s tags', () => {
    expect(
      generatorsOf([tag('EXIF', 'Software', 'Adobe Photoshop 25.0'), tag('EXIF', 'UserComment', 'Screenshot')]),
    ).toEqual([])
  })
})

describe('withStealth', () => {
  const ALPHA = 'the lowest bits of the alpha channel'

  it('adds a generator found only in the pixels', () => {
    const [g] = withStealth([], { text: A1111, channel: 'alpha' })
    expect(g).toMatchObject({ name: 'AUTOMATIC1111', where: [ALPHA], prompt: 'a cat' })
    const [rgb] = withStealth([], { text: A1111, channel: 'rgb' })
    expect(rgb.where).toEqual(['the lowest bits of the red, green and blue channels'])
  })

  it('reads NovelAI’s JSON of its text chunks, and adds where it was to the same generator found in them', () => {
    const chunks = {
      Software: 'NovelAI',
      Source: 'NovelAI Diffusion V4.5 4BDE2A90',
      'Generation time': '3.1',
      Comment: '{"steps": 28}',
    }
    const fromChunks = generatorsOf([tag('PNG', 'Software', 'NovelAI'), tag('PNG', 'Comment', '{"steps": 28}')])
    const both = withStealth(fromChunks, { text: JSON.stringify(chunks), channel: 'alpha' })
    expect(both).toHaveLength(1)
    expect(both[0].where).toEqual(['the PNG text chunks “Software”, “Source” and “Comment”', ALPHA])
    const alone = withStealth([], { text: JSON.stringify(chunks), channel: 'alpha' })
    expect(alone[0]).toMatchObject({ name: 'NovelAI', model: 'NovelAI Diffusion V4.5', where: [ALPHA] })
    expect(alone[0].rest).toContainEqual({ label: 'Generation time', value: '3.1 s' })
  })

  it('reads SwarmUI’s JSON', () => {
    const [g] = withStealth([], { text: '{"sui_image_params": {"prompt": "a cat"}}', channel: 'alpha' })
    expect(g).toMatchObject({ name: 'SwarmUI', prompt: 'a cat' })
  })

  it('leaves the list as it was without stealth metadata, or with text no parser reads', () => {
    const found = generatorsOf([tag('PNG', 'Parameters', A1111)])
    expect(withStealth(found, null)).toBe(found)
    expect(withStealth([], { text: 'hello', channel: 'alpha' })).toEqual([])
  })
})
