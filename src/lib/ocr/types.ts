/** What reading text gives (SPEC.md 6.12). */

export type Point = { x: number; y: number }

/** A line's four corners in the upright picture's pixels: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point]

/** A line of text read from the picture. `confidence` is the mean of its characters' (0–1); `vertical` when it was
 * turned a quarter to be read (vertical Chinese and Japanese). */
export type TextLine = { text: string; confidence: number; quad: Quad; vertical: boolean }

/** How far a read has got: finding the lines (null), then reading line `line` of `lines`. */
export type TextProgress = { line: number; lines: number } | null
