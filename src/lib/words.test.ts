import { describe, expect, it } from 'vitest'
import {
  animationWords,
  aspect,
  colourWords,
  dateWords,
  dimensionsWords,
  exposureWords,
  hdrWords,
  laterWords,
  orientationWords,
  readoutWords,
  zoneWords,
} from './words'

describe('dimensionsWords', () => {
  it('gives the size, megapixels and aspect ratio', () => {
    expect(dimensionsWords(4032, 3024)).toBe('4032 × 3024, 12.2 MP, 4:3')
    expect(dimensionsWords(6000, 4000)).toBe('6000 × 4000, 24 MP, 3:2')
    expect(dimensionsWords(64, 48)).toBe('64 × 48, 0.003 MP, 4:3')
  })
})

describe('aspect', () => {
  it('names common ratios, either way up', () => {
    expect(aspect(1920, 1080)).toBe('16:9')
    expect(aspect(3024, 4032)).toBe('3:4')
    expect(aspect(1000, 1000)).toBe('1:1')
    expect(aspect(1023, 683)).toBe('3:2')
    expect(aspect(2560, 1600)).toBe('16:10')
  })

  it('falls back to a decimal ratio', () => {
    expect(aspect(1000, 377)).toBe('2.65:1')
    expect(aspect(377, 1000)).toBe('1:2.65')
  })
})

describe('orientationWords', () => {
  it('says how the picture is turned to stand upright', () => {
    expect(orientationWords(1)).toBe(null)
    expect(orientationWords(6)).toBe('turned 90° clockwise')
    expect(orientationWords(8)).toBe('turned 90° anticlockwise')
    expect(orientationWords(3)).toBe('turned 180°')
    expect(orientationWords(2)).toBe('mirrored')
    expect(orientationWords(4)).toBe('mirrored top to bottom')
    expect(orientationWords(5)).toBe('mirrored and turned 90° clockwise')
    expect(orientationWords(7)).toBe('mirrored and turned 90° anticlockwise')
  })
})

describe('colourWords', () => {
  it('names the colour space, and the gamut where it’s wide', () => {
    expect(colourWords({ profile: 'Display P3', space: 'display-p3', hdr: null })).toBe('Display P3, wide gamut')
    expect(colourWords({ profile: 'sRGB IEC61966-2.1', space: 'srgb', hdr: null })).toBe('sRGB')
    expect(colourWords({ profile: 'Adobe RGB (1998)', space: 'adobe-rgb', hdr: null })).toBe('Adobe RGB, wide gamut')
    expect(colourWords({ profile: 'Dot Gain 20%', space: 'grey', hdr: null })).toBe('Greyscale (Dot Gain 20%)')
    expect(colourWords({ profile: 'My scanner', space: 'other', hdr: null })).toBe('My scanner')
  })

  it('says when no profile is embedded', () => {
    expect(colourWords({ profile: null, space: 'srgb', hdr: null })).toBe('sRGB (no profile embedded)')
    expect(colourWords({ profile: null, space: null, hdr: null })).toBe('No colour profile, so shown as sRGB')
  })
})

describe('hdrWords', () => {
  it('names the kind of HDR', () => {
    expect(hdrWords('gain-map', true)).toBe('Ultra HDR: has a gain map')
    expect(hdrWords('gain-map', false)).toBe('HDR: has a gain map')
    expect(hdrWords('pq', false)).toBe('HDR, PQ transfer')
    expect(hdrWords('hlg', false)).toBe('HDR, HLG transfer')
    expect(hdrWords(null, false)).toBe(null)
  })
})

describe('animationWords', () => {
  it('gives frames, length and loops', () => {
    expect(animationWords({ frames: 24, duration: 2.4, loops: 'forever' })).toBe('24 frames, 2.4 s, loops forever')
    expect(animationWords({ frames: 3, duration: 0.3, loops: 2 })).toBe('3 frames, 0.3 s, plays 2 times')
    expect(animationWords({ frames: 3, duration: 0, loops: 1 })).toBe('3 frames, plays once')
  })
})

describe('exposureWords', () => {
  it('joins exposure time, aperture, ISO and focal length in one line', () => {
    const exposure = { time: '1/250', aperture: 2.8, iso: 400, bias: null }
    expect(exposureWords(exposure, 35, 52)).toBe('1/250 s · f/2.8 · ISO 400 · 35 mm (52 mm equivalent)')
    expect(exposureWords({ ...exposure, bias: -0.666666 }, 4, null)).toBe('1/250 s · f/2.8 · ISO 400 · −0.7 EV · 4 mm')
    expect(exposureWords({ time: '4', aperture: 14, iso: null, bias: 0 }, null, null)).toBe('4 s · f/14')
    expect(exposureWords({ time: null, aperture: null, iso: null, bias: null }, null, null)).toBe(null)
  })

  it('leaves out an equivalent that adds nothing, and rounds focal lengths', () => {
    expect(exposureWords({ time: null, aperture: null, iso: null, bias: null }, 3.99, 28)).toBe('4 mm (28 mm equivalent)')
    expect(exposureWords({ time: null, aperture: null, iso: null, bias: null }, 50, 50)).toBe('50 mm')
  })
})

describe('dateWords and zoneWords', () => {
  it('writes a date and time in full, with its zone when known', () => {
    expect(dateWords({ local: '2025-03-12T14:32:05', offset: '+13:00' })).toBe('12 March 2025 at 14:32 (UTC+13:00)')
    expect(dateWords({ local: '2025-03-02T09:05:00', offset: null })).toBe('2 March 2025 at 09:05')
    expect(dateWords({ local: '2005-08-03T18:59:18', offset: '-04:00' })).toBe('3 August 2005 at 18:59 (UTC−04:00)')
    expect(zoneWords('+00:00')).toBe('UTC')
  })
})

describe('laterWords', () => {
  const taken = { local: '2025-03-12T14:32:05', offset: '+13:00' }
  it('says how long after it was taken a picture was modified', () => {
    expect(laterWords(taken, { local: '2025-03-15T14:40:00', offset: '+13:00' })).toBe('Modified 3 days after it was taken.')
    expect(laterWords(taken, { local: '2025-03-12T16:32:05', offset: null })).toBe('Modified 2 hours after it was taken.')
    expect(laterWords(taken, { local: '2025-03-12T14:33:05', offset: null })).toBe('Modified 1 minute after it was taken.')
    expect(laterWords(taken, { local: '2027-04-12T14:32:05', offset: null })).toBe('Modified 2 years after it was taken.')
  })

  it('compares in UTC when both offsets are known', () => {
    expect(laterWords(taken, { local: '2025-03-12T04:32:05', offset: '+02:00' })).toBe('Modified 1 hour after it was taken.')
  })

  it('says nothing when it wasn’t later, or a date is missing', () => {
    expect(laterWords(taken, taken)).toBe(null)
    expect(laterWords(taken, { local: '2025-03-12T14:32:30', offset: '+13:00' })).toBe(null)
    expect(laterWords(null, taken)).toBe(null)
  })
})

describe('readoutWords', () => {
  it('gives the position, the hex colour and the values', () => {
    expect(readoutWords(1203, 884, [163, 178, 193, 255], false)).toBe('x 1203, y 884 · #A3B2C1 · 163 178 193')
  })

  it('adds alpha when the picture has transparency', () => {
    expect(readoutWords(0, 0, [0, 15, 255, 128], true)).toBe('x 0, y 0 · #000FFF · 0 15 255 · alpha 128')
  })
})
