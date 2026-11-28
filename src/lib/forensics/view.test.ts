import { describe, expect, it } from 'vitest'
import type { EditTrail } from './history'
import type { JpegInfo } from './quant'
import { compareWords, compressionRows, editRows, hiddenWords, stepWords, thumbnailFinding } from './view'

const jpeg = (over: Partial<JpegInfo> = {}): JpegInfo => ({
  quality: 92,
  tables: 'ijg',
  tablesName: 'libjpeg',
  subsampling: '4:2:0',
  progressive: false,
  mcu: { width: 16, height: 16 },
  ...over,
})

describe('compressionRows', () => {
  it('words a libjpeg JPEG', () => {
    expect(compressionRows(jpeg())).toEqual([
      { label: 'Quality', value: 'About quality 92' },
      { label: 'Tables', value: 'Standard libjpeg tables' },
      { label: 'Chroma', value: '4:2:0', note: 'Colour is stored at half the width and half the height.' },
      { label: 'Encoding', value: 'Baseline' },
    ])
  })

  it('names Photoshop’s, a known encoder’s and custom tables', () => {
    const name = 'Photoshop “Save As” 10 or Lightroom 77–84%'
    expect(compressionRows(jpeg({ tables: 'photoshop', tablesName: name }))[1]).toEqual({
      label: 'Tables',
      value: name,
    })
    expect(compressionRows(jpeg({ tables: 'known', tablesName: 'MozJPEG' }))[1]).toEqual({
      label: 'Tables',
      value: 'MozJPEG’s tables',
    })
    expect(compressionRows(jpeg({ tables: 'custom', tablesName: null }))[1]).toEqual({
      label: 'Tables',
      value: 'Custom tables',
      note: 'Not libjpeg’s, Photoshop’s or another encoder’s Loupe knows; cameras and phones often have their own.',
    })
  })

  it('words each subsampling, progressive encoding and an unknown quality', () => {
    const rows = (over: Partial<JpegInfo>) => compressionRows(jpeg(over))
    expect(rows({ subsampling: '4:4:4' })[2]).toEqual({
      label: 'Chroma',
      value: '4:4:4',
      note: 'Colour is stored at full resolution.',
    })
    expect(rows({ subsampling: 'grey' })[2]).toEqual({ label: 'Chroma', value: 'Greyscale' })
    expect(rows({ progressive: true })[3]).toEqual({ label: 'Encoding', value: 'Progressive' })
    expect(rows({ quality: null })[0]).toEqual({ label: 'Quality', value: 'Unknown' })
  })
})

const trail = (over: Partial<EditTrail> = {}): EditTrail => ({
  software: null,
  history: [],
  settings: [],
  settingsBy: null,
  ancestors: 0,
  mismatches: [],
  samsung: null,
  ...over,
})

describe('editRows', () => {
  it('lists what wrote the file, the develop settings, the ancestors and the dates that disagree', () => {
    expect(
      editRows(
        trail({
          software: 'Adobe Photoshop 25.0 (Windows)',
          settings: ['Exposure +0.70', 'Crop'],
          settingsBy: 'Camera Raw 16.0',
          ancestors: 3,
          mismatches: ['Modified 21 days after it was taken.'],
        }),
      ),
    ).toEqual([
      { label: 'Written by', value: 'Adobe Photoshop 25.0 (Windows)' },
      { label: 'Develop settings', value: 'Exposure +0.70, Crop', note: 'Set in Camera Raw 16.0.' },
      { label: 'Made from', value: '3 other documents' },
      { label: 'Dates', value: 'Modified 21 days after it was taken.' },
    ])
  })

  it('lists what Samsung Gallery’s edit data says was done', () => {
    expect(editRows(trail({ samsung: ['Crop', 'Drawing'] }))).toEqual([
      { label: 'Samsung Gallery', value: 'Crop, Drawing', note: 'Kept in the file so Gallery can undo them.' },
    ])
    expect(editRows(trail({ samsung: [] }))).toEqual([])
  })

  it('says one document, and leaves out what isn’t there', () => {
    expect(editRows(trail({ ancestors: 1, settings: ['Crop'] }))).toEqual([
      { label: 'Develop settings', value: 'Crop' },
      { label: 'Made from', value: '1 other document' },
    ])
    expect(editRows(trail())).toEqual([])
  })
})

