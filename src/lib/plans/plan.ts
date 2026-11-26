import type { Range } from '../motion'
import type { PixelOp, Rect } from '../pixels'

/** What a tool's planner hands the worker (SPEC.md section 7): everything the job needs, worked out on the
 * page, so the worker only carries it out (`src/media/run.ts`). */

/** A metadata job: ExifTool runs `args` on the original bytes, so the picture's bytes are copied as they are.
 * `exifName` is what ExifTool calls the file: its extension says the format, which for a few formats ExifTool
 * reads from the name, so it comes from the bytes rather than the user's file name. `readBack` reads the
 * result again, for Privacy to say what's left. `cut` is data after the picture that Loupe cuts out itself before
 * ExifTool runs (Privacy's hidden data): ExifTool's `-Trailer:all=` would take known trailers, a Motion Photo's video
 * or a gain map, with it. `blank` are boxes inside a Motion Photo's video that Loupe turns into free space (its
 * location), keeping every length the same. With no `args`, ExifTool doesn't run. */
export type MetadataPlan = {
  kind: 'metadata'
  name: string
  type: string
  exifName: string
  args: string[]
  cut?: Range
  blank?: Range[]
  readBack: boolean
}

/** jpegtran's turns and flips, transupp.h's names. */
export type JpegTransform =
  'none' | 'flip-horizontal' | 'flip-vertical' | 'transpose' | 'transverse' | 'rotate-90' | 'rotate-180' | 'rotate-270'

/** How a pixel edit's result is written. `quality` is null when it's lossless. */
export type Encoding = { format: 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl'; quality: number | null; lossless: boolean }

/** What a picture edit's result shares: ExifTool copies the source's metadata onto the bare result with
 * `-tagsFromFile <source> ...args`, `source` being what ExifTool calls the source (its extension says the format). */
type PictureJob = { name: string; type: string; exifName: string; source: string; args: string[] }

/** A lossless JPEG job: jpegtran turns, flips and crops the stored blocks (the crop in the turned picture,
 * trimming partial blocks when `trim`). */
export type JpegtranPlan = PictureJob & { kind: 'jpegtran'; transform: JpegTransform; crop: Rect | null; trim: boolean }

/** A pixel job: the upright picture is decoded, `ops` run on it, and it's encoded. `lossless` when every pixel
 * outside the edit survives exactly. */
export type PixelPlan = PictureJob & { kind: 'pixels'; ops: PixelOp[]; encoding: Encoding; lossless: boolean }

/** Export's job (SPEC.md 6.11): the upright picture decoded (converted to sRGB when `srgb`: the format can't carry
 * the profile), resized to `size`, and encoded; with a `target` in bytes, at the highest quality up to the encoding's
 * whose file fits. A `repack` is a PNG written as PNG unresized: oxipng recompresses the file itself, so its bit
 * depth survives, and `args` then run on the repacked file itself rather than after `-tagsFromFile <source>`. With
 * no `args`, ExifTool doesn't run. */
export type ExportPlan = PictureJob & {
  kind: 'export'
  encoding: Encoding
  size: { width: number; height: number } | null
  target: number | null
  srgb: boolean
  repack: boolean
  lossless: boolean
}

export type Plan = MetadataPlan | JpegtranPlan | PixelPlan | ExportPlan

/** Whether a plan keeps every pixel of the picture (SPEC.md 6.0). Metadata jobs and jpegtran's always do. */
export const isLossless = (plan: Plan) => (plan.kind === 'pixels' || plan.kind === 'export' ? plan.lossless : true)

/** What a planner returns: a plan, or the problems that stop one (full sentences, shown above the disabled
 * action), and the caption under the Lossless or Re-encodes badge. */
export type Planned = {
  plan: Plan | null
  problems: string[]
  caption: string | null
  /** Crop and rotate's choice when a turn would move partial JPEG blocks: what trimming them takes ("Trim 7 px
   * from the right edge"), against re-encoding the whole picture. */
  trim?: string | null
}
