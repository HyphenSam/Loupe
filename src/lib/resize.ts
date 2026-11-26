/** Export's resize (SPEC.md 6.11, Bytesize's): the size that fits a box, never larger. The resampling itself
 * (Lanczos3 in linear light) is jSquash's, in `src/media/codecs.ts`. */

/** The size that fits inside `maxWidth` × `maxHeight` with the same shape; never larger than it was. */
export function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