describe('stepWords', () => {
  it('says when and in what, then what it changed', () => {
    expect(
      stepWords({
        action: 'Saved',
        when: { local: '2025-04-03T09:12:44', offset: '+13:00' },
        software: 'Adobe Photoshop 25.0 (Windows)',
        detail: 'Metadata only',
      }),
    ).toBe('3 April 2025 at 09:12 (UTC+13:00) · Adobe Photoshop 25.0 (Windows) · Metadata only')
    expect(stepWords({ action: 'Converted', when: null, software: null, detail: 'From PSD to JPEG' })).toBe(
      'From PSD to JPEG',
    )
    expect(stepWords({ action: 'Created', when: null, software: null, detail: null })).toBe('')
  })
})

describe('hiddenWords', () => {
  it('says what was found, or that nothing was, or that the format isn’t checked', () => {
    expect(hiddenWords('jpeg', { offset: 709, length: 149, looksLike: 'zip' })).toBe(
      '149 B of data after the end of the picture. It starts like a ZIP archive.',
    )
    expect(hiddenWords('png', null)).toBe('Nothing found after the end of the picture.')
    expect(hiddenWords('heic', null)).toBe('Loupe looks for data after the picture in JPEG, PNG and WebP files.')
  })

  it('says when Samsung’s trailer is there, which Loupe reads', () => {
    const samsung = { offset: 1_013_466, length: 5_175_206, blocks: [] }
    expect(hiddenWords('png', null, samsung)).toBe(
      '5.2 MB of Samsung’s data after the end of the picture, which Loupe reads. Extract lists what it holds.',
    )
    expect(hiddenWords('jpeg', { offset: 709, length: 149, looksLike: 'zip' }, samsung)).toBe(
      '149 B of data after the end of the picture. It starts like a ZIP archive. After it comes 5.2 MB of Samsung’s data, which Loupe reads.',
    )
  })
})

describe('thumbnailFinding', () => {
  const match = { label: 'EXIF thumbnail', thumbnail: new Blob(), picture: new Blob() }

  it('says the thumbnail matches, resting on how many bits differ', () => {
    expect(thumbnailFinding({ ...match, matches: true, distance: 3, aspectDiffers: false })).toEqual({
      id: 'thumbnail',
      verdict: 'The embedded thumbnail matches the picture.',
      detail: null,
      rests: 'pattern',
      restsWords: 'Compared by perceptual hash: 3 of 64 bits differ.',
      tool: null,
    })
  })

  it('says it doesn’t match when its shape differs, and what it may show', () => {
    expect(thumbnailFinding({ ...match, matches: false, distance: 2, aspectDiffers: true })).toMatchObject({
      verdict: 'The embedded thumbnail doesn’t match the picture.',
      detail: 'It may show it before it was cropped or edited.',
      restsWords: 'Compared by shape: the thumbnail’s is different.',
    })
  })

  it('says it doesn’t match when its hash is too far apart, with one bit in the singular', () => {
    expect(thumbnailFinding({ ...match, matches: false, distance: 14, aspectDiffers: false }).restsWords).toBe(
      'Compared by perceptual hash: 14 of 64 bits differ.',
    )
    expect(thumbnailFinding({ ...match, matches: true, distance: 1, aspectDiffers: false }).restsWords).toBe(
      'Compared by perceptual hash: 1 of 64 bits differs.',
    )
  })
})

describe('compareWords', () => {
  const mine = { sha256: 'aa', phash: '0000000000000000' }

  it('says how alike two pictures are, by SPEC.md’s thresholds', () => {
    expect(compareWords(mine, { sha256: 'bb', phash: '000000000000000f' })).toBe(
      'Likely the same picture (4 of 64 bits differ).',
    )
    expect(compareWords(mine, { sha256: 'bb', phash: '0000000000000001' })).toBe(
      'Likely the same picture (1 of 64 bits differs).',
    )
    expect(compareWords(mine, { sha256: 'bb', phash: '0000000000003fff' })).toBe(
      'Possibly similar (14 of 64 bits differ).',
    )
    expect(compareWords(mine, { sha256: 'bb', phash: '00000000ffffffff' })).toBe('Different pictures.')
  })

  it('says when it’s the very same file', () => {
    expect(compareWords(mine, { sha256: 'aa', phash: '0000000000000000' })).toBe(
      'The same file: every byte is identical.',
    )
  })

  it('says when either picture can’t be shown', () => {
    expect(compareWords(mine, { sha256: 'bb', phash: null })).toBe(
      'Loupe can’t show that picture, so it can’t compare them.',
    )
    expect(compareWords({ sha256: 'cc', phash: null }, mine)).toBe(
      'Loupe can’t show this picture, so it can’t compare them.',
    )
  })
})
