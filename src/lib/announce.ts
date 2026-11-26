/** What a screen reader is told while a file opens (PRODUCT.md's accessibility): what it's waiting for, then that
 * the findings are there to read. `null` when nothing is open. */
export function openingWords(opening: { name: string; metadata: boolean; credentials: boolean } | null): string {
  if (!opening) return ''
  if (!opening.metadata) return `Opening ${opening.name}. Reading metadata…`
  if (!opening.credentials) return 'Metadata read. Reading Content Credentials…'
  return `${opening.name} is open. Its findings are listed.`
}
