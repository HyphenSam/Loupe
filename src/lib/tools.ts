import type { ImageInfo } from './info'
import { cantEdit } from './plans/pixel-edit'

/** The rail's two groups: tools that only read the file, and tools that make a new one. */
export const GROUPS = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'edit', label: 'Edit' },
] as const

export type GroupId = (typeof GROUPS)[number]['id']

/** The twelve tools, in rail order (SPEC.md section 6). */
export const TOOLS = [
  { id: 'info', label: 'Info', group: 'inspect' },
  { id: 'location', label: 'Location', group: 'inspect' },
  { id: 'ai', label: 'AI check', group: 'inspect' },
  { id: 'privacy', label: 'Privacy', group: 'inspect' },
  { id: 'forensics', label: 'Forensics', group: 'inspect' },
  { id: 'text', label: 'Text', group: 'inspect' },
  { id: 'extract', label: 'Extract', group: 'inspect' },
  { id: 'edit-metadata', label: 'Edit metadata', group: 'edit' },
  { id: 'crop', label: 'Crop and rotate', group: 'edit' },
  { id: 'redact', label: 'Redact', group: 'edit' },
  { id: 'adjust', label: 'Adjust', group: 'edit' },
  { id: 'export', label: 'Export', group: 'edit' },
] as const satisfies readonly { id: string; label: string; group: GroupId }[]

export type ToolId = (typeof TOOLS)[number]['id']

/** The tool a newly opened file starts on. */
export const DEFAULT_TOOL: ToolId = 'info'

/** Why the Text tool can't read a TIFF; the worker refuses with the same words. */
export const NO_TIFF_TEXT = 'Loupe can’t show TIFF pictures yet, so it can’t read their text.'

const PIXEL_TOOLS: ToolId[] = ['crop', 'redact', 'adjust', 'export']

/** Why a tool can't apply to the open file, for its dimmed rail button's tooltip (SPEC.md section 6); null
 * when it can, or while the metadata is still being read. */
export function toolReason(tool: ToolId, info: ImageInfo | null): string | null {
  if (!info) return null
  if (tool === 'location' && !info.gps) return 'This picture has no location.'
  if (tool === 'extract' && !info.embedded.length) return 'Nothing is embedded in this file.'
  if (tool === 'text' && info.format === 'tiff') return NO_TIFF_TEXT
  if (PIXEL_TOOLS.includes(tool)) return cantEdit(info)
  return null
}
