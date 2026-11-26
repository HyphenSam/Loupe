import { createHash } from 'node:crypto'
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
// SPEC.md section 4's special kinds.
const KINDS = ['motion-photo.jpg', 'motion-photo.heic', 'depth.jpg', 'pano-360.jpg']
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
    for (const name of [...METADATA, ...KINDS, ...AI]) expect(generated).toContain(name)
  })

  it('has the Text tool’s rendered pictures (SPEC.md 6.12)', () => {
    for (const name of ['text-latin.png', 'text-cjk.png', 'text-vertical.png', 'text-korean.png', 'text-cyrillic.png'])
      expect(generated).toContain(name)
  })

  it('has a Motion Photo: a container directory in XMP and an MP4 at the end, with its own location', () => {
    const motion = readFileSync(join(fixtures, 'motion-photo.jpg'))
    const text = motion.toString('latin1')
    expect(text).toContain('GCamera:MotionPhoto="1"')
    expect(text).toContain('Item:Semantic="MotionPhoto"')
    const start = text.lastIndexOf('ftyp') - 4
    const length = Number(text.match(/Item:Mime="video\/mp4"[^>]*Item:Length="(\d+)"/)?.[1])
    expect(start + length).toBe(motion.length)
    expect(text.slice(start)).toContain('\xa9xyz')
  })

  it('has a HEIC Motion Photo: the same MP4, with its location, in an mpvd box, and Google’s XMP', () => {
    const heic = readFileSync(join(fixtures, 'motion-photo.heic'))
    const at = heic.indexOf('mpvd') - 4
    const video = heic.subarray(at + 8, at + heic.readUInt32BE(at))
    expect(video.length).toBeGreaterThan(1000)
    expect(readFileSync(join(fixtures, 'motion-photo.jpg')).subarray(-video.length)).toEqual(video)
    expect(heic.toString('latin1')).toMatch(/GCamera:MotionPhoto.1/)
  })

  it('has a depth map in GDepth XMP and a 360° panorama in GPano XMP', () => {
    expect(readFileSync(join(fixtures, 'depth.jpg')).toString('latin1')).toMatch(/GDepth:Mime="image\/png"/)
    expect(readFileSync(join(fixtures, 'pano-360.jpg')).toString('latin1')).toMatch(
      /GPano:ProjectionType.equirectangular/,
    )
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
  it('pins each sample to a commit or by its SHA-256, with its licence', () => {
    for (const sample of SAMPLES) {
      if (sample.sha256) {
        const hash = createHash('sha256')
          .update(readFileSync(join(fixtures, sample.path)))
          .digest('hex')
        expect(hash, sample.path).toBe(sample.sha256)
      } else expect(sample.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}\//)
      expect(sample.licence).not.toBe('')
    }
  })

  it('includes a valid manifest, one with generative AI actions and a tampered one', () => {
    const c2pa = SAMPLES.filter((s) => s.path.startsWith('c2pa/')).map((s) => s.path)
    expect(c2pa).toEqual(expect.arrayContaining(['c2pa/CA.jpg', 'c2pa/genai-actions-v2.jpg', 'c2pa/XCA.jpg']))
  })
})
