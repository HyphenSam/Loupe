// Extract end to end in Node (SPEC.md 6.6): every item of every fixture, saved through the worker, is the bytes
// the source holds, copied out as they are; a drawing Loupe rebuilds is checked by its pixels.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { decode } from '@jsquash/png'
import { extractType } from '@/lib/extract'
import type { Embedded, ImageInfo } from '@/lib/info'
import type { Reply } from '@/lib/protocol'
import { FIXTURES, useNodeCodecs, useNodeExifTool, useNodePlaces } from '@/media/node'
import { handle } from './handle'

beforeAll(async () => {
  useNodeExifTool()
  useNodePlaces()
  await useNodeCodecs()
})
vi.setConfig({ testTimeout: 60_000 })

let nextId = 1
// The file requests are about, as the page's client keeps it: the last open that finished.
let held: number | null = null
async function ask(request: Record<string, unknown> & { type: string }) {
  const replies: Reply[] = []
  const id = nextId++
  const named = request.type === 'open' ? request : { fileId: held, ...request }
  await handle({ ...named, id } as never, (reply) => replies.push(reply))
  if (request.type === 'open' && replies.some((r) => r.type === 'done')) held = id
  const done = replies.find((r) => r.type === 'done')
  const failed = replies.find((r) => r.type === 'failed')
  if (failed?.type === 'failed') throw new Error(failed.message)
  return done?.type === 'done' ? done.value : undefined
}

const files = ['', 'exiftool', 'c2pa', 'sd-parsers'].flatMap((dir) =>
  readdirSync(join(FIXTURES, dir))
    .map((name) => (dir ? `${dir}/${name}` : name))
    .filter((name) => statSync(join(FIXTURES, name)).isFile() && !/\.(md|txt)$/.test(name)),
)

/** Where `part` starts in `whole`, or -1. */
const find = (whole: Buffer, part: Uint8Array) => whole.indexOf(Buffer.from(part))

const xmlEscaped = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Whether the source holds the item's bytes: as they are, or as the source stores them when it stores them as
 * text. A depth map in XMP is base64. A generator's text is saved as UTF-8, and the source may hold it as Latin-1
 * (a PNG tEXt chunk), XML-escaped (XMP), or UTF-16 (EXIF UserComment marked UNICODE). */
function holds(source: Buffer, item: Embedded, bytes: Uint8Array): boolean {
  if (find(source, bytes) >= 0) return true
  if (item.id.startsWith('XMP:')) return source.includes(Buffer.from(bytes).toString('base64'))
  if (item.kind !== 'comfyui-workflow' && item.kind !== 'generation-parameters') return false
  const text = new TextDecoder().decode(bytes)
  const utf16be = Buffer.from(text, 'utf16le').swap16()
  return [Buffer.from(text, 'latin1'), Buffer.from(xmlEscaped(text)), Buffer.from(text, 'utf16le'), utf16be].some(
    (encoded) => source.includes(encoded),
  )
}

const seen = new Set<string>()

describe('every item Extract saves is byte-identical to its bytes in the source', () => {
  it.each(files)('%s', async (name) => {
    const source = readFileSync(join(FIXTURES, name))
    const info = (await ask({
      type: 'open',
      file: new File([source], name.split('/').at(-1)!),
      shows: {},
    })) as ImageInfo
    // The SDK reads Content Credentials on the page; the worker has nothing to do with them.
    for (const item of info.embedded.filter((e) => e.kind !== 'c2pa-manifest' && e.kind !== 'drawing')) {
      const blob = (await ask({ type: 'extract', item: item.id })) as Blob
      const bytes = new Uint8Array(await blob.arrayBuffer())
      expect(blob.type, item.id).toBe(extractType(item))
      if (item.size !== null) expect(bytes.length, item.id).toBe(item.size)
      expect(holds(source, item, bytes), `${name}: ${item.id}`).toBe(true)
      seen.add(item.kind)
    }
  })

  // No fixture has an MPF picture other than Ultra HDR's gain map, which ExifTool reads out the same way, nor a
  // picture in Samsung's trailer other than a drawing's tiles, which are read out by their place the same way.
  it('covers every kind the worker saves', () => {
    expect([...seen].sort()).toEqual(
      [
        'comfyui-workflow',
        'depth-map',
        'drawing-tiles',
        'gain-map',
        'generation-parameters',
        'icc-profile',
        'motion-video',
        'preview',
        'samsung-edits',
        'thumbnail',
        'trailer',
        'xmp',
      ].sort(),
    )
  })
})

describe('a drawing Samsung Gallery keeps in tiles', () => {
  it('is rebuilt from them: white at half opacity over the corner, then a magenta bar', async () => {
    const source = readFileSync(join(FIXTURES, 'samsung-edit.png'))
    const info = (await ask({ type: 'open', file: new File([source], 'samsung-edit.png'), shows: {} })) as ImageInfo
    expect(info.embedded.filter((e) => e.kind === 'drawing').map((e) => e.id)).toEqual(['drawing:0'])
    const blob = (await ask({ type: 'extract', item: 'drawing:0' })) as Blob
    expect(blob.type).toBe('image/png')
    const drawing = await decode(await blob.arrayBuffer())
    expect([drawing.width, drawing.height]).toEqual([16, 12])
    const at = (x: number, y: number) => [...drawing.data.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4)]
    // The first stroke's tiles at blocks (0, 0), (0, 1) and (1, 1) of its grid from (2, 2); the second's at (0, 0)
    // and (1, 0) of its grid from (6, 4), over the first.
    expect(at(0, 0)).toEqual([0, 0, 0, 0])
    expect(at(2, 2)).toEqual([255, 255, 255, 128])
    expect(at(9, 2)).toEqual([255, 255, 255, 128])
    expect(at(10, 2)).toEqual([0, 0, 0, 0])
    expect(at(6, 4)).toEqual([230, 40, 160, 255])
    expect(at(9, 11)).toEqual([230, 40, 160, 255])
    expect(at(10, 11)).toEqual([0, 0, 0, 0])
    expect(at(2, 6)).toEqual([0, 0, 0, 0])
    expect(at(6, 9)).toEqual([230, 40, 160, 255])
  })

  it('isn’t there to rebuild in a file without one', async () => {
    const source = readFileSync(join(FIXTURES, 'trailer-zip.jpg'))
    await ask({ type: 'open', file: new File([source], 'trailer-zip.jpg'), shows: {} })
    await expect(ask({ type: 'extract', item: 'drawing:0' })).rejects.toThrow(
      'This file has nothing to save as “drawing:0”.',
    )
  })
})
