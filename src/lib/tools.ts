import type { ImageInfo } from './info'

/** The rail's two groups: tools that only read the file, and tools that make a new one. */
export const GROUPS = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'edit', label: 'Edit' },
] as const

export type GroupId = (typeof GROUPS)[number]['id']

/** The eleven tools, in rail order (SPEC.md section 6). */
export const TOOLS = [
  { id: 'info', label: 'Info', group: 'inspect' },
  { id: 'location', label: 'Location', group: 'inspect' },
  { id: 'ai', label: 'AI check', group: 'inspect' },
  { id: 'privacy', label: 'Privacy', group: 'inspect' },
  { id: 'forensics', label: 'Forensics', group: 'inspect' },
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

const PIXEL_TOOLS: ToolId[] = ['crop', 'redact', 'adjust', 'export']

/** Why a tool can't apply to the open file, for its dimmed rail button's tooltip (SPEC.md section 6); null
 * when it can, or while the metadata is still being read. */
export function toolReason(tool: ToolId, info: ImageInfo | null): string | null {
  if (!info) return null
  if (tool === 'location' && !info.gps) return 'This picture has no location.'
  if (tool === 'extract' && !info.embedded.length) return 'Nothing is embedded in this file.'
  if (PIXEL_TOOLS.includes(tool) && (info.format === 'tiff' || info.format === 'raw'))
    return 'Loupe can’t edit TIFF or raw pictures. Extract the preview to edit that instead.'
  return null
}
