import { describe, expect, it } from 'vitest'
import { decode } from './ctc'

/** Probabilities for each step, putting `p` on the class named and the rest spread evenly. Classes: blank, the
 * characters, then a space. */
function steps(classes: number, picks: [number, number][]): Float32Array {
  const out = new Float32Array(picks.length * classes)
  picks.forEach(([index, p], t) => {
    for (let c = 0; c < classes; c++) out[t * classes + c] = c === index ? p : (1 - p) / (classes - 1)
  })
  return out
}

describe('decode', () => {
  const characters = ['a', 'b']
  const [BLANK, A, B, SPACE] = [0, 1, 2, 3]

  it('takes the likeliest class at each step, merges repeats and drops blanks', () => {
    const probabilities = steps(4, [
      [A, 0.9],
      [A, 0.9],
      [BLANK, 0.9],
      [A, 0.7],
      [B, 0.8],
      [SPACE, 0.6],
      [B, 1],
    ])
    expect(decode(probabilities, characters)).toEqual({ text: 'aab b', confidence: expect.closeTo(0.8) })
  })

  it('finds nothing in blanks, with no confidence', () => {
    expect(decode(steps(4, [[BLANK, 0.9]]), characters)).toEqual({ text: '', confidence: 0 })
  })
})
