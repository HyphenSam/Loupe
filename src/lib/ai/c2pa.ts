/** Content Credentials as findings (SPEC.md 6.3): the C2PA SDK's manifest store (src/media/c2pa.ts reads
 * it) turned into what the AI check shows and the verdict rests on. Only the types come from the SDK. */
import type { Ingredient, Manifest, ManifestStore, ValidationStatus } from '@contentauth/c2pa-web'
import { MONTHS } from '../words'
import { sourceType } from './source-type'

/** What the C2PA SDK reads from a file (src/media/c2pa.ts): the manifest store, and the thumbnails it
 * carries keyed by resource identifier. */
export type ReadProvenance = { store: ManifestStore; thumbnails: Record<string, Blob> }

/** The SDK as the page uses it; tests pass a fake (src/lib/testing.ts). `read` gives null for a file with no
 * Content Credentials. `bundledOn` is the day the bundled trust lists were fetched ('2026-11-25'). */
export type ProvenanceReader = {
  read(file: File): Promise<ReadProvenance | null>
  bundledOn(): Promise<string>
}

export type CredentialAction = {
  words: string
  source: string | null
  software: string | null
  description: string | null
}
export type CredentialIngredient = { title: string; relationship: string; thumbnail: string | null; signed: boolean }

export type Credentials = {
  /** Trusted: valid and signed by a certificate on a bundled trust list. Untrusted: valid, signer unknown.
   * Invalid: something it signs was changed, or the signature is broken. */
  state: 'trusted' | 'untrusted' | 'invalid'
  /** The list a trusted signer chained to: the C2PA trust list, or the frozen interim one. */
  list: 'c2pa' | 'interim' | null
  /** The signing certificate's organisation ('Adobe Inc.') and common name ('firefly-prod'). */
  signer: string | null
  certificate: string | null
  /** When it was signed, as signed (ISO 8601). */
  time: string | null
  /** The claim generator: the software that wrote the manifest ('OpenAI Media Service API'). */
  generator: string | null
  /** The app an action names as making the picture ('ChatGPT', 'Adobe Firefly'), when one does. */
  app: string | null
  /** What it says made the picture: generative AI, generative AI editing it, or a camera. */
  claim: 'made' | 'edited' | 'capture' | null
  actions: CredentialAction[]
  ingredients: CredentialIngredient[]
  /** Resource identifiers, for the thumbnails src/media/c2pa.ts reads out. */
  thumbnail: string | null
  /** Why it doesn't verify, in plain words. */
  problems: string[]
}

// C2PA 2.x's actions (section 18.13.4.1).
const ACTIONS: Record<string, string> = {
  'c2pa.created': 'Created',
  'c2pa.edited': 'Edited',
  'c2pa.edited.metadata': 'Metadata edited',
  'c2pa.opened': 'Opened',
  'c2pa.placed': 'Placed',
  'c2pa.color_adjustments': 'Colours adjusted',
  'c2pa.cropped': 'Cropped',
  'c2pa.resized': 'Resized',
  'c2pa.filtered': 'Filtered',
  'c2pa.drawing': 'Drawn on',
  'c2pa.orientation': 'Turned or flipped',
  'c2pa.converted': 'Converted',
  'c2pa.transcoded': 'Transcoded',
  'c2pa.repackaged': 'Repackaged',
  'c2pa.published': 'Published',
  'c2pa.redacted': 'Redacted',
  'c2pa.removed': 'Removed',
  'c2pa.deleted': 'Deleted',
  'c2pa.watermarked': 'Watermarked',
  'c2pa.watermarked.bound': 'Watermarked',
  'c2pa.watermarked.unbound': 'Watermarked',
  'c2pa.translated': 'Translated',
  'c2pa.unknown': 'Something else',
}

const RELATIONSHIPS: Record<string, string> = {
  parentOf: 'Edited from',
  componentOf: 'Placed in it',
  inputTo: 'Used as input',
}

const CHANGED = 'The picture was changed after it was signed.'
const PROBLEMS: Record<string, string> = {
  'assertion.dataHash.mismatch': CHANGED,
  'assertion.boxesHash.mismatch': CHANGED,
  'assertion.bmffHash.mismatch': CHANGED,
  'assertion.collectionHash.mismatch': CHANGED,
  'assertion.hashedURI.mismatch': 'Part of the manifest was changed after it was signed.',
  'claimSignature.mismatch': 'The signature doesn’t match what it signs.',
  'claimSignature.missing': 'The manifest isn’t signed.',
  'claimSignature.outsideValidity': 'It was signed outside the certificate’s valid dates.',
  'signingCredential.revoked': 'The signing certificate was revoked.',
  'signingCredential.invalid': 'The signing certificate isn’t valid.',
  'timeStamp.mismatch': 'The timestamp doesn’t match the signature.',
  'claim.missing': 'The manifest is incomplete.',
  'claim.malformed': 'The manifest can’t be read.',
}

type Action = {
  action?: string
  digitalSourceType?: string
  softwareAgent?: string | { name?: string }
  description?: string
}

function actionsOf(manifest: Manifest): Action[] {
  return (manifest.assertions ?? [])
    .filter((a) => /^c2pa\.actions(\.v\d+)?$/.test(a.label))
    .flatMap((a) => (a.data as { actions?: Action[] } | null)?.actions ?? [])
}

/** What the manifest and its parents say about how the picture was made: generative AI anywhere in the line
 * of parents made it; otherwise AI editing, then a camera. */
