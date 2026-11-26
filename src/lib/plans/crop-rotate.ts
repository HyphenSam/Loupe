/** Crop and rotate's planner (SPEC.md 6.8). A JPEG that isn't straightened goes to jpegtran, which moves its
 * blocks without re-encoding: losslessly when the moving edges are whole blocks (or the partial ones are trimmed)
 * and the crop's left and top edges are on the block grid. Everything else is decoded, moved and encoded, exactly
 * for lossless formats. The settings describe the upright picture as the user turned it: the source's own
 * Orientation is folded in here. */
import type { ImageInfo, Orientation } from '../info'
import { jpegGrid, onGrid, partialEdges, type Grid } from '../mcu'
import { EXTENSIONS, outputName } from '../names'
import { compose, type PixelOp, type Rect } from '../pixels'
import { extensionOf, typeOf } from './metadata'
import { CANT_EDIT, copyArgs, defaultEncoding, dropped, encodingCaption } from './pixel-edit'
import type { Encoding, JpegTransform, Planned } from './plan'

export type CropRotateSettings = {
  /** The user's turns and flips, composed (1: none). */
  turn: Orientation
  /** Degrees clockwise, −45 to 45. */
  straighten: number
  /** In the turned (and straightened) picture; null for none. */
  crop: Rect | null
  /** When a turn would move partial JPEG blocks: trim them (lossless) or re-encode the whole picture. */
  partial: 'trim' | 'reencode'
  /** The Output disclosure's choice, for this edit only; null for 6.0's. */
  output: Encoding | null
}

export const DEFAULT_CROP_ROTATE: CropRotateSettings = {
  turn: 1,
  straighten: 0,
  crop: null,
  partial: 'trim',
  output: null,
}

// The stored picture turned by an EXIF orientation is the same as jpegtran's transform of that name.
const TRANSFORMS: Record<Orientation, JpegTransform> = {
  1: 'none',
  2: 'flip-horizontal',
  3: 'rotate-180',
  4: 'flip-vertical',
  5: 'transpose',
  6: 'rotate-90',
  7: 'transverse',
  8: 'rotate-270',
}

/** The size of the picture the crop is drawn on: upright, then turned by the user. */
export function turnedSize(info: ImageInfo, turn: Orientation) {
  const [width, height] = [info.displayWidth, info.displayHeight]
  return turn >= 5 ? { width: height, height: width } : { width, height }
}

export const gridWords = (g: Grid) => `${g.width === g.height ? g.width : `${g.width} × ${g.height}`} px`

export function planCropRotate(info: ImageInfo, s: CropRotateSettings): Planned {
  const fail = (problem: string): Planned => ({ plan: null, problems: [problem], caption: null, trim: null })
  if (info.format === 'tiff' || info.format === 'raw') return fail(CANT_EDIT)
  const size = turnedSize(info, s.turn)
  const whole =
    s.crop && s.crop.x === 0 && s.crop.y === 0 && s.crop.width === size.width && s.crop.height === size.height
  const crop = whole ? null : s.crop
  if (crop && (crop.width < 1 || crop.height < 1)) return fail('The crop must be at least 1 × 1 px.')
  if (crop && (crop.x < 0 || crop.y < 0 || crop.x + crop.width > size.width || crop.y + crop.height > size.height))
    return fail('The crop goes outside the picture.')
  // A sideways-stored picture with nothing asked is still stood upright: its pixels turn.
  if (s.turn === 1 && !crop && !s.straighten && info.orientation === 1)
    return fail('Crop, turn or straighten the picture.')

  const suffix = crop ? ' (cropped)' : ' (rotated)'
  const notes: string[] = []
  const dropping = dropped(info)

  const viaJpegtran = info.format === 'jpeg' && info.jpeg && !s.straighten && !s.output
  if (viaJpegtran) {
    const grid = jpegGrid(info, s.turn)!
    const edges = partialEdges(info, s.turn)
    // Whether what's kept reaches into the partial blocks a trim would drop.
    const reaches = edges.length > 0 && (!crop || crop.x < grid.x || crop.y < grid.y)
    const trim = reaches ? `Trim ${edges.map((e) => `${e.px} px from the ${e.edge} edge`).join(' and ')}` : null
    const kept = crop && clip(crop, grid)
    const lossless = !(reaches && s.partial === 'reencode') && (!crop || (kept && onGrid(kept, grid)))
    if (lossless) {
      const total = compose(info.orientation, s.turn)
      const out = kept
        ? { width: kept.width, height: kept.height }
        : { width: size.width - grid.x, height: size.height - grid.y }
      return {
        plan: {
          kind: 'jpegtran',
          ...naming(info, suffix, 'jpg'),
          args: copyArgs(info, out.width, out.height),
          transform: TRANSFORMS[total],
          // jpegtran measures the crop in the picture after trimming.
          crop: kept ? { ...kept, x: kept.x - grid.x, y: kept.y - grid.y } : null,
          trim: edges.length > 0,
        },
        problems: [],
        caption: ['Only the picture’s blocks move; nothing is re-encoded.', ...dropping].join(' '),
        trim,
      }
    }
    if (crop && !(kept && onGrid(kept, grid)))
      notes.push(`Off the ${gridWords(grid)} grid, so the picture is re-encoded.`)
    return pixels(trim)
  }
  return pixels(null)

  function pixels(trim: string | null): Planned {
    const { encoding, note } = s.output ? { encoding: s.output, note: null } : defaultEncoding(info)
    if (note) notes.push(note)
    const ops: PixelOp[] = [
      ...(s.turn !== 1 ? [{ type: 'turn' as const, orientation: s.turn }] : []),
      ...(s.straighten ? [{ type: 'straighten' as const, degrees: s.straighten }] : []),
      ...(crop ? [{ type: 'crop' as const, rect: crop }] : []),
    ]
    const deep = (info.bitDepth ?? 8) > 8
    const lossless = encoding.lossless && info.lossless && !s.straighten && !deep && !info.animation
    if (s.straighten) notes.push('Straightening resamples the picture.')
    if (info.animation) notes.push('Only the first frame is kept.')
    if (deep && encoding.lossless) notes.push(`The result has 8 bits a channel; the source has ${info.bitDepth}.`)
    const out = crop ?? size
    return {
      plan: {
        kind: 'pixels',
        ...naming(info, suffix, EXTENSIONS[encoding.format]),
        args: copyArgs(info, out.width, out.height),
        ops,
        encoding,
        lossless,
      },
      problems: [],
      caption: [
        ...(lossless ? ['The pixels move exactly.'] : []),
        ...notes,
        encodingCaption(encoding),
        ...dropping,
      ].join(' '),
      trim,
    }
  }
}

/** The crop without the partial strip at the left or top that a trim drops; null if nothing is left. */
function clip(crop: Rect, grid: Grid): Rect | null {
  const x = Math.max(crop.x, grid.x)
  const y = Math.max(crop.y, grid.y)
  const [width, height] = [crop.x + crop.width - x, crop.y + crop.height - y]
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

function naming(info: ImageInfo, suffix: string, extension: string) {
  return {
    name: outputName(info.name, suffix, extension),
    type: typeOf(extension),
    exifName: `image.${extension}`,
    source: `source.${extensionOf(info)}`,
  }
}
