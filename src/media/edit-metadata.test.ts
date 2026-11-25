// Edit metadata end to end in Node: every fixture ExifTool can write gets every field written through the real
// planner and ExifTool, then read back, with the picture's bytes unchanged.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sniff } from '@/lib/formats'
import type { ImageInfo } from '@/lib/info'
import { fieldsOf, notWritten, planEditMetadata, type MetadataFields } from '@/lib/plans/edit-metadata'
import { toImageInfo } from '@/lib/tags'
import { readTags, restart } from './exiftool'
import { imageData } from './image-data'
import { FIXTURES, fixture, useNodeExifTool } from './node'
import { run } from './run'

beforeAll(useNodeExifTool)
afterEach(restart)
vi.setConfig({ testTimeout: 60_000 })

const files = ['', 'exiftool', 'c2pa', 'sd-parsers'].flatMap((dir) =>
  readdirSync(join(FIXTURES, dir))
    .map((name) => (dir ? `${dir}/${name}` : name))
    .filter((name) => statSync(join(FIXTURES, name)).isFile() && /\.(?!md$|txt$)\w+$/.test(name)),
)

async function open(name: string, bytes: Uint8Array): Promise<ImageInfo> {
  const file = { name: name.split('/').at(-1)!, size: bytes.length, lastModified: 0 }
  return toImageInfo(await readTags(file.name, bytes), file, sniff(bytes))!
}

/** Plans the fields as the tool would, runs the plan and reads the result back. */
async function edit(name: string, bytes: Uint8Array, change: (start: MetadataFields) => MetadataFields) {
  const before = await open(name, bytes)
  const asked = change(fieldsOf(before))
  const planned = planEditMetadata(before, asked)
  if (!planned.plan) return { before, asked, planned }
  const result = await run(planned.plan, bytes)
  const out = new Uint8Array(await result.blob.arrayBuffer())
  return { before, asked, planned, out, after: result.info! }
}

/** Every field changed, with text outside ASCII so IPTC's character set is tested too. */
const EVERY: Partial<MetadataFields> = {
  date: '2024-01-02T03:04:05',
  offset: '+05:30',
  title: 'Dawn over Lake Hayes',
  caption: 'Mist on the lake, Arrowtown’s café behind',
  creator: 'Zoë Smith',
  copyright: '© 2024 Zoë Smith',
  keywords: 'lake, autumn, Otago',
  location: 'set',
  lat: '-45.031200',
  lon: '168.662600',
}

/** What every edit keeps: the picture's bytes, its size, orientation and colour profile. */
function expectKept(name: string, before: ImageInfo, after: ImageInfo, bytes: Uint8Array, out: Uint8Array) {
  expect(after.format).toBe(before.format)
  expect([after.width, after.height]).toEqual([before.width, before.height])
  expect(after.orientation).toBe(before.orientation)
  expect(after.colour.profile).toBe(before.colour.profile)
  const data = imageData(bytes)
  if (data) {
    expect(data.length, name).toBeGreaterThan(0)
    expect(imageData(out), name).toEqual(data)
  } else expect(before.format, name).toBe('raw')
}

describe('Edit metadata writes every field', () => {
  it.each(files)('%s', async (name) => {
    const bytes = fixture(name)
    const { before, asked, planned, out, after } = await edit(name, bytes, (start) => ({ ...start, ...EVERY }))
    if (before.format === 'bmp') return expect(planned.problems).toEqual(['Loupe can’t change metadata in a BMP file.'])
    expect(planned.problems, name).toEqual([])
    expectKept(name, before, after!, bytes, out!)
    const expected = KNOWN[name.split('.').at(-1)!.toLowerCase()] ?? []
    expect(notWritten(before, asked, after!), name).toEqual(expected)
    if (!expected.length) {
      expect(fieldsOf(after!), name).toEqual({ ...fieldsOf(after!), ...EVERY, location: 'keep' })
      expect(after!.gps?.altitude ?? null, name).toBe(null)
    }
  })
})

/** What ExifTool can't write, by extension. It lists X3F as writable, but writes nothing into this one (an
 * early version, from its own test images), so the read-back names every field. */
const KNOWN: Record<string, string[]> = {
  x3f: ['Date taken', 'Title', 'Caption', 'Creator', 'Copyright', 'Keywords', 'Location'].map(
    (field) => `${field}: ExifTool couldn’t write it to this X3F file.`,
  ),
}

describe('Edit metadata', () => {
  it('clears what’s left empty: no date, no text, no keywords', async () => {
    const written = await edit('a1111.jpg', fixture('a1111.jpg'), (start) => ({ ...start, ...EVERY }))
    const cleared = await edit('a1111.jpg', written.out!, (start) => ({
      ...start,
      date: '',
      offset: '',
      title: '',
      caption: ' ',
      creator: '',
      copyright: '',
      keywords: '',
    }))
    expect(notWritten(cleared.before, cleared.asked, cleared.after!)).toEqual([])
    expect(fieldsOf(cleared.after!)).toMatchObject({ date: '', title: '', caption: '', keywords: '' })
    expect(
      cleared.after!.tags.filter((t) => /^(DateTimeOriginal|DateCreated|Description|Subject)$/.test(t.name)),
    ).toEqual([])
    expect(imageData(cleared.out!)).toEqual(imageData(fixture('a1111.jpg')))
  })

  it('writes a date without a time zone, leaving none behind', async () => {
    const { after } = await edit('camera.jpg', fixture('camera.jpg'), (start) => ({
      ...start,
      date: '2024-01-02T03:04',
      offset: '',
    }))
    expect(after!.dates.taken).toEqual({ local: '2024-01-02T03:04:00', offset: null })
  })

  it('removes the location: the position and the place names, as Privacy does', async () => {
    for (const name of ['camera.jpg', 'exiftool/GoPro.jpg']) {
      const { before, after } = await edit(name, fixture(name), (start) => ({ ...start, location: 'remove' }))
      expect(before.gps, name).not.toBe(null)
      expect(after!.gps, name).toBe(null)
      // The GPS clock's date and time stay: Privacy counts them as dates, not the location.
      const where = after!.tags.filter(
        (t) => (t.group === 'GPS' && !/^GPS(Date|Time)Stamp$/.test(t.name)) || /^(City|Country|State)/.test(t.name),
      )
      expect(where, name).toEqual([])
    }
  })

  it('sets a location in place of the old one, dropping its altitude and direction', async () => {
    const { before, after } = await edit('camera.jpg', fixture('camera.jpg'), (start) => ({
      ...start,
      location: 'set',
      lat: '51.5007',
      lon: '-0.1246',
    }))
    expect(before.gps!.altitude).toBe(312)
    expect(after!.gps).toMatchObject({ altitude: null, direction: null })
    expect(after!.gps!.lat).toBeCloseTo(51.5007, 5)
    expect(after!.gps!.lon).toBeCloseTo(-0.1246, 5)
  })

  it('leaves alone every field it wasn’t asked to change', async () => {
    const { before, after } = await edit('exiftool/Canon.jpg', fixture('exiftool/Canon.jpg'), (start) => ({
      ...start,
      title: 'Dawn',
    }))
    const untouched = (info: ImageInfo) =>
      info.tags.filter((t) => !['IPTC', 'XMP', 'File', 'Composite'].includes(t.family) && t.name !== 'ImageDescription')
    expect(untouched(after!)).toEqual(untouched(before))
    expect(after!.camera).toEqual(before.camera)
    expect(fieldsOf(after!)).toEqual({ ...fieldsOf(before), title: 'Dawn' })
  })
})
