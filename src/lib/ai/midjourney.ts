/** Midjourney (SPEC.md 6.3): its PNG downloads hold the prompt, its `--` parameters and `Job ID: <uuid>` in
 * a `Description` text chunk, the account's name in `Author`, and in XMP the Job ID again
 * (`DigitalImageGUID`) and a Digital Source Type. */
import { finding, rows, type Parser } from './finding'

/** Parameters with their own row, by their long and short names. */
const PARAMETERS: [label: string, names: string[]][] = [
  ['Aspect ratio', ['ar', 'aspect']],
  ['Stylize', ['s', 'stylize']],
  ['Chaos', ['c', 'chaos']],
  ['Weird', ['w', 'weird']],
  ['Quality', ['q', 'quality']],
  ['Style', ['style']],
]

export const midjourney: Parser = (t) => {
  const description = t['png:description'] ?? t['xmp:description']
  const [, before, job] = description?.match(/^([\s\S]*?)\s*Job ID:\s*([0-9a-f-]{36})\s*$/i) ?? []
  if (!job) return null
  const at = before.search(/(^|\s)--\w/)
  const prompt = (at < 0 ? before : before.slice(0, at)).trim()
  const parameters = at < 0 ? '' : before.slice(at).trim()
  // '--ar 3:2 --no garnish --v 6' as { ar: '3:2', no: 'garnish', v: '6' }.
  const values = new Map([...parameters.matchAll(/--(\w+)\s*([^-]*?)(?=\s+--|$)/g)].map(([, k, v]) => [k, v.trim()]))
  const value = (...names: string[]) => names.map((n) => values.get(n)).find((v) => v !== undefined) ?? null
  const version =
    value('niji') !== null ? `Niji ${value('niji')}` : value('v', 'version') && `Midjourney ${value('v', 'version')}`
  const where = t['png:description']
    ? `the PNG text chunks “Description”${t['png:author'] ? ' and “Author”' : ''}`
    : 'XMP description'
  return finding('Midjourney', where, {
    prompt: prompt || null,
    negative: value('no') || null,
    model: version || null,
    seed: value('seed', 'sameseed') || null,
    rest: rows([
      ...PARAMETERS.map(([label, names]) => [label, value(...names)] as [string, unknown]),
      ['Parameters', parameters],
      ['Job ID', job],
      ['Account', t['png:author']],
    ]),
  })
}
