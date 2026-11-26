/** Adjust's planner (SPEC.md 6.10): the sliders' adjustment applied to the upright picture, written as every pixel
 * edit is (6.0), so a lossless format stays lossless and the metadata is copied but for what no longer matches. */
import { isNeutral, NEUTRAL, type Adjustments } from '../adjust'
import type { ImageInfo } from '../info'
import { EXTENSIONS, outputName } from '../names'
import { extensionOf, typeOf } from './metadata'
import { CANT_EDIT, copyArgs, defaultEncoding, dropped, encodingCaption, needsSrgb, srgbCaption } from './pixel-edit'
import type { Encoding, Planned } from './plan'

export type AdjustSettings = {
  adjustments: Adjustments
  /** The Output disclosure's choice, for this edit only; null for 6.0's. */
  output: Encoding | null
}

export const DEFAULT_ADJUST: AdjustSettings = { adjustments: NEUTRAL, output: null }

export function planAdjust(info: ImageInfo, s: AdjustSettings): Planned {
  const fail = (problem: string): Planned => ({ plan: null, problems: [problem], caption: null })
  if (info.format === 'tiff' || info.format === 'raw') return fail(CANT_EDIT)
  if (isNeutral(s.adjustments)) return fail('Move a slider to adjust the picture.')

  const { encoding, note } = s.output ? { encoding: s.output, note: null } : defaultEncoding(info)
  const deep = (info.bitDepth ?? 8) > 8
  const srgb = needsSrgb(info, encoding.format)
  const lossless = encoding.lossless && info.lossless && !deep && !srgb && !info.animation
  const extension = EXTENSIONS[encoding.format]
  const caption = [
    lossless && 'Only the adjustment changes the pixels.',
    note,
    info.animation && 'Only the first frame is kept.',
    deep && encoding.lossless && `The result has 8 bits a channel; the source has ${info.bitDepth}.`,
    srgb && srgbCaption(encoding.format),
    encodingCaption(encoding),
    ...dropped(info),
  ].filter((part): part is string => !!part)
  return {
    plan: {
      kind: 'pixels',
      name: outputName(info.name, ' (adjusted)', extension),
      type: typeOf(extension),
      exifName: `image.${extension}`,
      source: `source.${extensionOf(info)}`,
      args: copyArgs(info, info.displayWidth, info.displayHeight, srgb),
      ops: [{ type: 'adjust', adjustments: s.adjustments }],
      encoding,
      srgb,
      lossless,
    },
    problems: [],
    caption: caption.join(' '),
  }
}
