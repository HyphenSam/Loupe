/** A Motion Photo's video (SPEC.md section 4 and 6.4): the MP4 after the JPEG's picture, how long it runs, and
 * the location it records of its own. ExifTool lists the video but doesn't read inside it (13.42, `-ee`
 * included), so Loupe walks its boxes here. Pure: bytes in, plain data out. */
import { ascii, view } from './containers'
import type { Format } from './formats'
import { pictureEnd } from './forensics/trailer'

export type Range = { offset: number; length: number }

export type MotionVideo = {
  /** Where the MP4 sits in the file. */
  offset: number
  length: number
  /** Seconds, from its movie header. */
  duration: number | null
  /** Its own location, and the boxes that hold it, from the start of the file. */
  location: { lat: number; lon: number; boxes: Range[] } | null
  /** The HEIF box that holds it (Google's `mpvd`, Samsung's `sefd`), or null after a JPEG's picture. ExifTool's
   * `-all=` keeps `mpvd` and removes `sefd`, as it does a JPEG's trailer. */
  box: 'mpvd' | 'sefd' | null
}

type Box = { type: string; start: number; body: number; end: number }

/** The boxes laid end to end from `start` to `end`, stopping at anything that isn't one. */
function boxes(b: Uint8Array, start: number, end: number): Box[] {
  const v = view(b)
  const out: Box[] = []
  let at = start
  while (at + 8 <= end) {
    let size = v.getUint32(at)
    let body = at + 8
    if (size === 1 && at + 16 <= end) {
      size = Number(v.getBigUint64(at + 8))
      body = at + 16
    } else if (size === 0) size = end - at
    const type = ascii(b, at + 4, 4)
    if (size < body - at || at + size > end || !/^[\x20-\x7e\xa9]{4}$/.test(type)) break
    out.push({ type, start: at, body, end: at + size })
    at += size
  }
  return out
}

const child = (b: Uint8Array, parent: Box | undefined, type: string) =>
  parent ? boxes(b, parent.body, parent.end).filter((x) => x.type === type) : []

/** The movie header's duration in seconds. */
function durationOf(b: Uint8Array, mvhd: Box | undefined): number | null {
  if (!mvhd || mvhd.end - mvhd.body < 32) return null
  const v = view(b)
  const version = b[mvhd.body]
  const timescale = v.getUint32(mvhd.body + (version === 1 ? 20 : 12))
  const duration = version === 1 ? Number(v.getBigUint64(mvhd.body + 24)) : v.getUint32(mvhd.body + 16)
  return timescale ? duration / timescale : null
}

/** '-44.9405+168.8263/' (ISO 6709, decimal degrees). */
function iso6709(text: string): { lat: number; lon: number } | null {
  const m = text.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/)
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null
}

/** A location box's position: Android's `©xyz` (a 16-bit length, the language, ISO 6709) or 3GPP's `loci`
 * (language, a name, a role, then longitude and latitude in 16.16 fixed point). */
function locationOf(b: Uint8Array, x: Box): { lat: number; lon: number } | null {
  const v = view(b)
  if (x.type === '\xa9xyz') {
    const length = v.getUint16(x.body)
    return iso6709(ascii(b, x.body + 4, Math.min(length, x.end - x.body - 4)))
  }
  let at = x.body + 6
  while (at < x.end && b[at] !== 0) at++ // the name
  at += 2 // its terminator and the role
  if (at + 8 > x.end) return null
  const round = (n: number) => Math.round(n * 1e6) / 1e6
  return { lon: round(v.getInt32(at) / 65536), lat: round(v.getInt32(at + 4) / 65536) }
}

/** A Motion Photo's MP4, or null without one: after a JPEG's picture, wherever its trailer puts it, or in a HEIF
 * file's box of its own (Google's `mpvd`, or Samsung's `sefd`, which names it first). */
export function motionVideo(b: Uint8Array, format: Format): MotionVideo | null {
  if (format === 'jpeg') {
    const end = pictureEnd(b, format)
    return end === null ? null : mp4In(b, end, b.length, null)
  }
  if (format !== 'heic') return null
  for (const x of boxes(b, 0, b.length))
    if (x.type === 'mpvd' || x.type === 'sefd') {
      const found = mp4In(b, x.body, x.end, x.type)
      if (found) return found
    }
  return null
}

/** The first MP4 that starts between `from` and `to`. */
function mp4In(b: Uint8Array, from: number, to: number, box: MotionVideo['box']): MotionVideo | null {
  for (let at = from; at + 8 <= to; at++) {
    if (b[at + 4] !== 0x66 || ascii(b, at + 4, 4) !== 'ftyp') continue
    const top = boxes(b, at, to)
    const moov = top.find((x) => x.type === 'moov')
    if (top[0]?.type !== 'ftyp' || !moov) continue
    const length = top.at(-1)!.end - at
    const places = child(b, moov, 'udta').flatMap((udta) =>
      boxes(b, udta.body, udta.end).filter((x) => x.type === '\xa9xyz' || x.type === 'loci'),
    )
    // Samsung writes zeros when location is off.
    const found = places.map((x) => locationOf(b, x)).find((p) => p && (p.lat || p.lon))
    return {
      offset: at,
      length,
      duration: durationOf(b, child(b, moov, 'mvhd')[0]),
      location: found ? { ...found, boxes: places.map((x) => ({ offset: x.start, length: x.end - x.start })) } : null,
      box,
    }
  }
  return null
}

/** `b` with each box turned into free space of the same size, its contents zeroed: players skip it, and nothing
 * else in the file moves. */
export function blank(b: Uint8Array, ranges: Range[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(b)
  for (const { offset, length } of ranges) {
    out.set([0x66, 0x72, 0x65, 0x65], offset + 4) // 'free'
    out.fill(0, offset + 8, offset + length)
  }
  return out
}
