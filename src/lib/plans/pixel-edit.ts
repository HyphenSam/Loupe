/** What every pixel edit shares (SPEC.md 6.0): the format and quality the result is written in, the ExifTool
 * arguments that copy the source's metadata onto it, and the sentences naming what's dropped. */
import type { ImageInfo } from '../info'
import type { Encoding } from './plan'

export const FORMAT_NAMES: Record<Encoding['format'], string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
  jxl: 'JPEG XL',
}

export const CANT_EDIT = 'Loupe can’t edit TIFF or raw pictures. Extract the preview to edit that instead.'

const lossless = (format: Encoding['format']): Encoding => ({ format, quality: null, lossless: true })
const lossy = (format: Encoding['format'], quality: number): Encoding => ({ format, quality, lossless: false })

/** The source's format, written losslessly when it was lossless; GIF and BMP as PNG, HEIC as JPEG; lossy formats
 * at 6.0's qualities. TIFF and raw files aren't edited (`CANT_EDIT`). */
export function defaultEncoding(info: ImageInfo): { encoding: Encoding; note: string | null } {
  const of = (encoding: Encoding) => ({ encoding, note: null })
  switch (info.format) {
    case 'png':
    case 'gif':
    case 'bmp':
      return of(lossless('png'))
    case 'webp':
      return of(info.lossless ? lossless('webp') : lossy('webp', 90))
    case 'jxl':
      return of(info.lossless ? lossless('jxl') : lossy('jxl', 90))
    case 'avif':
      return of(lossy('avif', 70))
    case 'heic':
      return { encoding: lossy('jpeg', 90), note: 'Browsers can’t write HEIC, so the result is a JPEG.' }
    default:
      return of(lossy('jpeg', Math.min(95, info.jpeg?.quality ?? 90)))
  }
}

export const encodingCaption = (e: Encoding) =>
  e.lossless
    ? `Written losslessly as ${FORMAT_NAMES[e.format]}.`
    : `Re-encoded as ${FORMAT_NAMES[e.format]} at quality ${e.quality}.`

/** Whether the result's colours are converted to sRGB: libavif and libjxl, as built for the web, take no colour
 * profile, and ExifTool can't add one to their files, so a picture with any profile but sRGB would shift. */
export const needsSrgb = (info: ImageInfo, format: Encoding['format']) =>
  !!info.colour.profile && info.colour.space !== 'srgb' && (format === 'avif' || format === 'jxl')

export const srgbCaption = (format: Encoding['format']) =>
  `${FORMAT_NAMES[format]} can’t carry the colour profile here, so the colours are converted to sRGB.`

const has = (info: ImageInfo, name: string) => info.tags.some((t) => t.name === name)

/** ExifTool's arguments after `-tagsFromFile <source>`: every tag and the colour profile (not when `srgb`: the
 * colours were converted), but what would no longer match the picture (thumbnails and previews, Content Credentials,
 * the gain map's and a Motion Photo's XMP, Google's container directory, whose items were after the picture), then
 * Orientation 1 and the result's size where the source had them. A preview inside maker notes can't be left out
 * alone, so the maker notes go with it. */
export function copyArgs(info: ImageInfo, width: number, height: number, srgb = false): string[] {
  const previews = info.embedded
    .filter((e) => e.kind === 'thumbnail' || e.kind === 'preview')
    .map((e) => {
      const [family, group, name] = e.id.split(':')
      return family === 'MakerNotes' ? '--MakerNotes' : group === 'IFD1' ? '--IFD1:all' : `--${group}:${name}`
    })
  const left = [
    '--Orientation',
    '--IFD1:all',
    ...previews,
    '--JUMBF:all',
    '--XMP-hdrgm:all',
    '--XMP-GContainer:all',
    '--XMP-GCamera:MotionPhoto*',
    '--XMP-GCamera:MicroVideo*',
  ]
  const set = [
    ...(has(info, 'Orientation') ? ['-Orientation#=1'] : []),
    ...(has(info, 'ExifImageWidth') ? [`-ExifImageWidth=${width}`] : []),
    ...(has(info, 'ExifImageHeight') ? [`-ExifImageHeight=${height}`] : []),
  ]
  return ['-all:all', ...(srgb ? [] : ['-ICC_Profile']), ...new Set(left), ...set]
}

/** The sentences naming what a pixel edit drops that the source had; `why` the thumbnail goes. */
export function dropped(info: ImageInfo, why = 'it would show the picture before this edit'): string[] {
  const kinds = new Set(info.embedded.map((e) => e.kind))
  return [
    (kinds.has('thumbnail') || kinds.has('preview')) && `The embedded thumbnail is removed; ${why}.`,
    kinds.has('c2pa-manifest') && 'Content Credentials are removed; they’d no longer match the picture.',
    info.kinds.includes('ultra-hdr') && 'The HDR gain map is removed, so the result is standard range.',
    (info.motion || info.kinds.includes('motion-photo')) && 'The Motion Photo’s video is removed.',
  ].filter((s): s is string => !!s)
}
