/** Privacy's planner (SPEC.md 6.4): the ticked findings into ExifTool's arguments, run on the original bytes. */
import { FILE_TYPES } from '../file-types'
import type { ImageInfo } from '../info'
import { EXTENSIONS, outputName } from '../names'
import { EVERYTHING_ARGS, removalArgs, type PrivacyFinding } from '../privacy'
import type { Planned } from './plan'

export type QuickPick = 'everything' | 'location'

/** The ticks a quick pick makes. */
export const quickPick = (findings: PrivacyFinding[], pick: QuickPick) =>
  findings.filter((f) => pick === 'everything' || f.group === 'location').map((f) => f.id)

/** ExifTool reads BMP but can't write it. */
const UNWRITABLE = new Set(['bmp'])

const CAPTION = 'Only metadata is removed; the picture’s bytes are copied as they are.'

/** The extension a metadata job's result keeps: the format's, from the bytes, or a raw file's own. */
export function extensionOf(info: ImageInfo): string {
  if (info.format !== 'raw') return EXTENSIONS[info.format]
  return info.name.match(/\.([A-Za-z0-9]+)$/)?.[1].toLowerCase() ?? info.formatName.toLowerCase()
}

const typeOf = (extension: string) =>
  Object.entries(FILE_TYPES).find(([, extensions]) => extensions.includes(`.${extension}`))?.[0] ??
  'application/octet-stream'

export function planPrivacy(info: ImageInfo, findings: PrivacyFinding[], ticked: string[]): Planned {
  const extension = extensionOf(info)
  if (UNWRITABLE.has(extension))
    return { plan: null, problems: [`Loupe can’t change metadata in a ${info.formatName} file.`], caption: null }
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
