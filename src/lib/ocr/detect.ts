/** The detector's side of reading text (SPEC.md 6.12): the picture as its input, and its probability map as one
 * box per line, following PaddleOCR's DBPostProcess without OpenCV. */
import type { Pixels } from '../pixels'
import { planes, resize } from './image'
import { distance, inside, minAreaRect, orderCorners, unclip } from './quad'
import type { Point, Quad } from './types'

/** How likely each pixel of the detector's input is to be text, 0–1, rows top to bottom. */
export type ProbabilityMap = { width: number; height: number; data: Float32Array }

/** DB post-processing's settings, from the detector's inference.yml (models.json). */
export type DetectorSettings = { threshold: number; boxThreshold: number; unclipRatio: number }

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/** The picture scaled so its long side is at most `maxSide`, each side rounded to a multiple of 32 (the detector
 * halves it five times), as normalised planes. */
export function detectorInput(image: Pixels, maxSide: number): { data: Float32Array; width: number; height: number } {
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height))
  const side = (n: number) => Math.max(32, Math.round(Math.floor(n * ratio) / 32) * 32)
  const [width, height] = [side(image.width), side(image.height)]
  return { data: planes(resize(image, width, height), MEAN, STD), width, height }
}

/** Each 8-connected region of the map above the threshold, as its points: the leftmost and rightmost pixel of each
 * of its rows, which hold its convex hull. */
function regions(map: ProbabilityMap, threshold: number): Point[][] {
  const { width, height, data } = map
  const seen = new Uint8Array(width * height)
  const out: Point[][] = []
  const stack: number[] = []
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || !(data[start] > threshold)) continue
    seen[start] = 1
    stack.push(start)
    const rows = new Map<number, [number, number]>()
    while (stack.length) {
      const i = stack.pop()!
      const [x, y] = [i % width, Math.floor(i / width)]
      const row = rows.get(y)
      if (!row) rows.set(y, [x, x])
      else row.splice(0, 2, Math.min(row[0], x), Math.max(row[1], x))
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [nx, ny] = [x + dx, y + dy]
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const j = ny * width + nx
          if (seen[j] || !(data[j] > threshold)) continue
          seen[j] = 1
          stack.push(j)
        }
    }
    out.push(
      [...rows].flatMap(([y, [x0, x1]]) => [
        { x: x0, y },
        { x: x1, y },
      ]),
    )
  }
  return out
}

/** The map's mean inside the box (PaddleOCR's `box_score_fast`). */
function score(map: ProbabilityMap, quad: Quad): number {
  const xs = quad.map((p) => p.x)
  const ys = quad.map((p) => p.y)
  const [x0, x1] = [Math.max(0, Math.floor(Math.min(...xs))), Math.min(map.width - 1, Math.ceil(Math.max(...xs)))]
  const [y0, y1] = [Math.max(0, Math.floor(Math.min(...ys))), Math.min(map.height - 1, Math.ceil(Math.max(...ys)))]
  let [sum, n] = [0, 0]
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (inside(quad, { x, y })) {
        sum += map.data[y * map.width + x]
        n++
      }
  return n ? sum / n : 0
}

/** One box per line in `picture`'s pixels: each region's smallest rectangle, kept when it's at least 3 px across
 * and the map's mean inside it reaches the box threshold, then grown by the unclip ratio. */
export function findLines(
  map: ProbabilityMap,
  settings: DetectorSettings,
  picture: { width: number; height: number },
): Quad[] {
  const sx = picture.width / map.width
  const sy = picture.height / map.height
  const toPicture = (p: Point) => ({
    x: Math.min(picture.width, Math.max(0, Math.round(p.x * sx))),
    y: Math.min(picture.height, Math.max(0, Math.round(p.y * sy))),
  })
  const out: Quad[] = []
  for (const points of regions(map, settings.threshold)) {
    const rect = minAreaRect(points)
    if (Math.min(rect.width, rect.height) < 3) continue
    const box = orderCorners(rect.corners)
    if (score(map, box) < settings.boxThreshold) continue
    const grown = minAreaRect(unclip(box, settings.unclipRatio))
    if (Math.min(grown.width, grown.height) < 5) continue
    const quad = orderCorners(grown.corners).map(toPicture) as Quad
    if (Math.floor(distance(quad[0], quad[1])) <= 3 || Math.floor(distance(quad[0], quad[3])) <= 3) continue
    out.push(quad)
  }
  return out
}
