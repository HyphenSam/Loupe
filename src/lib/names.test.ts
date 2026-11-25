import { describe, expect, it } from 'vitest'
import { stem } from './names'

describe('stem', () => {
  it('is the name without its last extension (SPEC.md section 8)', () => {
    expect(stem('Anima_00038_.png')).toBe('Anima_00038_')
    expect(stem('photo.final.jpg')).toBe('photo.final')
    expect(stem('README')).toBe('README')
    expect(stem('.png')).toBe('.png')
  })
})
