// Privacy end to end in Node: every fixture ExifTool can write, cleaned with Everything and with Location only
// through the real planner and ExifTool, then read back.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sniff } from '@/lib/formats'
import type { ImageInfo } from '@/lib/info'
import { planPrivacy, quickPick, type QuickPick } from '@/lib/plans/privacy'
import { EVERYTHING_ARGS, leftAfter, privacyFindings } from '@/lib/privacy'
import { blank } from '@/lib/motion'
import { toImageInfo } from '@/lib/tags'
import { readTags, restart } from './exiftool'
import { imageData } from './image-data'
import { FIXTURES, fixture, useNodeExifTool } from './node'
import { run } from './run'

beforeAll(useNodeExifTool)
// Each test makes three calls; a fresh Perl instance keeps them quick.
afterEach(restart)
vi.setConfig({ testTimeout: 60_000 })

const files = ['', 'exiftool', 'c2pa', 'sd-parsers'].flatMap((dir) =>
  readdirSync(join(FIXTURES, dir))
    .map((name) => (dir ? `${dir}/${name}` : name))
    .filter((name) => statSync(join(FIXTURES, name)).isFile() && /\.(?!md$|txt$)\w+$/.test(name)),
)

async function open(name: string, bytes = fixture(name)): Promise<ImageInfo> {
  const file = { name: name.split('/').at(-1)!, size: bytes.length, lastModified: 0 }
  return toImageInfo(await readTags(file.name, bytes), file, sniff(bytes), bytes)!
}

const tagsOf = (info: ImageInfo, family: string) => info.tags.filter((t) => t.family === family)

/** Cleans a fixture with a quick pick, as the tool would, and reads the result back. */
async function clean(name: string, pick: QuickPick) {
  const bytes = fixture(name)
  const before = await open(name, bytes)
  const findings = privacyFindings(before, null)
  const ticked = quickPick(findings, pick)
  const planned = planPrivacy(before, findings, ticked)
  if (!planned.plan) return { before, planned, ticked }
  const result = await run(planned.plan, bytes)
  const out = new Uint8Array(await result.blob.arrayBuffer())
  return { before, planned, ticked, out, after: result.info! }
}

/** What every clean keeps: the picture's bytes, its orientation and its colour profile. */
function expectKept(name: string, before: ImageInfo, after: ImageInfo, bytes: Uint8Array, out: Uint8Array) {
  expect(after.format).toBe(before.format)
  expect([after.width, after.height]).toEqual([before.width, before.height])
  expect(after.orientation).toBe(before.orientation)
  expect(after.colour.profile).toBe(before.colour.profile)
  // Raw files built on TIFF give IFD0's strips (often their thumbnail); the rest give nothing to compare.
  const data = imageData(bytes)
  if (data) {
    expect(data.length, name).toBeGreaterThan(0)
    expect(imageData(out), name).toEqual(data)
  } else expect(before.format, name).toBe('raw')
}

