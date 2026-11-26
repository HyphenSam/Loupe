/** The JPEG block grid as it falls on the picture the user is cropping (SPEC.md 6.8): the stored picture's MCUs,
 * turned upright and then by the user's turns and flips. jpegtran can crop losslessly only with the left and
 * top edges on this grid, and can move only whole blocks: a partial row or column of blocks (the stored right
 * and bottom edges, when the size isn't a multiple of the block) can only stay at the right or bottom. */
import type { ImageInfo, Orientation } from './info'
import { compose, edgeAfter, type Edge, type Rect } from './pixels'

/** Block size, and where the first grid line is: after a partial strip that ended up at the left or top. */
export type Grid = { width: number; height: number; x: number; y: number }

type Source = Pick<ImageInfo, 'width' | 'height' | 'orientation' | 'jpeg'>

/** The stored picture's partial edges, how wide each is, and where each ends up after the whole job's turn. */
function partials(info: Source, turn: Orientation) {
  const { mcu } = info.jpeg!
  const total = compose(info.orientation, turn)
  return (
    [
      ['right', info.width % mcu.width],
      ['bottom', info.height % mcu.height],
    ] as const
  )
    .filter(([, px]) => px > 0)
    .map(([stored, px]) => ({ stored, px, to: edgeAfter(stored, total) }))
}

const moves = (to: Edge) => to === 'left' || to === 'top'

export function jpegGrid(info: Source, turn: Orientation): Grid | null {
  if (!info.jpeg) return null
  const { mcu } = info.jpeg
  const sideways = compose(info.orientation, turn) >= 5
  const strips = partials(info, turn).filter((p) => moves(p.to))
  const strip = (edge: Edge) => strips.find((p) => p.to === edge)?.px ?? 0
  return {
    width: sideways ? mcu.height : mcu.width,
    height: sideways ? mcu.width : mcu.height,
    x: strip('left'),
    y: strip('top'),
  }
}

/** The partial edges `turn` would move to the left or top, which jpegtran has to trim, named as the picture stood
 * upright before the user turned it. */
export function partialEdges(info: Source, turn: Orientation): { edge: Edge; px: number }[] {
  if (!info.jpeg) return []
  return partials(info, turn)
    .filter((p) => moves(p.to))
    .map((p) => ({ edge: edgeAfter(p.stored, info.orientation), px: p.px }))
}

/** `start` moved to the nearest grid line at or after `first`, but before `end`. */
function snap(start: number, end: number, size: number, first: number): number {
  if (end <= first) return start
  const below = first + Math.max(0, Math.floor((start - first) / size)) * size
  const above = below + size
  const nearest = start - below <= above - start ? below : above
  return nearest < end ? nearest : below
}

/** The crop with its left and top edges on the grid, its right and bottom where they were. A crop wholly inside
 * the partial strip stays as it is: no grid line can hold it. */
export function snapRect(rect: Rect, grid: Grid): Rect {
  const [right, bottom] = [rect.x + rect.width, rect.y + rect.height]
  if (right <= grid.x || bottom <= grid.y) return rect
  const x = snap(rect.x, right, grid.width, grid.x)
  const y = snap(rect.y, bottom, grid.height, grid.y)
  return { x, y, width: right - x, height: bottom - y }
}

export const onGrid = (rect: Rect, grid: Grid) =>
  rect.x >= grid.x && rect.y >= grid.y && (rect.x - grid.x) % grid.width === 0 && (rect.y - grid.y) % grid.height === 0
