/** Lines in reading order (SPEC.md 6.12). */
import type { TextLine } from './types'

const extent = (line: TextLine) => {
  const ys = line.quad.map((p) => p.y)
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)]
  return { middle: (top + bottom) / 2, height: bottom - top, left: Math.min(...line.quad.map((p) => p.x)) }
}

/** Top to bottom, in rows: a line joins the row when its middle is within half a line's height (the smaller of the
 * two) of the middle of the row's first line. Along a row, left to right, or right to left for vertical lines, as
 * Chinese and Japanese set their columns. */
export function readingOrder(lines: TextLine[]): TextLine[] {
  const measured = lines.map((line) => ({ line, ...extent(line) })).sort((a, b) => a.middle - b.middle)
  const rows: (typeof measured)[] = []
  for (const item of measured) {
    const row = rows.at(-1)
    const first = row?.[0]
    if (row && first && Math.abs(item.middle - first.middle) <= Math.min(item.height, first.height) / 2) row.push(item)
    else rows.push([item])
  }
  return rows.flatMap((row) =>
    row
      .sort((a, b) => (a.line.vertical && b.line.vertical ? b.left - a.left : a.left - b.left))
      .map((item) => item.line),
  )
}
