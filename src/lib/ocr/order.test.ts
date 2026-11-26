import { describe, expect, it } from 'vitest'
import { readingOrder } from './order'
import type { TextLine } from './types'

/** A line `text` in the box x0–x1, y0–y1. */
function line(text: string, x0: number, y0: number, x1: number, y1: number, vertical = false): TextLine {
  return {
    text,
    confidence: 1,
    vertical,
    quad: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  }
}

const texts = (lines: TextLine[]) => readingOrder(lines).map((l) => l.text)

describe('readingOrder', () => {
  it('reads top to bottom', () => {
    expect(texts([line('second', 0, 40, 100, 60), line('first', 0, 0, 100, 20)])).toEqual(['first', 'second'])
  })

  it('reads left to right along a row: lines whose middles are within half a line’s height', () => {
    const lines = [
      line('Coffee', 0, 0, 100, 20),
      line('£3.20', 300, 6, 360, 26), // 6 px lower: the same row
      line('Tea', 0, 30, 60, 50),
      line('£2.80', 300, 26, 360, 46), // a row above Tea’s middle, but within half its height
    ]
    expect(texts([...lines].reverse())).toEqual(['Coffee', '£3.20', 'Tea', '£2.80'])
  })

  it('starts a new row when the middles are further apart', () => {
    expect(texts([line('lower', 0, 12, 50, 32), line('upper', 100, 0, 150, 20)])).toEqual(['upper', 'lower'])
  })

  it('reads vertical lines right to left, as Chinese and Japanese set them', () => {
    const lines = [line('一', 0, 0, 20, 100, true), line('二', 40, 0, 60, 100, true), line('三', 80, 0, 100, 90, true)]
    expect(texts(lines)).toEqual(['三', '二', '一'])
  })
})
