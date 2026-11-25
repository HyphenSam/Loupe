/** Privacy's planner (SPEC.md 6.4): the ticked findings into ExifTool's arguments, run on the original bytes. */
import type { ImageInfo } from '../info'
import { outputName } from '../names'
import { EVERYTHING_ARGS, removalArgs, type PrivacyFinding } from '../privacy'
import { extensionOf, typeOf, unwritable } from './metadata'
import type { Planned } from './plan'

export type QuickPick = 'everything' | 'location'

/** The ticks a quick pick makes. */
export const quickPick = (findings: PrivacyFinding[], pick: QuickPick) =>
  findings.filter((f) => pick === 'everything' || f.group === 'location').map((f) => f.id)

const CAPTION = 'Only metadata is removed; the picture’s bytes are copied as they are.'

export function planPrivacy(info: ImageInfo, findings: PrivacyFinding[], ticked: string[]): Planned {
  const cannot = unwritable(info)
  if (cannot) return { plan: null, problems: [cannot], caption: null }
  const extension = extensionOf(info)
  if (!findings.length) return { plan: null, problems: [], caption: null }
  const args = removalArgs(findings, ticked, info.format)
  if (!ticked.length) return { plan: null, problems: ['Tick what to remove.'], caption: CAPTION }
  if (!args.length)
    return {
      plan: null,
      problems: [
        `What’s ticked is in the camera’s maker notes, which a ${info.formatName} file needs to be developed.`,
      ],
      caption: CAPTION,
    }
  // Everything takes the gain map's XMP and MPF with it (CLAUDE.md).
  const gainMap = args === EVERYTHING_ARGS && info.kinds.includes('ultra-hdr')
  return {
    plan: {
      kind: 'metadata',
      name: outputName(info.name, ' (cleaned)', extension),
      type: typeOf(extension),
      exifName: `image.${extension}`,
      args,
      readBack: true,
    },
    problems: [],
    caption: gainMap ? `${CAPTION} The HDR gain map is removed too.` : CAPTION,
  }
}
