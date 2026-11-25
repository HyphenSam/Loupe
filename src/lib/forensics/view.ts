/** What Forensics' Edit trail, Compression and Hidden data sections say (SPEC.md 6.5), as plain rows and
 * sentences. */
import type { Format } from '../formats'
import type { Row } from '../summary'
import { dateWords } from '../words'
import type { EditTrail, HistoryStep } from './history'
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
  if (trail.ancestors)
    rows.push({ label: 'Made from', value: `${trail.ancestors} other document${trail.ancestors === 1 ? '' : 's'}` })
  for (const mismatch of trail.mismatches) rows.push({ label: 'Dates', value: mismatch })
  return rows
}

/** A history step's line under its action: when, in what, and what it changed. */
export const stepWords = (step: HistoryStep) =>
  [step.when && dateWords(step.when), step.software, step.detail].filter(Boolean).join(' · ')

const WALKED: Format[] = ['jpeg', 'png', 'webp']

/** The Hidden data section's sentence. */
export function hiddenWords(format: Format, trailer: Trailer | null): string {
  if (trailer) return trailerWords(trailer)
  if (WALKED.includes(format)) return 'Nothing found after the end of the picture.'
  return 'Loupe looks for data after the picture in JPEG, PNG and WebP files.'
}
