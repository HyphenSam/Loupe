import { describe, expect, it } from 'vitest'
import { bytesOf, concat } from './containers'
import { blank, motionVideo } from './motion'

/** An MP4 box: its size, its type and what's in it. */
function box(type: string, ...content: Uint8Array[]): Uint8Array {
  const body = concat(content)
  const out = new Uint8Array(8 + body.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set(bytesOf(type), 4)
  out.set(body, 8)
  return out
}

const u32 = (...values: number[]) => {
  const out = new Uint8Array(values.length * 4)
  values.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v))
  return out
}

/** mvhd version 0: flags, two dates, the timescale and the duration, then the rest left zero. */
const mvhd = (timescale: number, duration: number) => box('mvhd', u32(0, 0, 0, timescale, duration), new Uint8Array(80))

/** Android's `©xyz`: a 16-bit length, the language, then ISO 6709. */
function xyz(text: string) {
  const header = new Uint8Array(4)
  new DataView(header.buffer).setUint16(0, text.length)
  new DataView(header.buffer).setUint16(2, 0x15c7)
  return box('\xa9xyz', header, bytesOf(text))
}

/** 3GPP's `loci`: version and flags, language, a name, role, then longitude, latitude and altitude as 16.16. */
function loci(lat: number, lon: number) {
  const fixed = (v: number) => u32(Math.round(v * 65536) >>> 0)
  return box('loci', u32(0), new Uint8Array([0x15, 0xc7, 0, 0]), fixed(lon), fixed(lat), fixed(0), bytesOf('earth\0\0'))
}

const ftyp = box('ftyp', bytesOf('isom'), u32(0x200), bytesOf('isomiso2avc1mp41'))
const mdat = box('mdat', new Uint8Array(30).fill(9))
// SOI, a scan's header and data, EOI.
const PICTURE = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0x34, 0xff, 0xd9])

const file = (...video: Uint8Array[]) => {
  const mp4 = concat(video)
  return { bytes: concat([PICTURE, mp4]), offset: PICTURE.length, length: mp4.length }
}

describe('motionVideo', () => {
  it('finds the MP4 after the picture, with its duration', () => {
    const { bytes, offset, length } = file(ftyp, mdat, box('moov', mvhd(1000, 2100)))
    expect(motionVideo(bytes, 'jpeg')).toEqual({ offset, length, duration: 2.1, location: null, box: null })
  })

  it('reads Android’s ©xyz location, and where its box is to blank it', () => {
    const where = xyz('-44.9405+168.8263/')
    const { bytes } = file(ftyp, mdat, box('moov', mvhd(600, 600), box('udta', where)))
    const at = bytes.length - where.length
    expect(motionVideo(bytes, 'jpeg')?.location).toEqual({
      lat: -44.9405,
      lon: 168.8263,
      boxes: [{ offset: at, length: where.length }],
    })
  })

  it('reads 3GPP’s loci location', () => {
    const where = loci(51.5, -0.125)
    const { bytes } = file(ftyp, box('moov', mvhd(600, 600), box('udta', where)), mdat)
    expect(motionVideo(bytes, 'jpeg')?.location).toMatchObject({ lat: 51.5, lon: -0.125 })
  })

  it('stops at what follows the video, such as Samsung’s trailer', () => {
    const video = concat([ftyp, box('moov', mvhd(1000, 1000)), mdat])
    const bytes = concat([PICTURE, video, bytesOf('SEFHxxxxjunk'), u32(12), bytesOf('SEFT')])
    expect(motionVideo(bytes, 'jpeg')).toMatchObject({ offset: PICTURE.length, length: video.length })
  })

  it('reads Samsung’s zeros, written when location is off, as no location', () => {
    const { bytes } = file(ftyp, box('moov', mvhd(600, 600), box('udta', xyz('+00.0000+000.0000/'))))
    expect(motionVideo(bytes, 'jpeg')?.location).toBe(null)
  })

  // HEIF's own boxes, then the video in a box of its own: Google's `mpvd` holds the MP4 and nothing else; Samsung's
  // `sefd` holds a name, then the MP4, then Samsung's trailer.
  const heif = (...after: Uint8Array[]) => {
    const head = concat([box('ftyp', bytesOf('heic'), u32(0), bytesOf('mif1heic')), box('meta', u32(0)), mdat])
    return { head, bytes: concat([head, ...after]) }
  }

  it('finds the MP4 in a HEIF file’s mpvd box, with its location', () => {
    const where = xyz('+37.8549-122.4788/')
    const video = concat([ftyp, mdat, box('moov', mvhd(1000, 2800), box('udta', where))])
    const { head, bytes } = heif(box('free', new Uint8Array(4)), box('mpvd', video))
    const offset = head.length + 12 + 8
    expect(motionVideo(bytes, 'heic')).toEqual({
      offset,
      length: video.length,
      duration: 2.8,
      location: {
        lat: 37.8549,
        lon: -122.4788,
        boxes: [{ offset: offset + video.length - where.length, length: where.length }],
      },
      box: 'mpvd',
    })
  })

  it('finds the MP4 in Samsung’s sefd box, after its name', () => {
    const video = concat([ftyp, box('moov', mvhd(1000, 2930)), mdat])
    const name = concat([u32(0), bytesOf('MotionPhoto_Data')])
    const { head, bytes } = heif(box('sefd', name, video, bytesOf('SEFHxxxx'), u32(12), bytesOf('SEFT')))
    expect(motionVideo(bytes, 'heic')).toMatchObject({
      offset: head.length + 8 + name.length,
      length: video.length,
      box: 'sefd',
      duration: 2.93,
    })
  })

  it('is null without an MP4 after the picture, or for formats that hold none', () => {
    expect(motionVideo(PICTURE, 'jpeg')).toBe(null)
    expect(motionVideo(concat([PICTURE, bytesOf('PK\x03\x04 a zip')]), 'jpeg')).toBe(null)
    expect(motionVideo(file(ftyp, mdat).bytes, 'png')).toBe(null)
  })
})

describe('blank', () => {
  it('turns each box into free space of the same size, its contents zeroed, and leaves the rest', () => {
    const where = xyz('+51.5-000.1/')
    const { bytes } = file(ftyp, box('moov', mvhd(600, 600), box('udta', where)))
    const at = bytes.length - where.length
    const out = blank(bytes, [{ offset: at, length: where.length }])
    expect(out.length).toBe(bytes.length)
    expect(out.subarray(0, at)).toEqual(bytes.subarray(0, at))
    expect(String.fromCharCode(...out.subarray(at + 4, at + 8))).toBe('free')
    expect(out.subarray(at, at + 4)).toEqual(bytes.subarray(at, at + 4))
    expect(out.subarray(at + 8).every((b) => b === 0)).toBe(true)
    expect(motionVideo(out, 'jpeg')?.location).toBe(null)
    expect(bytes.subarray(at + 4, at + 8)).toEqual(bytesOf('\xa9xyz'))
  })
})
