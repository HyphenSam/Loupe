import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { certificates, TRUST_SOURCES, trustIndex } from './trust.ts'

const cert = (body: string) => `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`

describe('certificates', () => {
  it('keeps each certificate once, with LF line endings, dropping comments and blank lines between them', () => {
    const pem = `# Some CA\r\n${cert('AAAA\nBBBB').replace(/\n/g, '\r\n')}\r\n\r\nsubject=CN=x\r\n${cert('CCCC')}\r\n${cert('CCCC')}\r\n`
    expect(certificates(pem)).toBe(`${cert('AAAA\nBBBB')}\n${cert('CCCC')}\n`)
  })

  it('refuses a file with no certificates, so a changed URL fails loudly', () => {
    expect(() => certificates('<html>Not found</html>')).toThrow(/no certificates/)
  })
})

describe('TRUST_SOURCES', () => {
  it('has the C2PA trust list and its TSA list as system anchors, and the frozen interim list as user anchors', () => {
    const by = Object.fromEntries(TRUST_SOURCES.map((s) => [s.file, s]))
    expect(by['c2pa-anchors.pem'].url).toMatch(/c2pa-org\/conformance-public\/.*C2PA-TRUST-LIST\.pem$/)
    expect(by['c2pa-tsa-anchors.pem'].url).toMatch(/C2PA-TSA-TRUST-LIST\.pem$/)
    expect(by['itl-anchors.pem'].url).toMatch(/contentauth\/verify-site\/.*\/anchors\.pem$/)
    expect(by['itl-allowed.pem'].url).toMatch(/contentauth\/verify-site\/.*\/allowed\.pem$/)
    for (const s of TRUST_SOURCES) expect(s.url).toMatch(/^https:\/\//)
  })
})

describe('trustIndex', () => {
  it('records the day fetched, each file’s source and how many certificates it holds', () => {
    const index = trustIndex(new Date('2026-11-25T23:30:00Z'), { 'c2pa-anchors.pem': 36 })
    expect(index.fetched).toBe('2026-11-25')
    expect(index.files).toEqual([
      { file: 'c2pa-anchors.pem', url: TRUST_SOURCES.find((s) => s.file === 'c2pa-anchors.pem')!.url, count: 36 },
    ])
  })
})

it('has the bundled trust lists in public/trust/, as pnpm trust writes them', () => {
  const dir = join(import.meta.dirname, '..', 'public', 'trust')
  const index = JSON.parse(readFileSync(join(dir, 'trust.json'), 'utf8'))
  expect(index.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  for (const s of TRUST_SOURCES) {
    expect(existsSync(join(dir, s.file)), s.file).toBe(true)
    const pem = readFileSync(join(dir, s.file), 'utf8')
    expect(pem.match(/BEGIN CERTIFICATE/g)!.length).toBe(
      index.files.find((f: { file: string }) => f.file === s.file).count,
    )
  }
})
