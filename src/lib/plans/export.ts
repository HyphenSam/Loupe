/** Export's planner (SPEC.md 6.11): Bytesize's engine for one picture, with Loupe's metadata rules. The format,
 * quality, resize and target size come from the remembered settings; the badge is Lossless only when every pixel
 * survives as it was. */
import { formatBytes } from '../format-bytes'
import type { ImageInfo } from '../info'
import { EXTENSIONS, outputName } from '../names'
import { fitWithin } from '../resize'
import { MAX_SIDE, targetBytes, type ExportFormat, type ExportSettings } from '../settings'
import { extensionOf, typeOf } from './metadata'
import { cantEdit, copyArgs, dropped, FORMAT_NAMES, needsSrgb, srgbCaption } from './pixel-edit'
import type { Encoding, ExportPlan, Planned } from './plan'

/** The format Same means: GIF and BMP become PNG, HEIC becomes JPEG. */
export function sameFormat(info: ImageInfo): ExportFormat {
  switch (info.format) {
    case 'webp':
    case 'avif':
    case 'jxl':
    case 'png':
      return info.format
    case 'gif':
    case 'bmp':
      return 'png'
    default:
      return 'jpeg'
  }
}

/** How the result is written. With Same, a lossless WebP or JPEG XL stays lossless whatever its switch says. */
export function exportEncoding(info: ImageInfo, s: ExportSettings): Encoding {
  const format = s.format === 'same' ? sameFormat(info) : s.format
  const same = s.format === 'same' && info.lossless
  if (
    format === 'png' ||
    (format === 'webp' && (s.webpLossless || same)) ||
    (format === 'jxl' && (s.jxlLossless || same))
  )
    return { format, quality: null, lossless: true }
  return { format, quality: s.quality[format], lossless: false }
}

/** What the export card says after a run: the quality a target size settled on, or why even the lowest is too
 * large; and when the file grew, what to try. */
export function exportNotes(
  plan: ExportPlan,
  size: number,
  sourceSize: number,
  fitted: { quality: number; fits: boolean } | null,
): string[] {
  const { target } = plan
  if (fitted && target !== null && !fitted.fits)
    return [
      `Even at quality ${fitted.quality} this is ${formatBytes(size)}, over the ${formatBytes(target)} target. Turn on Resize, or choose another format.`,
    ]
  const grew = Math.max(1, Math.round(((size - sourceSize) / sourceSize) * 100))
  const instead = plan.encoding.lossless ? 'Try a lossy format such as WebP or AVIF.' : 'Try a lower quality.'
  return [
    fitted && target !== null && `Quality ${fitted.quality} fits under ${formatBytes(target)}.`,
    size > sourceSize && `${grew}% larger than the original. ${instead}`,
  ].filter((n): n is string => !!n)
}

export function planExport(info: ImageInfo, s: ExportSettings): Planned {
  const fail = (...problems: string[]): Planned => ({ plan: null, problems, caption: null })
  const cannot = cantEdit(info)
  if (cannot) return fail(cannot)

  const encoding = exportEncoding(info, s)
  const { format } = encoding
  const name = FORMAT_NAMES[format]
  const { displayWidth: width, displayHeight: height } = info
  const fitted = s.resize ? fitWithin(width, height, s.maxWidth, s.maxHeight) : null
  const size = fitted && (fitted.width !== width || fitted.height !== height) ? fitted : null
  const out = size ?? { width, height }

  const problems = [
    format === 'webp' &&
      (out.width > MAX_SIDE || out.height > MAX_SIDE) &&
      `WebP can’t be larger than ${MAX_SIDE} px on a side, and this picture is ${out.width} × ${out.height} px. Turn on Resize, or choose another format.`,
    s.target &&
      format === 'png' &&
      'PNG is always lossless, so it can’t aim for a target size. Choose JPEG, WebP, AVIF or JPEG XL.',
    s.target &&
      format !== 'png' &&
      encoding.lossless &&
      `Lossless ${name} can’t aim for a target size. Turn off Lossless.`,
  ].filter((p): p is string => !!p)
  if (problems.length) return fail(...problems)

  const srgb = needsSrgb(info, format)
  const kept = !!info.colour.profile && !srgb
  const deep = (info.bitDepth ?? 8) > 8
  const animated = !!info.animation
  const repack = info.format === 'png' && format === 'png' && !size && !animated
  const lossless = encoding.lossless && !size && !srgb && !animated && (repack || !deep)
  const target = s.target ? targetBytes(s) : null
  const signed = info.embedded.some((e) => e.kind === 'c2pa-manifest')
  const { args, said } = metadataOf()

  /** ExifTool's arguments and what the caption says of the metadata. A repack still holds all the source's, which
   * matches the picture but for its Content Credentials, whose hash covers the bytes. */
  function metadataOf(): { args: string[]; said: string[] } {
    if (!s.keepMetadata) {
      const said = [kept ? 'Metadata is removed but for the colour profile.' : 'Metadata is removed.']
      if (repack) return { args: kept ? ['-all=', '-tagsFromFile', '@', '-ICC_Profile'] : ['-all='], said }
      return { args: kept ? ['-ICC_Profile'] : [], said }
    }
    if (repack)
      return signed
        ? { args: ['-JUMBF:all='], said: ['Content Credentials are removed; they’d no longer match the picture.'] }
        : { args: [], said: [] }
    return {
      args: copyArgs(info, out.width, out.height, !kept),
      said: dropped(info),
    }
  }

  const caption = [
    lossless && 'Every pixel is kept.',
    s.format === 'same' && info.format === 'heic' && 'Browsers can’t write HEIC, so the result is a JPEG.',
    animated && 'Only the first frame is kept.',
    size && `Resized to ${size.width} × ${size.height}.`,
    deep && !repack && `The result has 8 bits a channel; the source has ${info.bitDepth}.`,
    srgb && srgbCaption(format),
    format === 'jpeg' && info.alpha && 'JPEG has no transparency, so transparent areas become white.',
    encoding.lossless
      ? `Written losslessly as ${name}.`
      : target
        ? `Re-encoded as ${name} at the highest quality up to ${encoding.quality} that fits under ${formatBytes(target)}.`
        : `Re-encoded as ${name} at quality ${encoding.quality}.`,
    ...said,
  ].filter((part): part is string => !!part)

  const extension = EXTENSIONS[format]
  return {
    plan: {
      kind: 'export',
      name: outputName(info.name, format === info.format ? ' (compressed)' : '', extension),
      type: typeOf(extension),
      exifName: `image.${extension}`,
      source: `source.${extensionOf(info)}`,
      args,
      encoding,
      size,
      target,
      srgb,
      repack,
      lossless,
    },
    problems: [],
    caption: caption.join(' '),
  }
}
