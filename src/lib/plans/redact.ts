/** Redact's planner (SPEC.md 6.9): the boxes filled on the upright picture, written as every pixel edit is (6.0).
 * Only the boxes change, so a lossless format stays lossless. The Remove metadata switch keeps only the colour
 * profile, as Privacy's Everything does; the result is upright, so Orientation isn't wanted. Thumbnails,
 * previews, Content Credentials, gain maps and Motion Photo videos go either way, since they'd show what was
 * hidden. */
import type { ImageInfo } from '../info'
import { EXTENSIONS, outputName } from '../names'
import type { Rect } from '../pixels'
import type { Fill } from '../redact'
import { extensionOf, typeOf } from './metadata'
import { CANT_EDIT, copyArgs, defaultEncoding, dropped, encodingCaption, needsSrgb, srgbCaption } from './pixel-edit'
import type { Encoding, Planned } from './plan'

export type RedactSettings = {
  /** On the upright picture. */
  boxes: Rect[]
  fill: Fill
  removeMetadata: boolean
  /** The Output disclosure's choice, for this edit only; null for 6.0's. */
  output: Encoding | null
}

export const DEFAULT_REDACT: RedactSettings = { boxes: [], fill: 'black', removeMetadata: true, output: null }

export function planRedact(info: ImageInfo, s: RedactSettings): Planned {
  const fail = (problem: string): Planned => ({ plan: null, problems: [problem], caption: null })
  if (info.format === 'tiff' || info.format === 'raw') return fail(CANT_EDIT)
  const [width, height] = [info.displayWidth, info.displayHeight]
  const boxes = s.boxes.flatMap((b) => {
    const [x, y] = [Math.max(0, b.x), Math.max(0, b.y)]
    const [w, h] = [Math.min(width, b.x + b.width) - x, Math.min(height, b.y + b.height) - y]
    return w > 0 && h > 0 ? [{ x, y, width: w, height: h }] : []
  })
  if (!boxes.length) return fail('Draw a box over what to hide.')

  const { encoding, note } = s.output ? { encoding: s.output, note: null } : defaultEncoding(info)
  const deep = (info.bitDepth ?? 8) > 8
  const srgb = needsSrgb(info, encoding.format)
  const lossless = encoding.lossless && info.lossless && !deep && !srgb && !info.animation
  const extension = EXTENSIONS[encoding.format]
  const caption = [
    lossless && 'Only the boxes change.',
    note,
    info.animation && 'Only the first frame is kept.',
    deep && encoding.lossless && `The result has 8 bits a channel; the source has ${info.bitDepth}.`,
    srgb && srgbCaption(encoding.format),
    encodingCaption(encoding),
    s.removeMetadata && (srgb ? 'All metadata is removed.' : 'All metadata is removed but the colour profile.'),
    ...dropped(info, 'it would show what you hid'),
  ].filter((part): part is string => !!part)
  return {
    plan: {
      kind: 'pixels',
      name: outputName(info.name, ' (redacted)', extension),
      type: typeOf(extension),
      exifName: `image.${extension}`,
      source: `source.${extensionOf(info)}`,
      args: s.removeMetadata ? (srgb ? [] : ['-ICC_Profile']) : copyArgs(info, width, height, srgb),
      ops: [{ type: 'redact', boxes, fill: s.fill }],
      encoding,
      srgb,
      lossless,
    },
    problems: [],
    caption: caption.join(' '),
  }
}
