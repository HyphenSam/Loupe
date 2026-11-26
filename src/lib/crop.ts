/** Crop and rotate's state (SPEC.md 6.8) and how each control changes it: the turns and flips, the
 * straightening, the aspect, the lossless grid, and the crop frame dragged or moved by keyboard (DESIGN.md).
 * The frame is in the turned (and straightened) picture's pixels, which is what the planner takes. */
import type { ImageInfo, Orientation } from './info'
import { jpegGrid, snapRect, type Grid } from './mcu'
import { DEFAULT_CROP_ROTATE, gridWords, turnedSize, type CropRotateSettings } from './plans/crop-rotate'
import { flipHorizontal, flipVertical, innerRect, MATRICES, rotateLeft, rotateRight, type Rect } from './pixels'

export type Aspect = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9' | '4:5'

export const ASPECTS: { value: Aspect; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'original', label: 'Original' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '4:5', label: '4:5' },
]

const RATIOS: Record<Exclude<Aspect, 'free' | 'original'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '4:5': 4 / 5,
}

export type CropTool = Pick<CropRotateSettings, 'turn' | 'straighten' | 'partial' | 'output'> & {
  crop: Rect
  aspect: Aspect
  /** The aspect swapped, for portrait. */
  portrait: boolean
  /** The lossless grid switch (JPEG only). */
  snap: boolean
}

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

type Size = { width: number; height: number }

export function startCrop(info: ImageInfo): CropTool {
  return {
    turn: 1,
    straighten: 0,
    crop: { x: 0, y: 0, ...turnedSize(info, 1) },
    aspect: 'free',
    portrait: false,
    snap: true,
    partial: 'trim',
    output: null,
  }
}

export const cropSettings = (tool: CropTool): CropRotateSettings => ({
  ...DEFAULT_CROP_ROTATE,
  turn: tool.turn,
  straighten: tool.straighten,
  crop: tool.crop,
  partial: tool.partial,
  output: tool.output,
})

/** Width over height for the frame, or null when it's free. */
export function ratioOf(tool: CropTool, info: ImageInfo): number | null {
  if (tool.aspect === 'free') return null
  const size = turnedSize(info, tool.turn)
  const ratio = tool.aspect === 'original' ? size.width / size.height : RATIOS[tool.aspect]
  return tool.portrait ? 1 / ratio : ratio
}

/** The block grid the frame snaps to: a JPEG's, with the switch on, when nothing is resampled anyway. */
export const gridOf = (tool: CropTool, info: ImageInfo): Grid | null =>
  tool.snap && !tool.straighten && info.format === 'jpeg' ? jpegGrid(info, tool.turn) : null

export const gridChip = (grid: Grid) => `On the ${gridWords(grid)} grid: lossless`

/** Whether `rect` lies inside the picture once it's turned `degrees` about its centre. */
export function fits(rect: Rect, size: Size, degrees: number): boolean {
  if (rect.width < 1 || rect.height < 1) return false
  const t = (degrees * Math.PI) / 180
  const [cos, sin] = [Math.cos(t), Math.sin(t)]
  const [cx, cy] = [size.width / 2, size.height / 2]
  const e = 1e-6
  return [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ].every(([x, y]) => {
    // The corner measured along the turned picture's own axes.
    const [dx, dy] = [x - cx, y - cy]
    return Math.abs(dx * cos + dy * sin) <= cx + e && Math.abs(-dx * sin + dy * cos) <= cy + e
  })
}

/** The rect with its left and top on the nearest grid lines, its size kept, still inside `size`. */
function snapMove(rect: Rect, grid: Grid, size: Size): Rect {
  const axis = (start: number, side: number, step: number, first: number, room: number) => {
    // The nearest line, the lower one on a tie, as snapRect does.
    let at = first + Math.max(0, Math.ceil((start - first) / step - 0.5)) * step
    while (at + side > room && at - step >= first) at -= step
    return at + side > room ? start : at
  }
  return {
    ...rect,
    x: axis(rect.x, rect.width, grid.width, grid.x, size.width),
    y: axis(rect.y, rect.height, grid.height, grid.y, size.height),
  }
}

/** The rect made `ratio` by moving its bottom edge, or else its right one, if either fits. */
function fixRatio(rect: Rect, ratio: number, size: Size, degrees: number): Rect {
  const taller = { ...rect, height: Math.max(1, Math.round(rect.width / ratio)) }
  if (fits(taller, size, degrees)) return taller
  const narrower = { ...rect, width: Math.max(1, Math.round(rect.height * ratio)) }
  return fits(narrower, size, degrees) ? narrower : rect
}

