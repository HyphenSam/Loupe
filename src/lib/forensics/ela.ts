/** Error levels (SPEC.md 6.5): how much each pixel's brightness changed when the picture was saved again as
 * a JPEG. Parts saved a different number of times, or pasted in from elsewhere, can change more or less than
 * the rest. The re-save itself is src/media's; this compares the two. Brightness rather than each channel:
 * colour is stored coarser and changes most at every save, which drowns the difference (measured in
 * src/media/layers.test.ts). */
import type { Pixels } from '../pixels'
import type { Grey } from './layer'

/** Each pixel's change in luma (Rec. 601) between the picture and its re-saved copy. */
export function errorLevels(original: Pixels, resaved: Pixels): Grey {
  if (original.width !== resaved.width || original.height !== resaved.height)
    throw new Error('The re-saved picture isn’t the same size as the picture.')
  const a = original.data
  const b = resaved.data
  const data = new Uint8Array(original.width * original.height)
  for (let p = 0, i = 0; p < data.length; p++, i += 4)
    data[p] = Math.round(
      Math.abs(0.299 * (a[i] - b[i]) + 0.587 * (a[i + 1] - b[i + 1]) + 0.114 * (a[i + 2] - b[i + 2])),
    )
  return { width: original.width, height: original.height, data }
}
