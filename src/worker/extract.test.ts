// Extract end to end in Node (SPEC.md 6.6): every item of every fixture, saved through the worker, is the bytes
// the source holds, copied out as they are.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
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
async function ask(request: Record<string, unknown> & { type: string }) {
  const replies: Reply[] = []
  await handle({ ...request, id: nextId++ } as never, (reply) => replies.push(reply))
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
    for (const item of info.embedded.filter((e) => e.kind !== 'c2pa-manifest')) {
      const blob = (await ask({ type: 'extract', item: item.id })) as Blob
      const bytes = new Uint8Array(await blob.arrayBuffer())
      expect(blob.type, item.id).toBe(extractType(item))
      if (item.size !== null) expect(bytes.length, item.id).toBe(item.size)
      expect(holds(source, item, bytes), `${name}: ${item.id}`).toBe(true)
      seen.add(item.kind)
    }
  })

  // No fixture has an MPF picture other than Ultra HDR's gain map, which ExifTool reads out the same way.
  it('covers every kind the worker saves', () => {
    expect([...seen].sort()).toEqual(
      [
        'comfyui-workflow',
        'depth-map',
        'gain-map',
        'generation-parameters',
        'icc-profile',
        'motion-video',
        'preview',
        'thumbnail',
        'trailer',
        'xmp',
      ].sort(),
    )
  })
})
