import { describe, expect, it } from 'vitest'
import { kindSentence } from './kinds'

describe('kindSentence (SPEC.md 6.1)', () => {
  it('says how long a Motion Photo’s video runs, when its movie header says', () => {
    expect(kindSentence('motion-photo', 2.1333)).toBe('A Motion Photo: a 2.1 s video is stored inside.')
    expect(kindSentence('motion-photo', 1)).toBe('A Motion Photo: a 1 s video is stored inside.')
    expect(kindSentence('motion-photo', null)).toBe('A Motion Photo: a video is stored inside.')
  })

  it('names depth maps and panoramas, and leaves what Picture describes to it', () => {
    expect(kindSentence('portrait-depth')).toBe('Portrait mode: has a depth map.')
    expect(kindSentence('panorama-360')).toBe('A 360° panorama.')
    expect(kindSentence('ultra-hdr')).toBe(null)
  })
})
