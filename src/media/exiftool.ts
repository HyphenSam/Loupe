/** ExifTool (WebAssembly, through @uswriting/exiftool and zeroperl), the only place it runs. One Perl
 * instance is kept between calls, and calls never overlap: each waits for the one before.
 *
 * zeroperl is patched (patches/) to load its wasm only through the `fetch` option, which is always given
 * here: the Vite asset in the browser, the file itself in Node's tests. */
import { dispose, parseMetadata, writeMetadata } from '@uswriting/exiftool'
import wasmUrl from '@6over3/zeroperl-ts/zeroperl.wasm?url'

/** How each file is read (CLAUDE.md records why): every tag (`-a`, unknown ones too with `-u`), keyed by
 * family 0 and 1 groups, each with its description, printed value and number (`-l`). Binary values are
 * listed by size only; the few Loupe needs are asked for by name (`readBinary`). The System group describes
 * ExifTool's in-memory file system, not the user's file. */
export const READ_ARGS = ['-json', '-l', '-G0:1', '-a', '-u', '--System:all']

type FetchLike = () => Promise<Response>

let fetchWasm: FetchLike = () => fetch(wasmUrl)

/** Where the wasm comes from outside the browser (Node's tests). */
export function setWasmSource(source: FetchLike) {
  fetchWasm = source
}

let queue: Promise<unknown> = Promise.resolve()
const fetchOption = () => fetchWasm as (...args: unknown[]) => Promise<Response>

/** How many calls one Perl instance takes before a fresh one starts. Its memory grows with every call: in
 * Node, a few hundred reads and writes took each call from 0.2 s to 10 s, then failed. */
const CALLS_PER_INSTANCE = 40
let calls = 0

/** Runs calls one at a time: ExifTool's Perl instance can't take two at once. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const fresh = async () => {
    if (++calls > CALLS_PER_INSTANCE) {
      calls = 1
      await dispose()
    }
    return task()
  }
  const result = queue.then(fresh, fresh)
  queue = result.catch(() => {})
  return result
}

/** A name ExifTool's in-memory file system can hold that keeps the extension, which ExifTool reads for a
 * few formats the bytes don't settle. */
function safeName(name: string): string {
  const extension = name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? 'bin'
  return `image.${extension}`
}

async function run(name: string, data: Uint8Array | Blob, args: string[]): Promise<string> {
  const result = await serial(() => parseMetadata({ name: safeName(name), data }, { args, fetch: fetchOption() }))
  if (!result.success) throw new Error(`ExifTool couldn't read this file: ${result.error.trim()}`)
  return result.data
}

/** ExifTool's JSON for a file, as `READ_ARGS` asks. */
export function readTags(name: string, data: Uint8Array | Blob): Promise<string> {
  return run(name, data, READ_ARGS)
}

/** The bytes of a binary tag (a raw file's preview, say), or null if the file has none. `tag` is a name
 * ExifTool takes: 'PreviewImage', 'EXIF:SubIFD:JpgFromRaw'. A block ExifTool gives as text (an XMP packet,
 * or the stub ExifTool's own test images hold in place of a preview) comes back as its UTF-8 bytes. */
export async function readBinary(name: string, data: Uint8Array | Blob, tag: string): Promise<Uint8Array | null> {
  // `-m`: a damaged block comes out as it is rather than failing on ExifTool's warning about it.
  const json = await run(name, data, ['-json', '-b', '-m', '-G0:1', `-${tag}`])
  const [object] = JSON.parse(json) as Record<string, unknown>[]
  const value = Object.entries(object ?? {}).find(([key]) => key !== 'SourceFile')?.[1]
  if (typeof value !== 'string') return null
  if (!value.startsWith('base64:')) return new TextEncoder().encode(value)
  return Uint8Array.from(atob(value.slice(7)), (c) => c.charCodeAt(0))
}

/** Photoshop's XMP history as structures (`-struct`), or null without one. The main read flattens it, and
 * flattened lists don't line up: a step leaves out what it doesn't use. */
export async function readHistory(name: string, data: Uint8Array | Blob): Promise<unknown> {
  const json = await run(name, data, ['-json', '-struct', '-XMP-xmpMM:History'])
  const [object] = JSON.parse(json) as Record<string, unknown>[]
  return Object.entries(object ?? {}).find(([key]) => key !== 'SourceFile')?.[1] ?? null
}

/** Runs `args` on a copy of the file and returns the copy's bytes. `name` says the format by its extension.
 * Minor errors are let through and warnings kept quiet (`-m -q -q`): the wrapper treats anything on stderr as
 * failure, and the read-back is what says whether the job did what it should. */
export async function writeTags(name: string, data: Uint8Array | Blob, args: string[]): Promise<Uint8Array> {
  const result = await serial(() =>
    writeMetadata({ name: safeName(name), data }, {}, { args: ['-m', '-q', '-q', ...args], fetch: fetchOption() }),
  )
  if (!result.success)
    throw new Error(`ExifTool couldn’t change this file: ${result.error.trim().replace(/^Error: | - \/\S+$/g, '')}`)
  return new Uint8Array(result.data)
}

/** Copies `source`'s metadata onto a copy of the file, with `-tagsFromFile <source> ...args`, and returns the copy's
 * bytes. The wrapper takes one file, and a second only as `config`, which it passes as `-config <path>` after the
 * other arguments; ExifTool ignores a `-config` that isn't first (its warning kept quiet by `-q -q`), so the source
 * rides along there and `-tagsFromFile` reads it by its path. `source.name` must differ from `name`'s. */
export async function copyTags(
  name: string,
  data: Uint8Array,
  source: { name: string; data: Uint8Array },
  args: string[],
): Promise<Uint8Array> {
  const result = await serial(() =>
    writeMetadata(
      { name: safeName(name), data },
      {},
      {
        args: ['-m', '-q', '-q', '-tagsFromFile', `/${source.name}`, ...args],
        config: { name: source.name, data: source.data },
        fetch: fetchOption(),
      },
    ),
  )
  if (!result.success)
    throw new Error(`ExifTool couldn’t copy the metadata: ${result.error.trim().replace(/^Error: | - \/\S+$/g, '')}`)
  return new Uint8Array(result.data)
}

/** Frees ExifTool's Perl instance now; the next call starts a fresh one. */
export const restart = () =>
  serial(() => {
    calls = 0
    return dispose()
  })
