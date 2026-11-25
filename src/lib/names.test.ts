import { describe, expect, it } from 'vitest'
import { EXTENSIONS, outputName, stem, uniqueName } from './names'

describe('stem', () => {
  it('is the name without its last extension (SPEC.md section 8)', () => {
    expect(stem('Anima_00038_.png')).toBe('Anima_00038_')
    expect(stem('photo.final.jpg')).toBe('photo.final')
    expect(stem('README')).toBe('README')
    expect(stem('.png')).toBe('.png')
  })
})

describe('outputName', () => {
  it('is the stem, the suffix and the extension', () => {
    expect(outputName('IMG_0001.HEIC', ' (cleaned)', 'jpg')).toBe('IMG_0001 (cleaned).jpg')
    expect(outputName('photo.final.jpg', ' (cleaned)', 'jpg')).toBe('photo.final (cleaned).jpg')
  })

  it('never puts characters Windows refuses into the parts it makes', () => {
    expect(outputName('a.png', ' (x:y?)', 'p<n>g')).toBe('a (xy).png')
  })
})

describe('uniqueName', () => {
  it('numbers repeats in the exports strip, ignoring case', () => {
    expect(uniqueName('a (cleaned).jpg', [])).toBe('a (cleaned).jpg')
    expect(uniqueName('a (cleaned).jpg', ['A (Cleaned).JPG'])).toBe('a (cleaned) (2).jpg')
    expect(uniqueName('a (cleaned).jpg', ['a (cleaned).jpg', 'a (cleaned) (2).jpg'])).toBe('a (cleaned) (3).jpg')
  })
})

describe('EXTENSIONS', () => {
  it('names each written format’s extension', () => {
    expect(EXTENSIONS).toMatchObject({ jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', jxl: 'jxl' })
  })
})
