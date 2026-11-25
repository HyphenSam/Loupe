/** The stage's views (SPEC.md section 5): which chips the toolbar offers for the open file, and which a
 * tool switches to. Error levels, Noise, Depth, 360° and Compare join as their phases arrive. */
import type { ImageInfo } from './info'
import type { ToolId } from './tools'

export type StageView = 'picture' | 'map'

export const VIEW_LABELS: Record<StageView, string> = { picture: 'Picture', map: 'Map' }

export function stageViews(info: ImageInfo | null): StageView[] {
  return info?.gps ? ['picture', 'map'] : ['picture']
}

/** Opening Location switches the stage to Map; leaving it switches back to Picture. */
export function viewForTool(current: StageView, from: ToolId, to: ToolId): StageView {
  if (to === 'location') return 'map'
  if (from === 'location') return 'picture'
  return current
}

/** The view to draw: the chosen one if the open file offers it, Picture otherwise. */
export const shownView = (chosen: StageView, info: ImageInfo | null): StageView =>
  stageViews(info).includes(chosen) ? chosen : 'picture'
