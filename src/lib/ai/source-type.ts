/** IPTC's Digital Source Type in plain words (SPEC.md 6.3), for XMP's `Iptc4xmpExt:DigitalSourceType` and
 * C2PA actions' `digitalSourceType` alike. The vocabulary is https://cv.iptc.org/newscodes/digitalsourcetype/
 * (retired terms kept, since old files still carry them), plus C2PA's own two. */

/** `ai`: whether the term says generative AI made the picture or edited it. `capture`: whether it says a
 * camera took it. */
export type SourceType = { term: string; words: string; ai: 'made' | 'edited' | null; capture: boolean }

type Entry = [words: string, ai?: 'made' | 'edited', capture?: true]

export const SOURCE_TYPES: Record<string, Entry> = {
  digitalCapture: ['Captured by a camera', undefined, true],
  computationalCapture: ['Captured by a camera, from several frames combined', undefined, true],
  negativeFilm: ['Scanned from a film negative'],
  positiveFilm: ['Scanned from a slide'],
  print: ['Scanned from a print'],
  minorHumanEdits: ['Lightly edited by a person'], // retired 2024
  humanEdits: ['Edited by a person without generative AI'],
  compositeWithTrainedAlgorithmicMedia: ['Edited with generative AI', 'edited'],
  algorithmicallyEnhanced: ['Enhanced by software without changing what it shows'],
  softwareImage: ['Made by software'], // retired 2022
  digitalArt: ['Digital art made by a person'], // retired 2024
  digitalCreation: ['Made by a person with software, without generative AI'],
  dataDrivenMedia: ['A picture of data, such as a chart'],
  trainedAlgorithmicMedia: ['Made with generative AI', 'made'],
  algorithmicMedia: ['Made by software without training data'],
  screenCapture: ['A screenshot'],
  virtualRecording: ['A recording of a virtual event'],
  // "Any of which may or may not be generative AI": no claim either way.
  composite: ['A composite of several pictures, any of which may be generative AI'],
  compositeCapture: ['A composite of photos'],
  compositeSynthetic: ['A composite including generative AI', 'edited'],
  // C2PA's namespace (http://c2pa.org/digitalsourcetype/).
  empty: ['Empty: it has no content of its own'],
  trainedAlgorithmicData: ['Data for training AI'],
}

/** The term as stated: a URI (either namespace, HTTP or HTTPS), a `digsrctype:` code or the bare term. */
export function sourceType(value: string | null | undefined): SourceType | null {
  const term = value?.trim().replace(/\/+$/, '').split(/[/:]/).at(-1)
  if (!term) return null
  const entry = SOURCE_TYPES[term]
  if (!entry) return { term, words: `Digital source type “${term}”`, ai: null, capture: false }
  return { term, words: entry[0], ai: entry[1] ?? null, capture: !!entry[2] }
}