const round = (r: Rect): Rect => ({
  x: Math.round(r.x) + 0,
  y: Math.round(r.y) + 0,
  width: Math.round(r.x + r.width) - Math.round(r.x),
  height: Math.round(r.y + r.height) - Math.round(r.y),
})

/** As far from `from` towards `to` as stays inside the picture (`from` is inside). */
function approach(from: Rect, to: Rect, size: Size, degrees: number): Rect {
  const at = (t: number) =>
    round({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      width: from.width + (to.width - from.width) * t,
      height: from.height + (to.height - from.height) * t,
    })
  if (fits(at(1), size, degrees)) return at(1)
  if (!fits(from, size, degrees)) return from
  let [lo, hi] = [0, 1]
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (fits(at(mid), size, degrees)) lo = mid
    else hi = mid
  }
  return at(lo)
}

/** The largest frame of the tool's aspect (the picture's own when free) inside the straightened picture. */
function largest(tool: CropTool, info: ImageInfo): Rect {
  const size = turnedSize(info, tool.turn)
  return innerRect(size.width, size.height, tool.straighten, ratioOf(tool, info) ?? size.width / size.height)
}

/** The tool with its frame snapped to the grid, if there is one. */
function snapped(tool: CropTool, info: ImageInfo): CropTool {
  const grid = gridOf(tool, info)
  return grid ? { ...tool, crop: snapMove(tool.crop, grid, turnedSize(info, tool.turn)) } : tool
}

/** A quarter turn or a flip, of the picture and the frame together. */
export function turnCrop(tool: CropTool, info: ImageInfo, how: 'left' | 'right' | 'horizontal' | 'vertical'): CropTool {
  const { width: W, height: H } = turnedSize(info, tool.turn)
  const { x, y, width, height } = tool.crop
  const turns: Record<typeof how, [(t: Orientation) => Orientation, Rect]> = {
    right: [rotateRight, { x: H - (y + height), y: x, width: height, height: width }],
    left: [rotateLeft, { x: y, y: W - (x + width), width: height, height: width }],
    horizontal: [flipHorizontal, { x: W - (x + width), y, width, height }],
    vertical: [flipVertical, { x, y: H - (y + height), width, height }],
  }
  const [turn, crop] = turns[how]
  const quarter = how === 'left' || how === 'right'
  return snapped(
    {
      ...tool,
      turn: turn(tool.turn),
      crop,
      // A frame of a fixed aspect turns with the picture; the original aspect is the turned picture's anyway.
      portrait: quarter && tool.aspect !== 'original' && tool.aspect !== 'free' ? !tool.portrait : tool.portrait,
      // Turns and straightening commute; a mirror makes the picture lean the other way.
      straighten: quarter || !tool.straighten ? tool.straighten : -tool.straighten,
    },
    info,
  )
}

/** Straightening shrinks the frame to the largest of its aspect that shows no blank corners. */
export function straightenCrop(tool: CropTool, info: ImageInfo, degrees: number): CropTool {
  const next = { ...tool, straighten: degrees }
  return snapped({ ...next, crop: largest(next, info) }, info)
}

export function aspectCrop(tool: CropTool, info: ImageInfo, aspect: Aspect, portrait = tool.portrait): CropTool {
  const next = { ...tool, aspect, portrait }
  if (aspect === 'free') return next
  return snapped({ ...next, crop: largest(next, info) }, info)
}

export const snapCrop = (tool: CropTool, info: ImageInfo, snap: boolean): CropTool => snapped({ ...tool, snap }, info)

/** The frame dragged by `handle` from `from` by (dx, dy) picture pixels: kept inside the straightened picture,
 * at its aspect, at least a pixel, with its left and top edges on the grid. */
