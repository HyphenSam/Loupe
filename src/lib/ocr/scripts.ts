/** The Text tool's scripts (SPEC.md 6.12): one recogniser each, read with the shared detector. Adding one is a row
 * here and one in scripts/ocr.ts. */

export type Script = 'latin-cjk' | 'korean' | 'cyrillic'

/** `label` names it in the Script select; `reads` finishes "Try another script if the text isn't in …". */
export const SCRIPTS: { id: Script; label: string; reads: string }[] = [
  { id: 'latin-cjk', label: 'Latin, Chinese and Japanese', reads: 'Latin letters, Chinese or Japanese' },
  { id: 'korean', label: 'Korean', reads: 'Korean' },
  { id: 'cyrillic', label: 'Cyrillic', reads: 'Cyrillic letters' },
]
