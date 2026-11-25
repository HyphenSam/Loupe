import { describe, expect, it } from 'vitest'
import { DEFAULT_STAGE, parseStageSettings, magnifierZoom } from './settings'

describe('parseStageSettings', () => {
  it('reads saved settings', () => {
    expect(parseStageSettings(JSON.stringify({ background: 'checker', magnifier: true, magnification: 16 }))).toEqual({
      background: 'checker',
      magnifier: true,
      magnification: 16,
    })
  })

  it('falls back to the defaults for anything missing, unknown or unreadable', () => {
    expect(DEFAULT_STAGE).toEqual({ background: 'dark', magnifier: false, magnification: 8 })
    expect(parseStageSettings(null)).toEqual(DEFAULT_STAGE)
    expect(parseStageSettings('{oops')).toEqual(DEFAULT_STAGE)
    expect(parseStageSettings(JSON.stringify({ background: 'pink', magnifier: 'yes', magnification: 1000 }))).toEqual(
      DEFAULT_STAGE,
    )
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
