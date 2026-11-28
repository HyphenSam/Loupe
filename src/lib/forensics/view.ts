/** What Forensics' sections say (SPEC.md 6.5), as plain rows, findings and sentences. */
import { formatBytes } from '../format-bytes'
import type { Format } from '../formats'
import type { SamsungTrailer } from '../samsung'
import type { Fingerprint, ThumbnailMatch } from '../protocol'
import type { Finding, Row } from '../summary'
import { dateWords } from '../words'
import type { EditTrail, HistoryStep } from './history'
import { hashDistance, sameness } from './phash'
import type { JpegInfo, Subsampling } from './quant'
import { trailerWords, type Trailer } from './trailer'

const SUBSAMPLING: Record<Subsampling, string | null> = {
  '4:4:4': 'Colour is stored at full resolution.',
  '4:2:2': 'Colour is stored at half the width.',
  '4:2:0': 'Colour is stored at half the width and half the height.',
  '4:4:0': 'Colour is stored at half the height.',
  '4:1:1': 'Colour is stored at a quarter of the width.',
  grey: null,
  other: null,
}

function tablesRow({ tables, tablesName }: JpegInfo): Row {
  if (tables === 'ijg') return { label: 'Tables', value: 'Standard libjpeg tables' }
  if (tables === 'photoshop') return { label: 'Tables', value: tablesName! }
  if (tables === 'known') return { label: 'Tables', value: `${tablesName}’s tables` }
  return {
    label: 'Tables',
    value: 'Custom tables',
    note: 'Not libjpeg’s, Photoshop’s or another encoder’s Loupe knows; cameras and phones often have their own.',
  }
}

/** The Compression section: estimated quality, whose tables, chroma subsampling, progressive or baseline. */
export function compressionRows(jpeg: JpegInfo): Row[] {
  const note = SUBSAMPLING[jpeg.subsampling]
  return [
    { label: 'Quality', value: jpeg.quality === null ? 'Unknown' : `About quality ${jpeg.quality}` },
    tablesRow(jpeg),
    {
      label: 'Chroma',
      value: jpeg.subsampling === 'grey' ? 'Greyscale' : jpeg.subsampling === 'other' ? 'Other' : jpeg.subsampling,
      ...(note ? { note } : {}),
    },
    { label: 'Encoding', value: jpeg.progressive ? 'Progressive' : 'Baseline' },
  ]
}

/** The Edit trail's rows under its finding; the history is listed apart. */
export function editRows(trail: EditTrail): Row[] {
  const rows: Row[] = []
  if (trail.software) rows.push({ label: 'Written by', value: trail.software })
  if (trail.settings.length)
    rows.push({
      label: 'Develop settings',
      value: trail.settings.join(', '),
      ...(trail.settingsBy ? { note: `Set in ${trail.settingsBy}.` } : {}),
    })
  if (trail.samsung?.length)
    rows.push({
      label: 'Samsung Gallery',
      value: trail.samsung.join(', '),
      note: 'Kept in the file so Gallery can undo them.',
    })
  if (trail.ancestors)
    rows.push({ label: 'Made from', value: `${trail.ancestors} other document${trail.ancestors === 1 ? '' : 's'}` })
  for (const mismatch of trail.mismatches) rows.push({ label: 'Dates', value: mismatch })
  return rows
}

/** A history step's line under its action: when, in what, and what it changed. */
export const stepWords = (step: HistoryStep) =>
  [step.when && dateWords(step.when), step.software, step.detail].filter(Boolean).join(' · ')

const WALKED: Format[] = ['jpeg', 'png', 'webp']

/** The Hidden data section's sentence: unknown data after the picture, and Samsung's trailer, which Loupe reads. */
export function hiddenWords(format: Format, trailer: Trailer | null, samsung: SamsungTrailer | null = null): string {
  const size = samsung && formatBytes(samsung.length)
  if (trailer)
    return samsung
      ? `${trailerWords(trailer)} After it comes ${size} of Samsung’s data, which Loupe reads.`
      : trailerWords(trailer)
  if (samsung)
    return `${size} of Samsung’s data after the end of the picture, which Loupe reads. Extract lists what it holds.`
  if (WALKED.includes(format)) return 'Nothing found after the end of the picture.'
  return 'Loupe looks for data after the picture in JPEG, PNG and WebP files.'
}

const bits = (n: number) => `${n} of 64 bits ${n === 1 ? 'differs' : 'differ'}`

/** The Embedded thumbnail section's finding: whether it shows the picture as it is, and what that rests on. */
export function thumbnailFinding(match: ThumbnailMatch): Finding {
  return {
    id: 'thumbnail',
    verdict: match.matches
      ? 'The embedded thumbnail matches the picture.'
      : 'The embedded thumbnail doesn’t match the picture.',
    detail: match.matches ? null : 'It may show it before it was cropped or edited.',
    rests: 'pattern',
    restsWords: match.aspectDiffers
      ? 'Compared by shape: the thumbnail’s is different.'
      : `Compared by perceptual hash: ${bits(match.distance)}.`,
    tool: null,
  }
}

/** What Compare with another image says (SPEC.md 6.5's thresholds). */
export function compareWords(mine: Fingerprint, theirs: Fingerprint): string {
  if (mine.sha256 === theirs.sha256) return 'The same file: every byte is identical.'
  if (!mine.phash) return 'Loupe can’t show this picture, so it can’t compare them.'
  if (!theirs.phash) return 'Loupe can’t show that picture, so it can’t compare them.'
  const distance = hashDistance(mine.phash, theirs.phash)
  const alike = sameness(distance)
  if (alike === 'same') return `Likely the same picture (${bits(distance)}).`
  if (alike === 'similar') return `Possibly similar (${bits(distance)}).`
  return 'Different pictures.'
}
