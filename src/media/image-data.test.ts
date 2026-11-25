import { describe, expect, it } from 'vitest'
import { imageData } from './image-data'
import { fixture } from './node'

const text = (b: Uint8Array) => String.fromCharCode(...b)

describe('imageData', () => {
  it.each([
    'camera.jpg',
    'png-16-alpha.png',
    'lossy.webp',
    'lossless.webp',
    'anim.gif',
    'photo.jxl',
    'lossless.jxl',
    'photo.heic',
    'photo.avif',
    'scan.tif',
  ])('takes the picture out of %s', (name) => {
    const bytes = fixture(name)
    const data = imageData(bytes)!
    expect(data.length).toBeGreaterThan(0)
    // A bare JPEG XL codestream is all picture.
    expect(data.length).toBeLessThanOrEqual(bytes.length)
  })

  it('leaves out a JPEG’s metadata and keeps its scans', () => {
    const bytes = fixture('camera.jpg')
    const data = imageData(bytes)!
    expect(text(data)).not.toContain('Exif')
    expect([...data.subarray(-2)]).toEqual([0xff, 0xd9])
    const changed = bytes.slice()
    changed[changed.length - 10] ^= 1
    expect(imageData(changed)).not.toEqual(data)
  })

  it('gives nothing for a raw file it can’t take apart', () => {
    expect(imageData(fixture('exiftool/CanonRaw.cr3'))).toBe(null)
  })
})
