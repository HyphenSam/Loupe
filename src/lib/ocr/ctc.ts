/** The recogniser's output as text (SPEC.md 6.12): greedy CTC decoding, as PaddleOCR's CTCLabelDecode. */

/** The text in `probabilities` (each step's probability for every class, step after step) and its confidence, the
 * mean of its characters' probabilities. The classes are CTC's blank, `characters`, then a space. At each step
 * the likeliest class is taken; a repeat of the step before and blanks are dropped. */
export function decode(probabilities: Float32Array, characters: string[]): { text: string; confidence: number } {
  const classes = characters.length + 2
  if (probabilities.length % classes) throw new Error('The recogniser and its character list don’t match.')
  let text = ''
  let sum = 0
  let count = 0
  let previous = -1
  for (let step = 0; step < probabilities.length / classes; step++) {
    let best = 0
    let p = -1
    for (let c = 0; c < classes; c++) {
      const value = probabilities[step * classes + c]
      if (value > p) [best, p] = [c, value]
    }
    if (best !== 0 && best !== previous) {
      text += best === classes - 1 ? ' ' : characters[best - 1]
      sum += p
      count++
    }
    previous = best
  }
  return { text, confidence: count ? sum / count : 0 }
}
