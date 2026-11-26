export type Size = { width: number; height: number }

/** The image's scale and the viewport position of its top-left corner. */
export type View = { scale: number; x: number; y: number }

export const MAX_SCALE = 8

/** The scale that fits the image in the viewport. Small images stay at 1. */
export function fitScale(image: Size, viewport: Size): number {
  return Math.min(viewport.width / image.width, viewport.height / image.height, 1)
}

/** The image at its fit scale, centred. */
export function fitted(image: Size, viewport: Size): View {
  return clampPan({ scale: fitScale(image, viewport), x: 0, y: 0 }, image, viewport)
}

/** Zooms by `factor` keeping the image point under `point` (viewport
 * pixels) where it is. The scale stays between the fit scale and
 * [`MAX_SCALE`]. */
export function zoomAt(view: View, point: { x: number; y: number }, factor: number, image: Size, viewport: Size): View {
  const scale = Math.min(Math.max(view.scale * factor, fitScale(image, viewport)), MAX_SCALE)
  const imageX = (point.x - view.x) / view.scale
  const imageY = (point.y - view.y) / view.scale
  return clampPan({ scale, x: point.x - imageX * scale, y: point.y - imageY * scale }, image, viewport)
}

/** Centres a side that fits in the viewport; otherwise keeps the image
 * covering the viewport on that side. */
export function clampPan(view: View, image: Size, viewport: Size): View {
  const axis = (offset: number, imageSide: number, viewSide: number) => {
    const scaled = imageSide * view.scale
    if (scaled <= viewSide) return (viewSide - scaled) / 2
    return Math.min(0, Math.max(viewSide - scaled, offset))
  }
  return {
    scale: view.scale,
    x: axis(view.x, image.width, viewport.width),
    y: axis(view.y, image.height, viewport.height),
  }
}

/** A view that brings `box` (image pixels) onto the stage: the same scale, the box centred as far as the picture's
 * edges allow. Null when the whole box is on the stage already. */
export function reveal(
  view: View,
  box: { x: number; y: number; width: number; height: number },
  image: Size,
  viewport: Size,
): View | null {
  const left = view.x + box.x * view.scale
  const top = view.y + box.y * view.scale
  const right = left + box.width * view.scale
  const bottom = top + box.height * view.scale
  if (left >= 0 && top >= 0 && right <= viewport.width && bottom <= viewport.height) return null
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  return clampPan(
    {
      scale: view.scale,
      x: viewport.width / 2 - centre.x * view.scale,
      y: viewport.height / 2 - centre.y * view.scale,
    },
    image,
    viewport,
  )
}

/** How far into the drawn image a stage position `x` is: the left inset a
 * `clip-path` needs to hide the image left of `x`, since the inset is
 * measured from the image's own box, not the stage. */
export function insetLeftOf(x: number, view: View): number {
  return Math.max(0, x - view.x)
}

type Point = { x: number; y: number }

/** Two fingers moving from `from` to `to` (viewport pixels): the scale changes as far as they spread, and the
 * picture's point between them follows their middle, so it zooms and pans at once. The scale stays between the
 * fit scale and [`MAX_SCALE`]. */
export function pinch(view: View, from: [Point, Point], to: [Point, Point], image: Size, viewport: Size): View {
  const apart = ([a, b]: [Point, Point]) => Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const middle = ([a, b]: [Point, Point]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const [m0, m1] = [middle(from), middle(to)]
  const scale = Math.min(Math.max((view.scale * apart(to)) / apart(from), fitScale(image, viewport)), MAX_SCALE)
  const imageX = (m0.x - view.x) / view.scale
  const imageY = (m0.y - view.y) / view.scale
  return clampPan({ scale, x: m1.x - imageX * scale, y: m1.y - imageY * scale }, image, viewport)
}
