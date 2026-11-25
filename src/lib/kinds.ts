/** The special kinds of picture (SPEC.md section 4): what marks each in the metadata, and how Info and the
 * file card name them. */
import type { Format } from './formats'
import type { Animation, Kind } from './info'
import { semantics, type Reader } from './tags'

/** The kinds a file's tags mark it as, in a fixed order. */
export function kindsOf(t: Reader, format: Format, animation: Animation | null): Kind[] {
  const items = semantics(t)
  const found: Record<Kind, boolean> = {
    screenshot: t.text('UserComment') === 'Screenshot',
    'motion-photo':
      t.number('MotionPhoto') === 1 ||
      t.number('MicroVideo') === 1 ||
      items.includes('MotionPhoto') ||
      t.has('MotionPhotoVideo') ||
      t.has('EmbeddedVideoFile'),
    'live-photo': t.has('ContentIdentifier', 'Apple'),
    'ultra-hdr':
      t.has('Version', 'XMP-hdrgm') ||
      !!t.text('UniformResourceName')?.startsWith('urn:iso:std:iso:ts:21496') ||
      items.includes('GainMap'),
    'portrait-depth': t.has('Format', 'XMP-GDepth') || t.has('Data', 'XMP-GDepth') || items.includes('Depth'),
    'panorama-360': t.text('ProjectionType', 'XMP-GPano')?.toLowerCase() === 'equirectangular',
    burst: t.has('BurstUUID') || t.has('BurstID', 'XMP-GCamera'),
    animated: animation !== null,
    raw: format === 'raw',
  }
  return (Object.keys(found) as Kind[]).filter((kind) => found[kind])
}

/** The file card's chip for each kind. */
export const KIND_CHIPS: Record<Kind, string> = {
  screenshot: 'Screenshot',
  'motion-photo': 'Motion Photo',
  'live-photo': 'Live Photo',
  'ultra-hdr': 'Ultra HDR',
  'portrait-depth': 'Portrait',
  'panorama-360': '360°',
  burst: 'Burst',
  animated: 'Animated',
  raw: 'Camera raw',
}

/** Info's sentence for each kind, or null for kinds the Picture section already describes. */
export function kindSentence(kind: Kind): string | null {
  switch (kind) {
    case 'motion-photo':
      return 'A Motion Photo: a video is stored inside.'
    case 'live-photo':
      return 'Part of a Live Photo. Its video is a separate .MOV file, linked by an ID.'
    case 'portrait-depth':
      return 'Portrait mode: has a depth map.'
    case 'panorama-360':
      return 'A 360° panorama.'
    case 'burst':
      return 'Part of a burst.'
    case 'screenshot':
      return 'A screenshot.'
    case 'raw':
      return 'A camera raw file: Loupe shows its embedded preview.'
    case 'ultra-hdr':
    case 'animated':
      return null
  }
}