describe('Privacy’s Everything', () => {
  it.each(files)('%s', async (name) => {
    const { before, planned, ticked, out, after } = await clean(name, 'everything')
    if (before.format === 'bmp') return expect(planned.problems).toEqual(['Loupe can’t change metadata in a BMP file.'])
    if (!ticked.length) return expect(privacyFindings(before, null)).toEqual([])
    // A raw file whose findings are all in its maker notes keeps them, and says so.
    if (!planned.plan) return expect(planned.problems[0], name).toMatch(/maker notes/)
    expectKept(name, before, after!, fixture(name), out!)

    const left = leftAfter(ticked, before, after!)
    if (before.format === 'raw' || before.format === 'tiff') {
      // Only what the maker notes hold may stay; the rest is gone.
      for (const line of left) expect(line, name).toMatch(/maker notes/)
      expect(planned.plan!.args).not.toEqual(EVERYTHING_ARGS)
      return
    }
    // Hidden data and Samsung's trailer alone are cut out by Loupe; ExifTool runs only for metadata.
    const cutOnly = privacyFindings(before, null).every((f) => f.cut || !ticked.includes(f.id))
    expect(planned.plan!.args).toEqual(cutOnly ? [] : EVERYTHING_ARGS)
    expect(
      left.filter((line) => !/in the picture’s pixels/.test(line)),
      name,
    ).toEqual([])
    expect(privacyFindings(after!, null), name).toEqual([])
    for (const family of ['XMP', 'IPTC', 'MakerNotes', 'JUMBF', 'MPF'])
      expect(
        tagsOf(after!, family).filter((t) => t.group !== 'XMP-x'),
        `${name} ${family}`,
      ).toEqual([])
    // What EXIF keeps describes the stored picture.
    const layout = ['Orientation', 'YCbCrPositioning', 'XResolution', 'YResolution', 'ResolutionUnit']
    expect(
      tagsOf(after!, 'EXIF').filter((t) => !layout.includes(t.name)),
      `${name} EXIF`,
    ).toEqual([])
  })

  // Neither has anything to find, so the arguments run directly.
  const wipe = (name: string, exifName: string) =>
    run({ kind: 'metadata', name, type: 'image/jpeg', exifName, args: EVERYTHING_ARGS, readBack: true }, fixture(name))

  it('keeps a turned picture turned', async () => {
    expect((await wipe('orient-6.jpg', 'image.jpg')).info!.orientation).toBe(6)
  })

  it('keeps a wide-gamut picture’s profile, and drops an Ultra HDR gain map', async () => {
    const { info } = await wipe('ultra-hdr.jpg', 'image.jpg')
    expect(info!.colour.profile).toBe('Display P3 Gamut with sRGB Transfer')
    expect(info!.embedded.some((e) => e.kind === 'gain-map')).toBe(false)
  })

  it('removes Content Credentials', async () => {
    const { after } = await clean('c2pa/CA.jpg', 'everything')
    expect(after!.embedded.some((e) => e.kind === 'c2pa-manifest')).toBe(false)
  })

  it('says stealth metadata stays in the pixels', async () => {
    const before = await open('sd-parsers/automatic1111_stealth.png')
    expect(
      leftAfter(
        [],
        { ...before, generators: [{ ...before.generators[0], where: ['the lowest bits of the alpha channel'] }] },
        before,
      ),
    ).toHaveLength(1)
  })
})

describe('Privacy’s hidden data', () => {
  it('cuts the ZIP out of trailer-zip.jpg, leaving the picture’s bytes as they were', async () => {
    const bytes = fixture('trailer-zip.jpg')
    const before = await open('trailer-zip.jpg', bytes)
    const findings = privacyFindings(before, null)
    expect(findings.map((f) => f.id)).toEqual(['hidden'])
    const result = await run(planPrivacy(before, findings, ['hidden']).plan!, bytes)
    const out = new Uint8Array(await result.blob.arrayBuffer())
    expect(imageData(out)).toEqual(imageData(bytes))
    expect(out).toEqual(fixture('grid-420.jpg'))
    expect(result.info!.trailer).toBe(null)
    expect(leftAfter(['hidden'], before, result.info!)).toEqual([])
  })
})

describe('Privacy and Samsung Gallery’s edit data', () => {
  it('cuts Samsung’s trailer off samsung-edit.png, leaving the PNG as it was before Gallery added it', async () => {
    const bytes = fixture('samsung-edit.png')
    const before = await open('samsung-edit.png', bytes)
    const findings = privacyFindings(before, null)
    expect(findings.map((f) => f.id)).toEqual(['samsung-edits'])
    const result = await run(planPrivacy(before, findings, ['samsung-edits']).plan!, bytes)
    const out = new Uint8Array(await result.blob.arrayBuffer())
    expect(out).toEqual(bytes.subarray(0, before.samsung!.offset))
    expect(result.info!.samsung).toBe(null)
    expect(result.info!.tags.filter((t) => t.group === 'Samsung')).toEqual([])
    expect(leftAfter(['samsung-edits'], before, result.info!)).toEqual([])
  })
})

