/** What a tool's planner hands the worker (SPEC.md section 7): everything the job needs, worked out on the
 * page, so the worker only carries it out (`src/media/run.ts`). Lossless JPEG turns and pixel edits join in
 * later phases. */

/** A metadata job: ExifTool runs `args` on the original bytes, so the picture's bytes are copied as they are.
 * `exifName` is what ExifTool calls the file: its extension says the format, which for a few formats ExifTool
 * reads from the name, so it comes from the bytes rather than the user's file name. `readBack` reads the
 * result again, for Privacy to say what's left. */
export type MetadataPlan = {
  kind: 'metadata'
  name: string
  type: string
  exifName: string
  args: string[]
  readBack: boolean
}

export type Plan = MetadataPlan

/** Whether a plan keeps every pixel of the picture (SPEC.md 6.0). Metadata jobs always do. */
export const isLossless = (plan: Plan) => plan.kind === 'metadata'

/** What a planner returns: a plan, or the problems that stop one (full sentences, shown above the disabled
 * action), and the caption under the Lossless or Re-encodes badge. */
export type Planned = { plan: Plan | null; problems: string[]; caption: string | null }
