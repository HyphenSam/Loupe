/** Turns a Plan into output bytes (SPEC.md section 7). Metadata jobs run ExifTool on the original bytes;
 * jpegtran and pixel jobs join in later phases. */
import { concat } from '@/lib/containers'
import { sniff } from '@/lib/formats'
import { blank } from '@/lib/motion'
import type { Plan } from '@/lib/plans/plan'
import type { RunResult } from '@/lib/protocol'
import { toImageInfo } from '@/lib/tags'
import { readTags, writeTags } from './exiftool'

export async function run(plan: Plan, bytes: Uint8Array): Promise<RunResult> {
  const { cut } = plan
  // Blanking keeps every length, so the cut's offsets still hold.
  const blanked = plan.blank ? blank(bytes, plan.blank) : bytes
  const kept = cut ? concat([blanked.subarray(0, cut.offset), blanked.subarray(cut.offset + cut.length)]) : blanked
  const out = plan.args.length ? await writeTags(plan.exifName, kept, plan.args) : kept
  const info = plan.readBack
    ? toImageInfo(
        await readTags(plan.exifName, out),
        { name: plan.name, size: out.length, lastModified: Date.now() },
        sniff(out),
        out,
      )
    : null
  return { blob: new Blob([out as Uint8Array<ArrayBuffer>], { type: plan.type }), info }
}
