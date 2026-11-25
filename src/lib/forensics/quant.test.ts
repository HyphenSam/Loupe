import { describe, expect, it } from 'vitest'
import { concat } from '../containers'
import { IJG_CHROMA, IJG_LUMA, identifyTables, jpegInfo, KNOWN_TABLES, readJpeg, scaleTable, ZIGZAG } from './quant'

type Component = { id: number; h: number; v: number; tq: number }

/** A JPEG's headers, enough for quant.ts: SOI, one DQT segment per entry of `dqts` (each holding one or more
 * tables, 16-bit when a value needs it), a frame header and the start of a scan. */
function headers({
  dqts,
  components,
  sof = 0xc0,
}: {
  dqts: { tq: number; values: number[] }[][]
  components: Component[]
  sof?: number
}): Uint8Array {
  const segment = (marker: number, body: number[]) =>
    new Uint8Array([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body])
  const parts = [new Uint8Array([0xff, 0xd8])]
  for (const tables of dqts) {
    const body = tables.flatMap(({ tq, values }) => {
      const wide = values.some((v) => v > 255)
      const zigzag = ZIGZAG.map((natural) => values[natural])
      return [(wide ? 0x10 : 0) | tq, ...zigzag.flatMap((v) => (wide ? [v >> 8, v & 0xff] : [v]))]
    })
    parts.push(segment(0xdb, body))
  }
  parts.push(
    segment(sof, [8, 0, 48, 0, 64, components.length, ...components.flatMap((c) => [c.id, (c.h << 4) | c.v, c.tq])]),
  )
  parts.push(segment(0xda, [1, 1, 0, 0, 63, 0]))
  return concat(parts)
}

const YCC = (y: [number, number], c: [number, number] = [1, 1]): Component[] => [
  { id: 1, h: y[0], v: y[1], tq: 0 },
  { id: 2, h: c[0], v: c[1], tq: 1 },
  { id: 3, h: c[0], v: c[1], tq: 1 },
]

const ijgAt = (quality: number) => [
  [
    { tq: 0, values: scaleTable(IJG_LUMA, quality) },
    { tq: 1, values: scaleTable(IJG_CHROMA, quality) },
  ],
]

describe('scaleTable', () => {
  it('scales as libjpeg does: quality 50 is the base table, 100 all ones', () => {
    expect(scaleTable(IJG_LUMA, 50)).toEqual(IJG_LUMA)
    expect(scaleTable(IJG_LUMA, 100)).toEqual(new Array(64).fill(1))
    // Below 50 the scale is 5000 / quality percent; above, 200 − 2 × quality.
    expect(scaleTable(IJG_LUMA, 25)[0]).toBe(32)
    expect(scaleTable(IJG_LUMA, 90)[0]).toBe(3)
  })

  it('never goes below 1, and keeps values past 255 for 16-bit tables', () => {
    expect(Math.min(...scaleTable(IJG_LUMA, 99))).toBe(1)
    expect(Math.max(...scaleTable(IJG_LUMA, 1))).toBe(121 * 50)
  })
})

