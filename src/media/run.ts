/** Turns a Plan into output bytes (SPEC.md section 7). Metadata jobs run ExifTool on the original bytes. Picture
 * jobs make a bare result, jpegtran moving the JPEG's blocks or the upright pixels decoded, transformed and
 * encoded, then copy the source's metadata onto it with ExifTool under SPEC.md 6.0's rules (`plan.args`). */
import { concat } from '@/lib/containers'
import { sniff } from '@/lib/formats'
import { blank } from '@/lib/motion'
import { transform, type Pixels } from '@/lib/pixels'
import type { ExportPlan, MetadataPlan, Plan } from '@/lib/plans/plan'
import type { RunResult } from '@/lib/protocol'
import { toImageInfo } from '@/lib/tags'
import { fitQuality } from '@/lib/target'
import { encode, repackPng, resize } from './codecs'
import { copyTags, readTags, writeTags } from './exiftool'
import { jpegtran } from './jpegtran'

/** `upright` gives the open picture's upright pixels, which only pixel jobs need; `srgb` the same converted to sRGB,
 * which they take instead for a format that can't carry the colour profile (`plan.srgb`). */
export async function run(
  plan: Plan,
  bytes: Uint8Array,
  upright?: () => Promise<Pixels>,
  srgb?: () => Promise<Pixels>,
): Promise<RunResult> {
  if (plan.kind === 'metadata') return runMetadata(plan, bytes)
  if (plan.kind === 'export') return runExport(plan, bytes, plan.srgb ? srgb! : upright!)
  const bare =
    plan.kind === 'jpegtran'
      ? await jpegtran(bytes, { transform: plan.transform, crop: plan.crop, trim: plan.trim, perfect: !plan.trim })
      : await encode(transform(await (plan.srgb ? srgb! : upright!)(), plan.ops), plan.encoding)
  const out = await copyTags(plan.exifName, bare, { name: plan.source, data: bytes }, plan.args)
  return { blob: blob(out, plan.type), info: null }
}

const blob = (bytes: Uint8Array, type: string) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type })

/** Export (SPEC.md 6.11): a PNG repacked as it is, or the picture resized and encoded, at the highest quality that
 * fits when there's a target. Each try is measured with its metadata, so the file that's kept is under the target. */
async function runExport(plan: ExportPlan, bytes: Uint8Array, pixels: () => Promise<Pixels>): Promise<RunResult> {
  if (plan.repack) {
    const repacked = await repackPng(bytes)
    const out = plan.args.length ? await writeTags(plan.exifName, repacked, plan.args) : repacked
    return { blob: blob(out, plan.type), info: null, fitted: null }
  }
  let picture = await pixels()
  if (plan.size) picture = await resize(picture, plan.size.width, plan.size.height)
  const at = async (quality: number | null) => {
    const bare = await encode(picture, { ...plan.encoding, quality })
    return plan.args.length ? copyTags(plan.exifName, bare, { name: plan.source, data: bytes }, plan.args) : bare
  }
  const { quality } = plan.encoding
  if (plan.target === null || quality === null)
    return { blob: blob(await at(quality), plan.type), info: null, fitted: null }
  const fitted = await fitQuality(at, plan.target, quality)
  return { blob: blob(fitted.bytes, plan.type), info: null, fitted: { quality: fitted.quality, fits: fitted.fits } }
}

async function runMetadata(plan: MetadataPlan, bytes: Uint8Array): Promise<RunResult> {
  const cut = plan.cut ?? []
  // Blanking keeps every length, so the cuts' offsets still hold. The cuts come in file order: keep what's between.
  const blanked = plan.blank ? blank(bytes, plan.blank) : bytes
  const starts = [0, ...cut.map((c) => c.offset + c.length)]
  const kept = cut.length
    ? concat(starts.map((start, i) => blanked.subarray(start, cut[i]?.offset ?? blanked.length)))
    : blanked
  const out = plan.args.length ? await writeTags(plan.exifName, kept, plan.args) : kept
  const info = plan.readBack
    ? toImageInfo(
        await readTags(plan.exifName, out),
        { name: plan.name, size: out.length, lastModified: Date.now() },
        sniff(out),
        out,
      )
    : null
  return { blob: blob(out, plan.type), info }
}
