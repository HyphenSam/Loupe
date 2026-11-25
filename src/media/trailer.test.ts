// trailer.ts against the real files: a ZIP after a JPEG, an Ultra HDR JPEG's gain map (a known trailer), and
// ExifTool's maker-note samples, with ExifTool's tags as the app reads them.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { sniff } from '@/lib/formats'
import { findTrailer } from '@/lib/forensics/trailer'
import { parseExifTool } from '@/lib/tags'
import type { Tag } from '@/lib/info'
import { readTags } from './exiftool'
import { FIXTURES, fixture, useNodeExifTool } from './node'

beforeAll(useNodeExifTool)
vi.setConfig({ testTimeout: 30_000 })

async function tagsOf(name: string, bytes: Uint8Array): Promise<Tag[]> {
  return parseExifTool(await readTags(name, bytes)).map((e) => ({ ...e, label: e.label, value: String(e.val) }))
}

async function trailerOf(name: string) {
  const bytes = fixture(name)
  return { bytes, trailer: findTrailer(bytes, sniff(bytes) ?? 'raw', await tagsOf(name, bytes)) }
}

describe('findTrailer on real files', () => {
  it('finds the ZIP after trailer-zip.jpg’s picture, and its bytes unzip', async () => {
    const { bytes, trailer } = await trailerOf('trailer-zip.jpg')
    // The fixture is grid-420.jpg with the ZIP appended.
    expect(trailer).toEqual({
      offset: fixture('grid-420.jpg').length,
      length: bytes.length - fixture('grid-420.jpg').length,
      looksLike: 'zip',
    })
    const files = unzipSync(bytes.subarray(trailer!.offset, trailer!.offset + trailer!.length))
    expect(strFromU8(files['note.txt'])).toBe('Hidden after the end of the picture.\n')
  })

  it('knows ultra-hdr.jpg’s gain map', async () => {
    expect((await trailerOf('ultra-hdr.jpg')).trailer).toBe(null)
  })

  it.each(readdirSync(join(FIXTURES, 'exiftool')).filter((n) => n.endsWith('.jpg')))(
    'finds nothing hidden in the maker-note sample %s',
    async (name) => {
      expect((await trailerOf(`exiftool/${name}`)).trailer).toBe(null)
    },
  )

  it.each(['grid-420.jpg', 'camera.jpg', 'a1111.png', 'lossy.webp', 'c2pa/CA.jpg'])(
    'finds nothing after %s',
    async (name) => {
      expect((await trailerOf(name)).trailer).toBe(null)
    },
  )
})