describe('Privacy’s Location only', () => {
  const located = ['camera.jpg', 'cropped-thumb.jpg', 'exiftool/Apple.jpg', 'exiftool/GoPro.jpg']

  it.each(located)('%s loses its location and keeps the rest', async (name) => {
    const { before, ticked, out, after } = await clean(name, 'location')
    expect(ticked, name).toContain('gps')
    expectKept(name, before, after!, fixture(name), out!)
    expect(after!.gps).toBe(null)
    expect(leftAfter(ticked, before, after!)).toEqual([])
    const ids = (info: ImageInfo) => privacyFindings(info, null).map((f) => f.id)
    expect(ids(after!)).toEqual(ids(before).filter((id) => !ticked.includes(id)))
    expect(after!.camera?.model).toBe(before.camera?.model)
  })

  it('leaves alone a file with no location', async () => {
    const { ticked, planned } = await clean('grid-420.jpg', 'location')
    expect(ticked).toEqual([])
    expect(planned.plan).toBe(null)
  })
})

describe('Privacy and a Motion Photo’s video (SPEC.md 6.4)', () => {
  it('blanks the video’s own location in place, leaving every other byte as it was', async () => {
    const bytes = fixture('motion-photo.jpg')
    const { before, ticked, out, after } = await clean('motion-photo.jpg', 'location')
    expect(ticked).toEqual(['motion-location'])
    const [box] = before.motion!.location!.boxes
    expect(out!.length).toBe(bytes.length)
    expect(out!.subarray(0, box.offset)).toEqual(bytes.subarray(0, box.offset))
    expect(out!.subarray(box.offset + box.length)).toEqual(bytes.subarray(box.offset + box.length))
    // The video is still where the container directory says, as long, and runs as long; it has no location.
    expect(after!.motion).toEqual({ ...before.motion, location: null })
    expect(after!.embedded.find((e) => e.kind === 'motion-video')?.size).toBe(before.motion!.length)
    expect(leftAfter(ticked, before, after!)).toEqual([])
  })

  // ExifTool rewrites a HEIC's meta box, so the video may move; its bytes are the same apart from the blanked box.
  const videoOf = (bytes: Uint8Array, info: ImageInfo) =>
    bytes.subarray(info.motion!.offset, info.motion!.offset + info.motion!.length)

  it('blanks a HEIC video’s location in its mpvd box', async () => {
    const bytes = fixture('motion-photo.heic')
    const { before, ticked, out, after } = await clean('motion-photo.heic', 'location')
    expect(ticked).toEqual(['motion-location'])
    expect(after!.motion).toMatchObject({
      length: before.motion!.length,
      duration: before.motion!.duration,
      location: null,
    })
    const shifted = before.motion!.location!.boxes.map((b) => ({ ...b, offset: b.offset - before.motion!.offset }))
    expect(videoOf(out!, after!)).toEqual(blank(videoOf(bytes, before), shifted))
  })

  it('keeps a HEIC video, without its location, when everything is removed: ExifTool leaves the mpvd box', async () => {
    const { planned, after } = await clean('motion-photo.heic', 'everything')
    expect(planned.caption).not.toContain('video')
    expect(after!.kinds).toContain('motion-photo')
    expect(after!.motion).toMatchObject({ location: null })
  })

  it('loses the video, as the caption says, when everything is removed', async () => {
    const { planned, after } = await clean('motion-photo.jpg', 'everything')
    expect(planned.caption).toContain('The Motion Photo’s video is removed too.')
    expect(after!.motion).toBe(null)
    expect(after!.kinds).not.toContain('motion-photo')
  })
})
