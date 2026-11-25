/** The stage's views (SPEC.md section 5): which chips the toolbar offers for the open file, and which a
 * tool switches to. Error levels, Noise, Depth, 360° and Compare join as their phases arrive. */
import type { ImageInfo } from './info'
import type { ToolId } from './tools'

export type StageView = 'picture' | 'map'

export const VIEW_LABELS: Record<StageView, string> = { picture: 'Picture', map: 'Map' }

/** `picking`: Edit metadata's Location is on Set, so the map is where the new location is placed (SPEC.md
 * 6.7), whether or not the file has one. */
export function stageViews(info: ImageInfo | null, picking = false): StageView[] {
  return info && (info.gps || picking) ? ['picture', 'map'] : ['picture']
}

/** Opening Location switches the stage to Map, and so does coming back to Edit metadata while it sets a
 * location; leaving either switches back to Picture. */
export function viewForTool(current: StageView, from: ToolId, to: ToolId, picking = false): StageView {
  if (to === 'location' || (to === 'edit-metadata' && picking)) return 'map'
  if (from === 'location' || (from === 'edit-metadata' && picking)) return 'picture'
  return current
}

/** The view to draw: the chosen one if the open file offers it, Picture otherwise. */
export const shownView = (chosen: StageView, info: ImageInfo | null, picking = false): StageView =>
  stageViews(info, picking).includes(chosen) ? chosen : 'picture'