export function dragCrop(
  tool: CropTool,
  info: ImageInfo,
  from: Rect,
  handle: Handle,
  dx: number,
  dy: number,
): CropTool {
  const size = turnedSize(info, tool.turn)
  const degrees = tool.straighten
  const grid = gridOf(tool, info)
  const ratio = ratioOf(tool, info)
  if (handle === 'move') {
    // One axis then the other, so the frame slides along an edge it meets.
    const across = approach(from, { ...from, x: from.x + dx }, size, degrees)
    const moved = approach(across, { ...across, y: across.y + dy }, size, degrees)
    return { ...tool, crop: grid ? snapMove(moved, grid, size) : moved }
  }
  const [west, east] = [handle.includes('w'), handle.includes('e')]
  const [north, south] = [handle.includes('n'), handle.includes('s')]
  let width = Math.max(1, from.width + (east ? dx : west ? -dx : 0))
  let height = Math.max(1, from.height + (south ? dy : north ? -dy : 0))
  if (ratio) {
    // The side that changed most leads; an edge leads by itself.
    const leadsWidth =
      (west || east) && (!(north || south) || Math.abs(width / from.width - 1) >= Math.abs(height / from.height - 1))
    if (leadsWidth) height = Math.max(1, width / ratio)
    else width = Math.max(1, height * ratio)
  }
  // Anchored at the opposite edge, or about the middle on an axis no handle moves.
  const place = (start: number, side: number, next: number, low: boolean, high: boolean) =>
    low ? start + side - next : high ? start : start + (side - next) / 2
  const to = {
    x: place(from.x, from.width, width, west, east),
    y: place(from.y, from.height, height, north, south),
    width,
    height,
  }
  let crop: Rect
  if (ratio) crop = approach(from, to, size, degrees)
  else {
    // Each axis by itself, so a corner against one edge still moves along the other.
    const across = approach(from, { ...from, x: to.x, width: to.width }, size, degrees)
    crop = approach(across, { ...across, y: to.y, height: to.height }, size, degrees)
  }
  if (grid) {
    crop = snapRect(crop, grid)
    if (ratio) crop = fixRatio(crop, ratio, size, degrees)
  }
  return { ...tool, crop }
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** An arrow key on the frame or a handle (DESIGN.md): the frame or the handle moves a pixel, ten with Shift, or a
 * block where the grid holds that edge; Alt+arrow on the frame resizes it from its right and bottom edges. Null
 * for any other key. */
export function nudgeCrop(
  tool: CropTool,
  info: ImageInfo,
  handle: Handle,
  event: { key: string; shiftKey: boolean; altKey: boolean },
): CropTool | null {
  const arrow = ARROWS[event.key]
  if (!arrow) return null
  const target: Handle = handle === 'move' && event.altKey ? 'se' : handle
  const grid = gridOf(tool, info)
  const many = event.shiftKey ? 10 : 1
  // The grid holds the left and top edges, which only the frame itself and those handles move.
  const held = (edge: 'w' | 'n') => grid && (target === 'move' || target.includes(edge))
  const dx = arrow[0] * many * (held('w') ? grid!.width : 1)
  const dy = arrow[1] * many * (held('n') ? grid!.height : 1)
  return dragCrop(tool, info, tool.crop, target, dx, dy)
}

/** One of More options' fields typed in; a fixed aspect keeps the other side in step. */
export function fieldCrop(tool: CropTool, info: ImageInfo, field: keyof Rect, value: number): CropTool {
  const crop = { ...tool.crop, [field]: value }
  const ratio = ratioOf(tool, info)
  if (ratio && field === 'width') crop.height = Math.max(1, Math.round(value / ratio))
  if (ratio && field === 'height') crop.width = Math.max(1, Math.round(value * ratio))
  return { ...tool, crop }
}

/** The CSS transform that turns the upright picture, centred in its box, as the job will: the turn, then the
 * straightening. */
export function cssTurn(turn: Orientation, degrees: number): string {
  const [a, b, c, d] = MATRICES[turn]
  return `rotate(${degrees}deg) matrix(${a}, ${c}, ${b}, ${d}, 0, 0)`
}

/** The upright picture's pixel under `point` of the turned and straightened one; null outside it. `size` is
 * the upright picture's. */
export function toUpright(
  point: { x: number; y: number },
  turn: Orientation,
  degrees: number,
  size: Size,
): { x: number; y: number } | null {
  const box = turn >= 5 ? { width: size.height, height: size.width } : size
  const [qx, qy] = [point.x - box.width / 2, point.y - box.height / 2]
  const t = (degrees * Math.PI) / 180
  const [cos, sin] = [Math.cos(t), Math.sin(t)]
  // Straightened back, then turned back: a turn's matrix is undone by its transpose.
  const [sx, sy] = [qx * cos + qy * sin, -qx * sin + qy * cos]
  const [a, b, c, d] = MATRICES[turn]
  const x = Math.floor(a * sx + c * sy + size.width / 2)
  const y = Math.floor(b * sx + d * sy + size.height / 2)
  return x >= 0 && y >= 0 && x < size.width && y < size.height ? { x, y } : null
}
