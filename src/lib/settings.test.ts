import { describe, expect, it } from 'vitest'
import {
  parseTextScript,
  DEFAULT_EXPORT,
  DEFAULT_STAGE,
  parseExportSettings,
  parseStageSettings,
  magnifierZoom,
  targetBytes,
} from './settings'

describe('parseStageSettings', () => {
  it('reads saved settings', () => {
    expect(
      parseStageSettings(
        JSON.stringify({ background: 'checker', magnifier: true, magnification: 16, compare: 'side' }),
      ),
    ).toEqual({
      background: 'checker',
      magnifier: true,
      magnification: 16,
      compare: 'side',
    })
  })

  it('falls back to the defaults for anything missing, unknown or unreadable', () => {
    expect(DEFAULT_STAGE).toEqual({ background: 'dark', magnifier: false, magnification: 8, compare: 'slider' })
    expect(parseStageSettings(null)).toEqual(DEFAULT_STAGE)
    expect(parseStageSettings('{oops')).toEqual(DEFAULT_STAGE)
    expect(
      parseStageSettings(
        JSON.stringify({ background: 'pink', magnifier: 'yes', magnification: 1000, compare: 'wipe' }),
      ),
    ).toEqual(DEFAULT_STAGE)
  })
})

describe('magnifierZoom', () => {
  it('steps by doubling between 2× and 32×', () => {
    expect(magnifierZoom(8, 1)).toBe(16)
    expect(magnifierZoom(8, -1)).toBe(4)
    expect(magnifierZoom(32, 1)).toBe(32)
    expect(magnifierZoom(2, -1)).toBe(2)
  })
})

describe('parseExportSettings', () => {
  it('defaults to the same format at the codecs’ own qualities, without metadata (SPEC.md 6.11)', () => {
    expect(DEFAULT_EXPORT).toEqual({
      format: 'same',
      quality: { jpeg: 75, webp: 75, avif: 50, jxl: 75 },
      webpLossless: false,
      jxlLossless: false,
      resize: false,
      maxWidth: 1920,
      maxHeight: 1920,
      target: false,
      targetSize: 500,
      targetUnit: 'kB',
      keepMetadata: false,
    })
  })

  it('reads saved settings, each field falling back to its default when it’s invalid', () => {
    const saved = {
      ...DEFAULT_EXPORT,
      format: 'avif',
      quality: { ...DEFAULT_EXPORT.quality, avif: 40 },
      target: true,
      targetSize: 1.5,
      targetUnit: 'MB',
      keepMetadata: true,
    }
    expect(parseExportSettings(JSON.stringify(saved))).toEqual(saved)
    expect(
      parseExportSettings(
        JSON.stringify({
          format: 'gif',
          quality: { jpeg: 0, webp: 101, avif: 'x' },
          maxWidth: 99999,
          maxHeight: 2.5,
          targetSize: -1,
          targetUnit: 'GB',
          keepMetadata: 'yes',
        }),
      ),
    ).toEqual(DEFAULT_EXPORT)
    expect(parseExportSettings(JSON.stringify({ quality: { jpeg: 60 } })).quality).toEqual({
      ...DEFAULT_EXPORT.quality,
      jpeg: 60,
    })
    expect(parseExportSettings(null)).toEqual(DEFAULT_EXPORT)
    expect(parseExportSettings('{oops')).toEqual(DEFAULT_EXPORT)
  })
})

describe('targetBytes', () => {
  it('counts kB and MB in thousands, as file managers and browsers show sizes', () => {
    expect(targetBytes({ ...DEFAULT_EXPORT, targetSize: 200 })).toBe(200_000)
    expect(targetBytes({ ...DEFAULT_EXPORT, targetSize: 1.5, targetUnit: 'MB' })).toBe(1_500_000)
  })
})

describe('parseTextScript', () => {
  it('keeps a saved script', () => {
    expect(parseTextScript(JSON.stringify({ script: 'korean' }), ['en'])).toBe('korean')
  })

  it('starts from the first language when nothing valid is saved', () => {
    expect(parseTextScript(null, ['uk'])).toBe('cyrillic')
    expect(parseTextScript('{"script":"thai"}', ['ko'])).toBe('korean')
    expect(parseTextScript('not json', ['en'])).toBe('latin-cjk')
  })
})
