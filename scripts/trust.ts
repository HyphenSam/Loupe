// Refreshes public/trust/ (SPEC.md section 12): the certificates Content Credentials are checked against,
// bundled so the check works offline and fetches nothing. The output is committed; run `pnpm trust` to
// refresh it. src/media/c2pa.ts loads these files.
//
// - The official C2PA trust list (c2pa-org/conformance-public, linked from
//   https://opensource.contentauthenticity.org/docs/conformance/trust-lists): the anchors of the CAs that
//   issue claim-signing certificates to conforming products, and its list for time-stamping authorities.
// - The Content Authenticity Initiative's interim trust list (ITL), frozen on 1 January 2026 and kept for
//   files signed under it (ChatGPT's and Firefly's older pictures chain to it): its known anchors and its
//   end-entity certificates. The docs say validators may use both but must tell them apart, so the ITL goes
//   in as "user" anchors and the C2PA list as "system" ones. The ITL's store.cfg isn't bundled: it lists
//   EKUs without C2PA's claim-signing one, and the SDK's own default accepts both.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const C2PA = 'https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list'
const ITL = 'https://raw.githubusercontent.com/contentauth/verify-site/main/static/trust'

export const TRUST_SOURCES = [
  { file: 'c2pa-anchors.pem', url: `${C2PA}/C2PA-TRUST-LIST.pem` },
  { file: 'c2pa-tsa-anchors.pem', url: `${C2PA}/C2PA-TSA-TRUST-LIST.pem` },
  { file: 'itl-anchors.pem', url: `${ITL}/anchors.pem` },
  { file: 'itl-allowed.pem', url: `${ITL}/allowed.pem` },
] as const

export type TrustFile = (typeof TRUST_SOURCES)[number]['file']

/** public/trust/trust.json: the day the lists were fetched (for About and the AI check's caption), and
 * each file's source and certificate count. */
export type TrustIndex = { fetched: string; files: { file: TrustFile; url: string; count: number }[] }

/** The PEM's certificates, each once, with LF line endings and nothing between them. Throws when there are
 * none, so a moved list fails the script instead of bundling an error page. */
export function certificates(pem: string): string {
  const found = pem.replace(/\r\n?/g, '\n').match(/-----BEGIN CERTIFICATE-----\n[\s\S]*?\n-----END CERTIFICATE-----/g)
  if (!found) throw new Error('The file has no certificates.')
  return [...new Set(found)].join('\n') + '\n'
}

export function trustIndex(fetched: Date, counts: Partial<Record<TrustFile, number>>): TrustIndex {
  return {
    fetched: fetched.toISOString().slice(0, 10),
    files: TRUST_SOURCES.filter((s) => counts[s.file] !== undefined).map((s) => ({ ...s, count: counts[s.file]! })),
  }
}

if (import.meta.main) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'trust')
  mkdirSync(dir, { recursive: true })
  const counts: Partial<Record<TrustFile, number>> = {}
  for (const source of TRUST_SOURCES) {
    const response = await fetch(source.url)
    if (!response.ok) throw new Error(`${source.url}: ${response.status} ${response.statusText}`)
    const pem = certificates(await response.text())
    writeFileSync(join(dir, source.file), pem)
    counts[source.file] = pem.match(/BEGIN CERTIFICATE/g)!.length
    console.log(`  ${source.file}: ${counts[source.file]} certificates`)
  }
  writeFileSync(join(dir, 'trust.json'), JSON.stringify(trustIndex(new Date(), counts), null, 2) + '\n')
  console.log('  trust.json')
}
