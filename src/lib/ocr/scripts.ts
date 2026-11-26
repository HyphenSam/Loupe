/** The Text tool's scripts (SPEC.md 6.12): one recogniser each, read with the shared detector. Adding one is a row
 * here and one in scripts/ocr.ts. */

export type Script = 'latin-cjk' | 'korean' | 'cyrillic'

export const SCRIPTS: { id: Script; label: string }[] = [
  { id: 'latin-cjk', label: 'Latin, Chinese and Japanese' },
  { id: 'korean', label: 'Korean' },
  { id: 'cyrillic', label: 'Cyrillic' },
]
