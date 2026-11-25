/** The AI check's verdict (SPEC.md 6.3's table): one finding from the strongest source present. Signed
 * Content Credentials that claim something outrank the metadata; metadata that says AI outranks credentials
 * that claim nothing. Patterns in the pixels or the size are never used. */
import type { Rests } from '../summary'
import type { Credentials } from './c2pa'
import type { GeneratorFinding } from './finding'
import { sourceType as sourceTypeOf } from './source-type'

/** The finding at the top of the AI check, with what it rests on in words (DESIGN.md's Finding). */
export type Verdict = { verdict: string; detail: string | null; rests: Rests; restsWords: string }

export type VerdictInput = {
  credentials: Credentials | null
  sourceType: string | null
  generators: GeneratorFinding[]
}

const STATED = 'Stated in the file’s metadata; anyone can add or remove this.'

const CLAIMS = {
  made: { verdict: 'Made with AI', says: 'say it was made with generative AI' },
  edited: { verdict: 'Edited with AI', says: 'say it was edited with generative AI' },
  capture: { verdict: 'Signed by the camera', says: 'say a camera took it,' },
}

function signed(c: Credentials, verdict: string, detail: string): Verdict {
  const by = c.signer ?? c.certificate ?? 'an unnamed signer'
  return c.state === 'trusted'
    ? { verdict, detail, rests: 'signed', restsWords: `Signed by ${by} and verified.` }
    : { verdict, detail, rests: 'unrecognised', restsWords: 'Signed by a signer Loupe doesn’t recognise.' }
}

export function verdict({ credentials: c, sourceType, generators }: VerdictInput): Verdict {
  if (c?.state === 'invalid')
    return {
      verdict: 'Content Credentials don’t verify',
      detail: c.problems.join(' ') || null,
      rests: 'broken',
      restsWords: 'The file was changed after signing, or the signature is broken. What they claim is listed below.',
    }
  const by = c && (c.signer ?? c.certificate ?? 'an unnamed signer')
  if (c?.claim) {
    const claim = CLAIMS[c.claim]
    // 'say a camera took it, in Leica M11-P.', or without the app, 'say a camera took it.'
    const app = c.app ?? c.generator
    const detail = `Content Credentials signed by ${by} ${claim.says}${app ? ` in ${app}` : ''}`
    return signed(c, claim.verdict, detail.replace(/,$/, '') + '.')
  }

  const source = sourceTypeOf(sourceType)
  const named = generators.length ? ` in ${generators[0].name}` : ''
  if (source?.ai)
    return {
      verdict: (source.ai === 'made' ? 'Says it was made with AI' : 'Says it was edited with AI') + named,
      detail: `Its Digital Source Type says “${source.words}”.`,
      rests: 'stated',
      restsWords: STATED,
    }
  if (generators.length) {
    const g = generators[0]
    const settings = g.prompt || g.seed || g.model || g.steps
    const hidden = g.where.every((w) => w.startsWith('the lowest bits'))
    return {
      verdict: `Says it was made with AI in ${g.name}`,
      detail: !settings
        ? `Its metadata names ${g.name}.`
        : hidden
          ? `Its pixels hide ${g.name}’s generation settings.`
          : `Its metadata holds ${g.name}’s generation settings.`,
      rests: 'stated',
      restsWords: STATED,
    }
  }

  if (c) return signed(c, 'No AI markers found', `Content Credentials signed by ${by} don’t mention AI.`)
  return {
    verdict: 'No AI markers found',
    detail: null,
    rests: 'nothing',
    restsWords: 'Most sites remove metadata, so this doesn’t mean it wasn’t made with AI.',
  }
}