function claimOf(store: ManifestStore, label: string | null | undefined, seen = new Set<string>()) {
  const manifest = label ? store.manifests?.[label] : undefined
  if (!manifest || seen.has(label!)) return { made: false, edited: false, capture: false }
  seen.add(label!)
  const parents = (manifest.ingredients ?? []).filter((i) => i.relationship === 'parentOf')
  const sources = [
    ...actionsOf(manifest).map((a) => a.digitalSourceType),
    ...parents.map((i) => i.digital_source_type),
  ].map(sourceType)
  const found = {
    made: sources.some((s) => s?.ai === 'made'),
    edited: sources.some((s) => s?.ai === 'edited'),
    capture: sources.some((s) => s?.capture),
  }
  for (const parent of parents) {
    const up = claimOf(store, parent.active_manifest, seen)
    found.made ||= up.made
    found.edited ||= up.edited
    found.capture ||= up.capture
  }
  return found
}

function generatorOf(manifest: Manifest): string | null {
  const info = manifest.claim_generator_info?.[0]
  // A version reads as one ('0.33.1'); a build number ('1027827694:1027827694') is left out.
  if (info?.name)
    return info.version && /^v?\d+(\.\d+)+$/.test(info.version) ? `${info.name} ${info.version}` : info.name
  // Older manifests: 'Adobe_Firefly adobe_c2pa/0.9.5 c2pa-rs/0.31.1'.
  const first = manifest.claim_generator?.split(' ')[0]
  return first ? first.split('/')[0].replace(/_/g, ' ') : null
}

const software = (agent: Action['softwareAgent']) => (typeof agent === 'string' ? agent : (agent?.name ?? null))

// Not problems: an unknown signer is its own state, and a certificate that has expired since signing doesn't
// change what the picture claims. Without a timestamp the SDK checks the certificate against today; one
// signed after expiry is `claimSignature.outsideValidity`, which still counts.
const NOT_PROBLEMS = ['signingCredential.untrusted', 'signingCredential.expired']

function problemsOf(failures: ValidationStatus[]): string[] {
  const words = failures
    .filter((f) => !NOT_PROBLEMS.includes(f.code))
    .map((f) => PROBLEMS[f.code] ?? sentence(f.explanation ?? f.code))
  return [...new Set(words)]
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\.?$/, '.')

const ingredientOf = (i: Ingredient): CredentialIngredient => ({
  title: i.title ?? 'Untitled',
  relationship: RELATIONSHIPS[i.relationship ?? ''] ?? 'Used',
  thumbnail: i.thumbnail?.identifier ?? null,
  signed: !!i.active_manifest,
})

export function credentialsOf(store: ManifestStore): Credentials {
  const manifest: Manifest = store.manifests?.[store.active_manifest ?? ''] ?? {}
  const results = store.validation_results?.activeManifest
  const problems = problemsOf(results?.failure ?? [])
  const trust = (results?.success ?? []).filter((s) => s.code === 'signingCredential.trusted')
  // The SDK calls credentials whose only fault is an expired certificate Invalid; Loupe judges them by their signer.
  const state =
    store.validation_state === 'Trusted'
      ? 'trusted'
      : store.validation_state === 'Valid'
        ? 'untrusted'
        : problems.length
          ? 'invalid'
          : trust.length
            ? 'trusted'
            : 'untrusted'
  // The SDK names the list it found the anchor in: "user" anchors are the interim list (src/media/c2pa.ts).
  const trustedBy = [store.validation_results?.trustListUri ?? '', ...trust.map((s) => s.explanation ?? '')].join(' ')
  const claim = claimOf(store, store.active_manifest)
  const actions = actionsOf(manifest)
  // The app behind the AI claim, or else behind the creation.
  const maker =
    actions.find((a) => sourceType(a.digitalSourceType)?.ai && software(a.softwareAgent)) ??
    actions.find((a) => a.action === 'c2pa.created' && software(a.softwareAgent))
  return {
    state,
    list: state !== 'trusted' ? null : /user|allowed/i.test(trustedBy) ? 'interim' : 'c2pa',
    signer: manifest.signature_info?.issuer ?? null,
    certificate: manifest.signature_info?.common_name ?? null,
    time: manifest.signature_info?.time ?? null,
    generator: generatorOf(manifest),
    app: maker ? software(maker.softwareAgent) : null,
    claim: claim.made ? 'made' : claim.edited ? 'edited' : claim.capture ? 'capture' : null,
    actions: actions.map((a) => ({
      words: ACTIONS[a.action ?? ''] ?? a.action ?? 'Unnamed',
      source: sourceType(a.digitalSourceType)?.words ?? null,
      software: software(a.softwareAgent),
      description: a.description?.trim() || null,
    })),
    ingredients: (manifest.ingredients ?? []).map(ingredientOf),
    thumbnail: manifest.thumbnail?.identifier ?? null,
    problems,
  }
}

/** '25 November 2026' from '2026-11-25'. */
export function dayWords(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** The caption under the validation result: which list the signer is on, and the bundled lists' date. */
export function trustCaption(fetched: string, list: Credentials['list']): string {
  const on = {
    c2pa: 'Its signer is on the C2PA trust list. ',
    interim: 'Its signer is on the Content Authenticity Initiative’s interim trust list, frozen in January 2026. ',
  }
  return `${list ? on[list] : ''}Checked against the trust list bundled on ${dayWords(fetched)}.`
}
