/** ExifTool (WebAssembly, through @uswriting/exiftool and zeroperl), the only place it runs. One Perl
 * instance is kept between calls, and calls never overlap: each waits for the one before.
 *
 * zeroperl is patched (patches/) to load its wasm only through the `fetch` option, which is always given
 * here: the Vite asset in the browser, the file itself in Node's tests. */
import { parseMetadata } from '@uswriting/exiftool'
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

/** Runs calls one at a time: ExifTool's Perl instance can't take two at once. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task)
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
  const result = await serial(() =>
    parseMetadata({ name: safeName(name), data }, { args, fetch: fetchWasm as (...args: unknown[]) => Promise<Response> }),
  )
  if (!result.success) throw new Error(`ExifTool couldn't read this file: ${result.error.trim()}`)
  return result.data
}

/** ExifTool's JSON for a file, as `READ_ARGS` asks. */
export function readTags(name: string, data: Uint8Array | Blob): Promise<string> {
  return run(name, data, READ_ARGS)
}

/** The bytes of a binary tag (a raw file's preview, say), or null if the file has none. `tag` is a name
 * ExifTool takes: 'PreviewImage', 'EXIF:SubIFD:JpgFromRaw'. */
export async function readBinary(name: string, data: Uint8Array | Blob, tag: string): Promise<Uint8Array | null> {
  const json = await run(name, data, ['-json', '-b', '-G0:1', `-${tag}`])
  const [object] = JSON.parse(json) as Record<string, unknown>[]
  const value = Object.entries(object ?? {}).find(([key]) => key !== 'SourceFile')?.[1]
  if (typeof value !== 'string' || !value.startsWith('base64:')) return null
  return Uint8Array.from(atob(value.slice(7)), (c) => c.charCodeAt(0))
}
