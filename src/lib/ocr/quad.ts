/** The geometry of a detected line: the convex hull of a region, its smallest enclosing rectangle, and growing
 * that box as PaddleOCR's DB post-processing does. Points are pixel coordinates, as OpenCV's contours give them. */
import type { Point, Quad } from './types'

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** The points on the convex hull, without collinear ones (Andrew's monotone chain). */
export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const half = (list: Point[]) => {
    const out: Point[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

export type Rect = { centre: Point; width: number; height: number; corners: Point[] }

/** The rectangle of least area holding every point, at any angle (rotating calipers over the hull's edges). */
export function minAreaRect(points: Point[]): Rect {
  const hull = convexHull(points)
  let best: Rect | null = null
  let bestArea = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (!length) continue
    const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    const v = { x: -u.y, y: u.x }
    let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const p of hull) {
      const pu = p.x * u.x + p.y * u.y
      const pv = p.x * v.x + p.y * v.y
      ;[minU, maxU, minV, maxV] = [Math.min(minU, pu), Math.max(maxU, pu), Math.min(minV, pv), Math.max(maxV, pv)]
    }
    const area = (maxU - minU) * (maxV - minV)
    if (area >= bestArea) continue
    bestArea = area
    const at = (pu: number, pv: number) => ({ x: pu * u.x + pv * v.x, y: pu * u.y + pv * v.y })
    best = {
      centre: at((minU + maxU) / 2, (minV + maxV) / 2),
      width: maxU - minU,
      height: maxV - minV,
      corners: [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)],
    }
  }
  if (best) return best
  const p = hull[0] ?? { x: 0, y: 0 }
  return { centre: p, width: 0, height: 0, corners: [p, p, p, p] }
}

/** A box's corners as PaddleOCR's `get_mini_boxes` orders them: of the two leftmost, the upper is the top left and
 * the lower the bottom left; of the two rightmost, the upper is the top right. */
export function orderCorners(corners: Point[]): Quad {
  const [a, b, c, d] = [...corners].sort((p, q) => p.x - q.x)
  const [topLeft, bottomLeft] = b.y > a.y ? [a, b] : [b, a]
  const [topRight, bottomRight] = d.y > c.y ? [c, d] : [d, c]
  return [topLeft, topRight, bottomRight, bottomLeft]
}

/** The rectangle grown on every side by its area × `ratio` ÷ its perimeter. The detector was taught on text shrunk
 * by that much; PaddleOCR grows the polygon with pyclipper, which for a rectangle comes to this. */
export function unclip(quad: Quad, ratio: number): Quad {
  const [p0, p1, p2, p3] = quad
  const width = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const height = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  if (!width || !height) return quad
  const d = (width * height * ratio) / (2 * (width + height))
  const u = { x: ((p1.x - p0.x) / width) * d, y: ((p1.y - p0.y) / width) * d }
  const v = { x: ((p3.x - p0.x) / height) * d, y: ((p3.y - p0.y) / height) * d }
  return [
    { x: p0.x - u.x - v.x, y: p0.y - u.y - v.y },
    { x: p1.x + u.x - v.x, y: p1.y + u.y - v.y },
    { x: p2.x + u.x + v.x, y: p2.y + u.y + v.y },
    { x: p3.x - u.x + v.x, y: p3.y - u.y + v.y },
  ]
}

/** Whether `p` is inside a convex quad ordered clockwise on screen, its edges included. */
export function inside(quad: Quad, p: Point): boolean {
  for (let i = 0; i < 4; i++) if (cross(quad[i], quad[(i + 1) % 4], p) < -1e-9) return false
  return true
}

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
