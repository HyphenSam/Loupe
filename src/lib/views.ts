/** The stage's views (SPEC.md section 5): which chips the toolbar offers for the open file, and which a
 * tool switches to. Depth, 360° and Compare join as their phases arrive. */
import type { ImageInfo } from './info'
import type { ToolId } from './tools'

export type StageView = 'picture' | 'map' | 'ela' | 'noise'

export const VIEW_LABELS: Record<StageView, string> = {
  picture: 'Picture',
  map: 'Map',
  ela: 'Error levels',
  noise: 'Noise',
}

/** Forensics' layers, drawn over the picture. */
export const isLayer = (view: StageView): view is 'ela' | 'noise' => view === 'ela' || view === 'noise'

/** `picking`: Edit metadata's Location is on Set, so the map is where the new location is placed (SPEC.md
 * 6.7), whether or not the file has one. `layers`: Forensics is open on a picture Loupe shows. */
export function stageViews(info: ImageInfo | null, picking = false, layers = false): StageView[] {
  const views: StageView[] = ['picture']
  if (info && (info.gps || picking)) views.push('map')
  if (info && layers) views.push('ela', 'noise')
  return views
}

/** Opening Location switches the stage to Map, and so does coming back to Edit metadata while it sets a
 * location; leaving either switches back to Picture, as does leaving Forensics from one of its layers. Its
 * layers are switched to by opening their sections. */
export function viewForTool(current: StageView, from: ToolId, to: ToolId, picking = false): StageView {
  if (to === 'location' || (to === 'edit-metadata' && picking)) return 'map'
  if (from === 'location' || (from === 'edit-metadata' && picking)) return 'picture'
  if (from === 'forensics' && isLayer(current)) return 'picture'
  return current
}

/** The view to draw: the chosen one if the open file offers it, Picture otherwise. */
export const shownView = (chosen: StageView, info: ImageInfo | null, picking = false, layers = false): StageView =>
  stageViews(info, picking, layers).includes(chosen) ? chosen : 'picture'
