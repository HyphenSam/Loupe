/** Output names (SPEC.md section 8). */
import type { Sniffed } from './formats'

/** The file's name without its last extension. */
export const stem = (name: string) => name.replace(/(?<=.)\.[^.]*$/, '')

/** The extension each format is written with. Raw files keep their own (`extensionOf`). */
export const EXTENSIONS: Record<Sniffed, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  heic: 'heic',
  jxl: 'jxl',
  gif: 'gif',
  bmp: 'bmp',
  tiff: 'tif',
}

// Windows refuses these in file names.
const sanitise = (part: string) => part.replace(/[<>:"/\\|?*]/g, '')

/** `<stem><suffix>.<extension>`. The suffix and extension are made here, so they're cleaned; the stem is the
 * user's own name and is kept as it is. */
export const outputName = (source: string, suffix: string, extension: string) =>
  `${stem(source)}${sanitise(suffix)}.${sanitise(extension)}`

/** `name`, or `name (2).ext`, `name (3).ext`… when the exports already hold it, ignoring case (Bytesize's). */
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  const base = stem(name)
  const extension = name.slice(base.length)
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${extension}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}
