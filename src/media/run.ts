/** Turns a Plan into output bytes (SPEC.md section 7). Metadata jobs run ExifTool on the original bytes. Picture
 * jobs make a bare result, jpegtran moving the JPEG's blocks or the upright pixels decoded, transformed and
 * encoded, then copy the source's metadata onto it with ExifTool under SPEC.md 6.0's rules (`plan.args`). */
import { concat } from '@/lib/containers'
import { sniff } from '@/lib/formats'
import { blank } from '@/lib/motion'
import { transform, type Pixels } from '@/lib/pixels'
import type { MetadataPlan, Plan } from '@/lib/plans/plan'
import type { RunResult } from '@/lib/protocol'
import { toImageInfo } from '@/lib/tags'
import { encode } from './codecs'
import { copyTags, readTags, writeTags } from './exiftool'
import { jpegtran } from './jpegtran'

/** `upright` gives the open picture's upright pixels, which only pixel jobs need. */
export async function run(plan: Plan, bytes: Uint8Array, upright?: () => Promise<Pixels>): Promise<RunResult> {
  if (plan.kind === 'metadata') return runMetadata(plan, bytes)
  const bare =
    plan.kind === 'jpegtran'
      ? await jpegtran(bytes, { transform: plan.transform, crop: plan.crop, trim: plan.trim, perfect: !plan.trim })
      : await encode(transform(await upright!(), plan.ops), plan.encoding)
  const out = await copyTags(plan.exifName, bare, { name: plan.source, data: bytes }, plan.args)
  return { blob: new Blob([out as Uint8Array<ArrayBuffer>], { type: plan.type }), info: null }
}

async function runMetadata(plan: MetadataPlan, bytes: Uint8Array): Promise<RunResult> {
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
