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
