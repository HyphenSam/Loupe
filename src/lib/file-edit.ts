import type { CropTool } from './crop'
import type { LatLon } from './geo'
import type { ImageInfo } from './info'
import { DEFAULT_ADJUST, type AdjustSettings } from './plans/adjust'
import { fieldsOf, type MetadataFields } from './plans/edit-metadata'
import { DEFAULT_REDACT, type RedactSettings } from './plans/redact'
import type { StagePicture } from './protocol'
import { DEFAULT_TOOL, type ToolId } from './tools'
import type { StageView } from './views'

/** What the page keeps about the file being worked on, all of it starting afresh for the next file. A piece of
 * per-file state belongs here, so adding one is adding it to this type and `freshEdit`. Kept out on purpose, as
 * they carry over to the next file: Forensics' sliders, Export's settings and the Text tool's script. Views and
 * hooks keyed on the file's id (Privacy's, Forensics', Extract's, the Text tool's reads) start afresh by
 * themselves. */
export type FileEdit = {
  /** The `Source` this belongs to; null before any. */
  fileId: number | null
  tool: ToolId
  /** The stage's view as last chosen (views.ts's `shownView` falls back when it isn't on offer). */
  view: StageView
  /** Edit metadata's form; null until the user changes something, when the fields are the file's own. */
  edits: MetadataFields | null
  /** Crop and rotate's settings; null until changed, when `startCrop` gives them. */
  crop: CropTool | null
  redact: RedactSettings
  /** Redact's selected box, by its place in `redact.boxes`; `deleteBox` keeps it on its box. */
  selectedBox: number | null
  adjust: AdjustSettings
  /** The Text tool's selected line, by its place in the read's lines; cleared when a read starts, as lines from two
   * reads have nothing in common. */
  selectedLine: number | null
}

export const freshEdit = (fileId: number | null): FileEdit => ({
  fileId,
  tool: DEFAULT_TOOL,
  view: 'picture',
  edits: null,
  crop: null,
  redact: DEFAULT_REDACT,
  selectedBox: null,
  adjust: DEFAULT_ADJUST,
  selectedLine: null,
})

/** The file the page shows (useSource's `Source`): what of it has arrived. */
export type Shown = { id: number; picture: StagePicture | null; info: ImageInfo | null } | null

// A file shown but with nothing arrived for it may yet fail, and the previous one come back with its state, so
// the state stays the previous file's until the new one's picture or info arrives.
const owner = (edit: FileEdit, shown: Shown) => (shown && (shown.picture || shown.info) ? shown.id : edit.fileId)

/** The state that applies while `shown` is shown: `edit` if it's that file's, else a fresh one. Nothing is thrown
 * away until a change is made, so if the new file fails and the previous one comes back, so does its state. */
export function editFor(edit: FileEdit, shown: Shown): FileEdit {
  const id = owner(edit, shown)
  return id === edit.fileId ? edit : freshEdit(id)
}

export type EditChange = Partial<Omit<FileEdit, 'fileId'>>

/** `change` applied to the state that applies while `shown` is shown. */
export function changeEdit(
  edit: FileEdit,
  shown: Shown,
  change: EditChange | ((current: FileEdit) => EditChange),
): FileEdit {
  const current = editFor(edit, shown)
  return { ...current, ...(typeof change === 'function' ? change(current) : change) }
}

/** Edit metadata's pin placed on the map, on the form as it stands or, unchanged, on the file's own fields. */
export const placePin = (edit: FileEdit, info: ImageInfo, at: LatLon): EditChange => ({
  edits: { ...(edit.edits ?? fieldsOf(info)), location: 'set', lat: at.lat.toFixed(6), lon: at.lon.toFixed(6) },
})

/** Redact's box `index` deleted, the selection staying on the box it was on, or none when that box goes. */
export function deleteBox(edit: FileEdit, index: number): EditChange {
  const { selectedBox } = edit
  return {
    redact: { ...edit.redact, boxes: edit.redact.boxes.filter((_, i) => i !== index) },
    selectedBox:
      selectedBox === null || selectedBox === index ? null : selectedBox > index ? selectedBox - 1 : selectedBox,
  }
}