describe('readJpeg', () => {
  it('reads tables from separate segments and from one segment, in natural order', () => {
    const luma = IJG_LUMA
    const chroma = IJG_CHROMA
    const separate = readJpeg(
      headers({ dqts: [[{ tq: 0, values: luma }], [{ tq: 1, values: chroma }]], components: YCC([2, 2]) }),
    )!
    const together = readJpeg(
      headers({
        dqts: [
          [
            { tq: 0, values: luma },
            { tq: 1, values: chroma },
          ],
        ],
        components: YCC([2, 2]),
      }),
    )!
    for (const read of [separate, together]) {
      expect(read.tables[0]).toEqual(luma)
      expect(read.tables[1]).toEqual(chroma)
    }
  })

  it('reads 16-bit tables', () => {
    const values = scaleTable(IJG_LUMA, 1)
    expect(
      readJpeg(headers({ dqts: [[{ tq: 0, values }]], components: [{ id: 1, h: 1, v: 1, tq: 0 }] }))!.tables[0],
    ).toEqual(values)
  })

  it('is null for bytes that aren’t a JPEG', () => {
    expect(readJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(null)
  })
})

describe('identifyTables', () => {
  it('knows libjpeg’s tables at every quality', () => {
    for (let q = 1; q <= 100; q++)
      expect(identifyTables(scaleTable(IJG_LUMA, q), scaleTable(IJG_CHROMA, q))).toEqual({
        quality: q,
        tables: 'ijg',
        tablesName: 'libjpeg',
      })
  })

  it('knows libjpeg’s tables clamped to 255, as baseline JPEGs store them', () => {
    const clamp = (t: number[]) => t.map((v) => Math.min(v, 255))
    expect(identifyTables(clamp(scaleTable(IJG_LUMA, 5)), clamp(scaleTable(IJG_CHROMA, 5)))).toMatchObject({
      quality: 5,
      tables: 'ijg',
    })
  })

  it('knows a greyscale picture from its one table', () => {
    expect(identifyTables(scaleTable(IJG_LUMA, 75), null)).toMatchObject({ quality: 75, tables: 'ijg' })
  })

  it('knows Photoshop’s Save As tables by name, with the quality libjpeg would need to match them', () => {
    const ten = KNOWN_TABLES.find((t) => t.name.startsWith('Photoshop “Save As” 10'))!
    const found = identifyTables(ten.luma, ten.chroma)
    expect(found.tables).toBe('photoshop')
    expect(found.tablesName).toBe(ten.name)
    expect(found.quality).toBeGreaterThan(85)
    expect(found.quality).toBeLessThan(100)
  })

  it('calls anything else custom, and still estimates a quality from the luminance table', () => {
    const luma = scaleTable(IJG_LUMA, 80).map((v, i) => (i === 63 ? v + 7 : v))
    expect(identifyTables(luma, scaleTable(IJG_CHROMA, 80))).toEqual({
      quality: 80,
      tables: 'custom',
      tablesName: null,
    })
  })

  it('doesn’t call libjpeg’s luminance table with another chrominance table libjpeg’s', () => {
    const chroma = scaleTable(IJG_LUMA, 90)
    expect(identifyTables(scaleTable(IJG_LUMA, 90), chroma).tables).toBe('custom')
  })

  it('has a distinct entry for each of Photoshop’s thirteen Save As qualities', () => {
    const photoshop = KNOWN_TABLES.filter((t) => t.tables === 'photoshop')
    expect(photoshop).toHaveLength(13)
    expect(new Set(photoshop.map((t) => t.luma.join())).size).toBe(13)
    for (const t of KNOWN_TABLES) {
      expect(t.luma).toHaveLength(64)
      if (t.chroma) expect(t.chroma).toHaveLength(64)
    }
  })
})

describe('jpegInfo', () => {
  it.each([
    [[1, 1], [1, 1], '4:4:4', 8, 8],
    [[2, 2], [1, 1], '4:2:0', 16, 16],
    [[2, 1], [1, 1], '4:2:2', 16, 8],
    [[1, 2], [1, 1], '4:4:0', 8, 16],
    [[4, 1], [1, 1], '4:1:1', 32, 8],
    [[2, 2], [2, 1], 'other', 16, 16],
  ] as const)('reads luma %j and chroma %j as %s, in %i × %i px blocks', (y, c, subsampling, width, height) => {
    const info = jpegInfo(headers({ dqts: ijgAt(90), components: YCC([y[0], y[1]], [c[0], c[1]]) }))!
    expect(info.subsampling).toBe(subsampling)
    expect(info.mcu).toEqual({ width, height })
  })

  it('reads a greyscale picture', () => {
    const info = jpegInfo(
      headers({ dqts: [[{ tq: 0, values: IJG_LUMA }]], components: [{ id: 1, h: 1, v: 1, tq: 0 }] }),
    )!
    expect(info).toMatchObject({ subsampling: 'grey', quality: 50, tables: 'ijg', mcu: { width: 8, height: 8 } })
  })

  it('says whether it’s progressive', () => {
    expect(jpegInfo(headers({ dqts: ijgAt(90), components: YCC([1, 1]) }))!.progressive).toBe(false)
    expect(jpegInfo(headers({ dqts: ijgAt(90), components: YCC([1, 1]), sof: 0xc2 }))!.progressive).toBe(true)
  })

  it('gives the quality and tables', () => {
    expect(jpegInfo(headers({ dqts: ijgAt(92), components: YCC([2, 2]) }))).toMatchObject({
      quality: 92,
      tables: 'ijg',
      tablesName: 'libjpeg',
    })
  })

  it('is null without a frame header or tables', () => {
    expect(jpegInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(null)
  })
})
