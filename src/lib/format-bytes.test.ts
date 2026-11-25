import { describe, expect, it } from 'vitest'
import { formatBytes, sizeChange } from './format-bytes'

describe('formatBytes', () => {
  it('uses decimal units, as download UIs do', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2_400)).toBe('2 kB')
    expect(formatBytes(38_978_681)).toBe('39.0 MB')
    expect(formatBytes(1_000_000)).toBe('1.0 MB')
  })
})

describe('sizeChange', () => {
  it('says how much smaller or larger a result is than its source, as the exports strip shows it', () => {
    expect(sizeChange(691, 2163)).toBe('−68%')
    expect(sizeChange(1040, 1000)).toBe('+4%')
    expect(sizeChange(1000, 1000)).toBe('Same size')
    expect(sizeChange(1001, 1000)).toBe('Same size')
  })
})
