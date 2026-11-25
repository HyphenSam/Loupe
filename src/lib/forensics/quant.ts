/** A JPEG's quantisation tables, read from its headers (SPEC.md 6.5): whose tables they are, the quality they
 * stand for, chroma subsampling, progressive or baseline, and the block grid. Pure: bytes in, plain data out.
 *
 * Tables that scale with a quality setting (libjpeg's, MozJPEG's) are matched at every quality; fixed tables
 * (Photoshop's, and devices') are matched as they are, from KNOWN_TABLES, which grows from real samples. */
import { jpegSegments, view } from '../containers'
import { IJG_CHROMA, IJG_LUMA, KNOWN_TABLES, MOZJPEG_CHROMA, MOZJPEG_LUMA, ZIGZAG } from './tables'

export { IJG_CHROMA, IJG_LUMA, KNOWN_TABLES, ZIGZAG }

export type Subsampling = '4:4:4' | '4:2:2' | '4:2:0' | '4:4:0' | '4:1:1' | 'grey' | 'other'

export type JpegInfo = {
  /** 1–100: the quality setting itself when the tables are libjpeg's or MozJPEG's, otherwise the libjpeg
   * quality whose luminance table is closest. */
  quality: number | null
  tables: 'ijg' | 'photoshop' | 'known' | 'custom'
  tablesName: string | null // 'libjpeg', 'Photoshop “Save As” 10 or Lightroom 77–84%', a device's name
  subsampling: Subsampling
  progressive: boolean
  mcu: { width: number; height: number } // the block grid: 8 or 16 px (32 for 4:1:1)
}

/** A table scaled to a quality as libjpeg's `jpeg_quality_scaling` does, before any clamping to 255. */
export function scaleTable(base: number[], quality: number): number[] {
  const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2
  return base.map((v) => Math.min(32767, Math.max(1, Math.floor((v * scale + 50) / 100))))
}

type Family = { tables: JpegInfo['tables']; name: string; luma: number[]; chroma: number[] }

/** Tables that scale with quality. */
const FAMILIES: Family[] = [
  { tables: 'ijg', name: 'libjpeg', luma: IJG_LUMA, chroma: IJG_CHROMA },
  { tables: 'known', name: 'MozJPEG', luma: MOZJPEG_LUMA, chroma: MOZJPEG_CHROMA },
]

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])
/** A scaled table as stored: as is, or clamped to 255 in a baseline JPEG's 8-bit table. */
const matches = (stored: number[], scaled: number[]) =>
  same(stored, scaled) ||
  same(
    stored,
    scaled.map((v) => Math.min(v, 255)),
  )

/** The libjpeg quality whose luminance table is closest to `luma`, by the sum of the differences. */
function estimate(luma: number[]): number {
  let best = { quality: 50, distance: Infinity }
  for (let quality = 1; quality <= 100; quality++) {
    const scaled = scaleTable(IJG_LUMA, quality)
    const distance = luma.reduce((sum, v, i) => sum + Math.abs(v - Math.min(scaled[i], 255)), 0)
    if (distance < best.distance) best = { quality, distance }
  }
  return best.quality
}

/** Whose tables these are and the quality they stand for. `chroma` is null for a greyscale picture. */
export function identifyTables(
  luma: number[],
  chroma: number[] | null,
): Pick<JpegInfo, 'quality' | 'tables' | 'tablesName'> {
  for (const family of FAMILIES)
    for (let quality = 1; quality <= 100; quality++)
      if (
        matches(luma, scaleTable(family.luma, quality)) &&
        (!chroma || matches(chroma, scaleTable(family.chroma, quality)))
      )
        return { quality, tables: family.tables, tablesName: family.name }
  const known = KNOWN_TABLES.find((t) => same(luma, t.luma) && (!chroma || !t.chroma || same(chroma, t.chroma)))
  return { quality: estimate(luma), tables: known?.tables ?? 'custom', tablesName: known?.name ?? null }
}

type Component = { id: number; h: number; v: number; tq: number }

/** The frame headers' markers (SOF0–15 but DHT, JPG and DAC), and which of them are progressive. */
const FRAMES = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
const PROGRESSIVE = new Set([0xc2, 0xc6, 0xca, 0xce])

/** The quantisation tables by slot (natural order), the frame's components and whether it's progressive, from
 * the headers before the first scan; null when the bytes aren't a JPEG. */
export function readJpeg(b: Uint8Array): { tables: number[][]; components: Component[]; progressive: boolean } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null
  const tables: number[][] = []
  let components: Component[] = []
  let progressive = false
  for (const { marker, data } of jpegSegments(b)) {
    if (marker === 0xdb) {
      // One segment can hold several tables, each 8-bit or 16-bit.
      const v = view(data)
      for (let at = 0; at < data.length;) {
        const wide = data[at] >> 4 === 1
        const size = 1 + 64 * (wide ? 2 : 1)
        if (at + size > data.length) break
        const table = new Array<number>(64)
        for (let i = 0; i < 64; i++) table[ZIGZAG[i]] = wide ? v.getUint16(at + 1 + i * 2) : data[at + 1 + i]
        tables[data[at] & 0x0f] = table
        at += size
      }
    } else if (FRAMES.has(marker) && data.length >= 6) {
      progressive = PROGRESSIVE.has(marker)
      components = []
      for (let i = 0; i < data[5] && 6 + i * 3 + 2 < data.length; i++) {
        const at = 6 + i * 3
        components.push({ id: data[at], h: data[at + 1] >> 4, v: data[at + 1] & 0x0f, tq: data[at + 2] })
      }
    }
  }
  return { tables, components, progressive }
}

const SUBSAMPLINGS: Record<string, Subsampling> = { '1x1': '4:4:4', '2x2': '4:2:0', '2x1': '4:2:2', '1x2': '4:4:0', '4x1': '4:1:1' } // prettier-ignore

function subsamplingOf(components: Component[]): Subsampling {
  if (components.length === 1) return 'grey'
  const [y, ...rest] = components
  if (rest.every((c) => c.h === y.h && c.v === y.v)) return '4:4:4'
  if (rest.every((c) => c.h === 1 && c.v === 1)) return SUBSAMPLINGS[`${y.h}x${y.v}`] ?? 'other'
  return 'other'
}

/** What Forensics' Compression section says about a JPEG; null without a frame header or its tables. */
export function jpegInfo(b: Uint8Array): JpegInfo | null {
  const read = readJpeg(b)
  if (!read || !read.components.length) return null
  const { tables, components, progressive } = read
  const luma = tables[components[0].tq]
  if (!luma) return null
  const chroma = components.length > 1 ? (tables[components[1].tq] ?? null) : null
  // A single component is coded in 8 × 8 blocks whatever its sampling factors say.
  const grey = components.length === 1
  const mcu = {
    width: grey ? 8 : 8 * Math.max(...components.map((c) => c.h)),
    height: grey ? 8 : 8 * Math.max(...components.map((c) => c.v)),
  }
  return { ...identifyTables(luma, chroma), subsampling: subsamplingOf(components), progressive, mcu }
}
