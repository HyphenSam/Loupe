import { describe, expect, it } from 'vitest'
import { ACCEPT, FILE_TYPES } from './file-types'

// SPEC.md section 3: what Loupe opens.
const PICTURES = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.jxl', '.gif', '.bmp', '.tif', '.tiff']
const RAW = ['.dng', '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.sr2', '.raf', '.orf', '.rw2', '.pef', '.srw']
const MORE_RAW = ['.3fr', '.iiq', '.x3f']

describe('FILE_TYPES', () => {
  it('lists every extension SPEC.md section 3 accepts', () => {
    const extensions = Object.values(FILE_TYPES).flat()
    for (const extension of [...PICTURES, ...RAW, ...MORE_RAW]) expect(extensions).toContain(extension)
  })

  it('writes extensions as the manifest wants them: lower case, with the dot, each once', () => {
    const extensions = Object.values(FILE_TYPES).flat()
    for (const extension of extensions) expect(extension).toMatch(/^\.[a-z0-9]+$/)
    expect(new Set(extensions).size).toBe(extensions.length)
  })

  it('keys each by a MIME type', () => {
    for (const type of Object.keys(FILE_TYPES)) expect(type).toMatch(/^image\/[\w.+-]+$/)
    expect(FILE_TYPES['image/jpeg']).toContain('.jpg')
    expect(FILE_TYPES['image/heic']).toContain('.heic')
    expect(FILE_TYPES['image/jxl']).toContain('.jxl')
  })
})

describe('ACCEPT', () => {
  it('names both the MIME types and the extensions, so pickers show every file Loupe opens', () => {
    const accepted = ACCEPT.split(',')
    expect(accepted).toContain('image/heic')
    expect(accepted).toContain('.heic')
    expect(accepted).toContain('.nef')
    expect(accepted).toHaveLength(Object.keys(FILE_TYPES).length + Object.values(FILE_TYPES).flat().length)
  })
})
