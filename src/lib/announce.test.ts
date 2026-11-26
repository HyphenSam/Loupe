import { describe, expect, it } from 'vitest'
import { openingWords } from './announce'

describe('openingWords', () => {
  it('says what opening a file is waiting for, then that its findings are there', () => {
    expect(openingWords(null)).toBe('')
    expect(openingWords({ name: 'holiday.jpg', metadata: false, credentials: false })).toBe(
      'Opening holiday.jpg. Reading metadata…',
    )
    expect(openingWords({ name: 'holiday.jpg', metadata: true, credentials: false })).toBe(
      'Metadata read. Reading Content Credentials…',
    )
    expect(openingWords({ name: 'holiday.jpg', metadata: true, credentials: true })).toBe(
      'holiday.jpg is open. Its findings are listed.',
    )
  })
})
