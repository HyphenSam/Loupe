import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAMPLES, sourcesMarkdown } from './samples.ts'

const fixtures = join(import.meta.dirname, '..', 'fixtures')
const generated = readdirSync(fixtures, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== 'SOURCES.md')
  .map((entry) => entry.name)

// SPEC.md section 12.
const BASES = ['png-16-alpha.png', 'lossy.webp', 'lossless.webp', 'photo.avif', 'photo.jxl', 'lossless.jxl']
const MORE = ['anim.gif', 'picture.bmp', 'photo.heic', 'scan.tif', 'grid-444.jpg', 'grid-420.jpg', 'ultra-hdr.jpg']
const ODD = ['trailer-zip.jpg', 'misnamed.png', 'notimage.txt']
const METADATA = ['camera.jpg', 'cropped-thumb.jpg', 'orient-6.jpg', 'screenshot.png', 'iptc-ai.jpg']
// SPEC.md 6.3's generators, one file per marker (Fooocus and InvokeAI's older variants are public samples).
const AI = [
  'a1111.png',
  'a1111.jpg',
  'comfyui.png',
  'comfyui.webp',
  'novelai.png',
  'stealth.png',
  'invokeai.png',
  'swarmui.png',
  'midjourney.png',
  'drawthings.png',
  'tensorart.png',
]

describe('fixtures/', () => {
  it('has every generated file SPEC.md section 12 lists that needs neither ExifTool nor the C2PA SDK', () => {
    for (const name of [...BASES, ...MORE, ...ODD]) expect(generated).toContain(name)
  })

  it('has the files written with metadata', () => {
    for (const name of [...METADATA, ...AI]) expect(generated).toContain(name)
  })

  it('keeps generated files under 300 kB', () => {
    for (const name of generated) expect(statSync(join(fixtures, name)).size, name).toBeLessThan(300_000)
  })

  it('has every public sample, each under 1 MB, in a folder of its own', () => {
    for (const sample of SAMPLES) {
      expect(sample.path).toMatch(/^[\w-]+\/[^/]+$/)
      expect(statSync(join(fixtures, sample.path)).size, sample.path).toBeLessThan(1_000_000)
    }
  })

  it('has every sample folder file listed in SOURCES.md, as the script writes it', () => {
    const folders = readdirSync(fixtures, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    const listed = new Set(SAMPLES.map((s) => s.path))
    for (const folder of folders)
      for (const name of readdirSync(join(fixtures, folder.name))) expect(listed).toContain(`${folder.name}/${name}`)
    expect(readFileSync(join(fixtures, 'SOURCES.md'), 'utf8')).toBe(sourcesMarkdown())
  })
})

it('has an Ultra HDR JPEG: a gain map in MPF, described in hdrgm XMP and ISO 21496-1', () => {
  const uhdr = readFileSync(join(fixtures, 'ultra-hdr.jpg')).toString('latin1')
  expect(uhdr).toContain('MPF')
  expect(uhdr).toContain('hdrgm:Version')
  expect(uhdr).toContain('urn:iso:std:iso:ts:21496')
})

describe('SAMPLES', () => {
  it('pins each sample to a commit, with its licence', () => {
    for (const sample of SAMPLES) {
      expect(sample.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}\//)
      expect(sample.licence).not.toBe('')
    }
  })

  it('includes a valid manifest, one with generative AI actions and a tampered one', () => {
    const c2pa = SAMPLES.filter((s) => s.path.startsWith('c2pa/')).map((s) => s.path)
    expect(c2pa).toEqual(expect.arrayContaining(['c2pa/CA.jpg', 'c2pa/genai-actions-v2.jpg', 'c2pa/XCA.jpg']))
  })
})
