/** The stage's views (SPEC.md section 5): which chips the toolbar offers for the open file, and which a
 * tool switches to. */
import type { ImageInfo } from './info'
import type { ToolId } from './tools'

export type StageView = 'picture' | 'map' | 'ela' | 'noise' | 'depth' | 'pano' | 'compare' | 'text'

export const VIEW_LABELS: Record<StageView, string> = {
  picture: 'Picture',
  map: 'Map',
  ela: 'Error levels',
  noise: 'Noise',
  depth: 'Depth',
  pano: '360°',
  compare: 'Compare',
  text: 'Text',
}

/** Views drawn over the picture at its zoom and pan: Forensics' layers and the depth map. */
export const isLayer = (view: StageView): view is 'ela' | 'noise' | 'depth' =>
  view === 'ela' || view === 'noise' || view === 'depth'

const isForensics = (view: StageView) => view === 'ela' || view === 'noise'

/** What decides the chips beyond the file. `picking`: Edit metadata's Location is on Set, so the map is where the
 * new location is placed (SPEC.md 6.7), whether or not the file has one. `layers`: Forensics is open on a picture
 * Loupe shows. `shows`: the stage has a picture to draw the depth map over or to look around. `webgl2`: the
 * browser can draw the 360° view. `compare`: Export is open and has made a result from this file (SPEC.md 6.11).
 * `text`: the Text tool is open and has read the picture (SPEC.md 6.12). */
export type ViewContext = {
  picking?: boolean
  layers?: boolean
  shows?: boolean
  webgl2?: boolean
  compare?: boolean
  text?: boolean
}

export function stageViews(info: ImageInfo | null, context: ViewContext = {}): StageView[] {
  const { picking = false, layers = false, shows = false, webgl2 = false, compare = false, text = false } = context
  const views: StageView[] = ['picture']
  if (!info) return views
  if (info.gps || picking) views.push('map')
  if (shows && info.embedded.some((e) => e.kind === 'depth-map')) views.push('depth')
  if (shows && webgl2 && info.kinds.includes('panorama-360')) views.push('pano')
  if (layers) views.push('ela', 'noise')
  if (compare) views.push('compare')
  if (text && shows) views.push('text')
  return views
}

/** Opening Location switches the stage to Map, and so does coming back to Edit metadata while it sets a
 * location; leaving either switches back to Picture, as does leaving Forensics from one of its layers, Export from
 * Compare, or Text from its boxes. Forensics' layers are switched to by opening their sections. */
export function viewForTool(current: StageView, from: ToolId, to: ToolId, picking = false): StageView {
  if (to === 'location' || (to === 'edit-metadata' && picking)) return 'map'
  if (from === 'location' || (from === 'edit-metadata' && picking)) return 'picture'
  if (from === 'forensics' && isForensics(current)) return 'picture'
  if (from === 'export' && current === 'compare') return 'picture'
  if (from === 'text' && current === 'text') return 'picture'
  return current
}

/** The view to draw: the chosen one if the open file offers it, Picture otherwise. */
export const shownView = (chosen: StageView, info: ImageInfo | null, context: ViewContext = {}): StageView =>
  stageViews(info, context).includes(chosen) ? chosen : 'picture'
