/** Which generator's settings the file carries (SPEC.md 6.3's table), from its text fields and from stealth
 * metadata in its pixels. One parser per generator, tried from the most particular marker to the most
 * general; the first that recognises the file wins, since each front end writes one form. A known
 * generator named only by Software or CreatorTool is the last resort. */
import type { Tag } from '../info'
import { a1111 } from './a1111'
import { comfyui } from './comfyui'
import { drawthings } from './drawthings'
import { finding, json, type GeneratorFinding, type Parser, type Texts } from './finding'
import { fooocus } from './fooocus'
import { invokeai } from './invokeai'
import { midjourney } from './midjourney'
import { novelai } from './novelai'
import type { Stealth } from './stealth'
import { swarmui } from './swarmui'
import { tensorart } from './tensorart'

export type { GeneratorFinding, Lora } from './finding'

const PARSERS: Parser[] = [novelai, tensorart, comfyui, invokeai, swarmui, fooocus, a1111, drawthings, midjourney]

/** Generators that write their name and nothing more, by how Software or CreatorTool names them. */
const KNOWN: [name: string, pattern: RegExp][] = [
  ['Adobe Firefly', /\bFirefly\b/i],
  ['DALL·E', /\bDALL[·\-\s]?E\b/i],
  ['ChatGPT', /\bChatGPT\b/i],
  ['Midjourney', /\bMidjourney\b/i],
  ['Stable Diffusion', /\bStable Diffusion\b/i],
  ['DreamStudio', /\bDreamStudio\b/i],
  ['Leonardo.Ai', /\bLeonardo(\.Ai)?\b/i],
  ['Ideogram', /\bIdeogram\b/i],
  ['Imagen', /\bImagen\b/i],
  ['Gemini', /\bGemini\b/i],
  ['Bing Image Creator', /\bBing Image Creator\b/i],
  ['Microsoft Designer', /\bMicrosoft Designer\b/i],
  ['FLUX', /\bFLUX(\.\d)?\b/],
  ['Krea', /\bKrea\b/i],
  ['Runway', /\bRunway(ML)?\b/i],
  ['NightCafe', /\bNightCafe\b/i],
  ['Craiyon', /\bCraiyon\b/i],
  ['Playground', /\bPlayground ?AI\b/i],
  ['Easy Diffusion', /\bEasy Diffusion\b/i],
  ['ComfyUI', /\bComfyUI\b/i],
  ['InvokeAI', /\bInvokeAI\b/i],
  ['Draw Things', /\bDraw Things\b/i],
  ['Fooocus', /\bFooocus\b/i],
  ['NovelAI', /\bNovelAI\b/i],
]

/** The file's text fields, keyed as the parsers look for them. */
export function textsOf(tags: Tag[]): Texts {
  const texts: Texts = {}
  for (const { family, name, value } of tags) texts[`${family}:${name}`.toLowerCase()] ??= value
  return texts
}

function named(t: Texts): GeneratorFinding | null {
  for (const [key, label] of [
    ['exif:software', 'Software'],
    ['png:software', 'Software'],
    ['xmp:creatortool', 'CreatorTool'],
  ]) {
    const value = t[key]
    const known = value && KNOWN.find(([, pattern]) => pattern.test(value))
    if (known) return finding(known[0], `${label} “${value}”`)
  }
  return null
}

function parse(t: Texts): GeneratorFinding | null {
  for (const parser of PARSERS) {
    const found = parser(t)
    if (found) return found
  }
  return null
}

export function generatorsOf(tags: Tag[]): GeneratorFinding[] {
  const t = textsOf(tags)
  const found = parse(t) ?? named(t)
  return found ? [found] : []
}

/** Stealth text as the fields it stands for: NovelAI's JSON of its PNG text chunks, or the `parameters` text
 * (A1111's, or SwarmUI's JSON). */
function stealthTexts(text: string): Texts {
  const object = json(text)
  if (!object || 'sui_image_params' in object) return { 'png:parameters': text }
  const texts: Texts = {}
  for (const [key, value] of Object.entries(object))
    if (typeof value === 'string' || typeof value === 'number')
      texts[`png:${key.toLowerCase().replace(/ /g, '_')}`] = String(value)
  return texts
}

/** `found` with what the pixels' stealth metadata says: where it was added to a generator already found, or
 * a generator of its own. */
export function withStealth(found: GeneratorFinding[], stealth: Stealth | null): GeneratorFinding[] {
  if (!stealth) return found
  const hidden = parse(stealthTexts(stealth.text))
  if (!hidden) return found
  const where = `the lowest bits of the ${stealth.channel === 'alpha' ? 'alpha channel' : 'red, green and blue channels'}`
  const same = found.find((g) => g.name === hidden.name)
  if (same) return found.map((g) => (g === same ? { ...g, where: [...g.where, where] } : g))
  return [...found, { ...hidden, where: [where] }]
}
