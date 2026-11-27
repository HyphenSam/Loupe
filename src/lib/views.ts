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

/** What changes the stage's view: the user choosing a chip or a Forensics section, moving between tools, Edit
 * metadata's Location going to or from Set, the Text tool finding lines, and the views on offer changing. */
export type ViewEvent =
  | { type: 'choose'; view: StageView }
  | { type: 'tool'; from: ToolId; to: ToolId; picking: boolean }
  | { type: 'picking'; picking: boolean }
  | { type: 'lines' }
  | { type: 'offered'; views: StageView[] }

/** The chosen view after `event` (SPEC.md section 5). Opening Location switches to Map, and so does coming back to
 * Edit metadata while it sets a location; leaving either switches back to Picture, as does leaving Forensics from one
 * of its layers, Export from Compare, or Text from its boxes. A view no longer on offer is forgotten, so it never
 * comes back by itself when it's offered again. */
export function nextView(chosen: StageView, event: ViewEvent): StageView {
  switch (event.type) {
    case 'choose':
      return event.view
    case 'picking':
      return event.picking ? 'map' : chosen === 'map' ? 'picture' : chosen
    case 'lines':
      return 'text'
    case 'offered':
      return event.views.includes(chosen) ? chosen : 'picture'
    case 'tool': {
      const { from, to, picking } = event
      if (to === 'location' || (to === 'edit-metadata' && picking)) return 'map'
      if (from === 'location' || (from === 'edit-metadata' && picking)) return 'picture'
      if (from === 'forensics' && isForensics(chosen)) return 'picture'
      if (from === 'export' && chosen === 'compare') return 'picture'
      if (from === 'text' && chosen === 'text') return 'picture'
      return chosen
    }
  }
}

/** The view to draw: the chosen one if it's on offer, Picture otherwise, until the `offered` event forgets it. */
export const shownView = (chosen: StageView, info: ImageInfo | null, context: ViewContext = {}): StageView =>
  stageViews(info, context).includes(chosen) ? chosen : 'picture'
