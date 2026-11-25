/** Extract's output names and media types (SPEC.md 6.6). */
import type { Embedded, EmbeddedKind } from './info'
import { outputName, uniqueName } from './names'

const SUFFIXES: Record<EmbeddedKind, string> = {
  thumbnail: ' thumbnail',
  preview: ' preview',
  'mpf-image': ' preview',
  'motion-video': ' video',
  'depth-map': ' depth',
  'gain-map': ' gain map',
  'icc-profile': ' profile',
  xmp: '',
  'comfyui-workflow': ' workflow',
  'generation-parameters': ' parameters',
  'c2pa-manifest': ' credentials',
  trailer: ' hidden',
}

const baseName = (source: string, e: Embedded) => outputName(source, SUFFIXES[e.kind], e.extension)

/** `<stem> preview.jpg` and so on, numbered when an earlier item in `all` has the same name. */
export function extractName(source: string, item: Embedded, all: readonly Embedded[]): string {
  const before = all.slice(0, all.indexOf(item))
  const taken: string[] = []
  for (const e of before) taken.push(uniqueName(baseName(source, e), taken))
  return uniqueName(baseName(source, item), taken)
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  icc: 'application/vnd.iccprofile',
  xmp: 'application/rdf+xml',
  json: 'application/json',
  txt: 'text/plain',
  // Hidden data, saved as what it looks like (trailer.ts).
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  pdf: 'application/pdf',
}

/** The media type an item is saved with. */
export const extractType = (item: Embedded) => TYPES[item.extension] ?? 'application/octet-stream'
