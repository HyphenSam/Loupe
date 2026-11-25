import { describe, expect, it } from 'vitest'
import type { EditTrail } from './history'
import type { JpegInfo } from './quant'
import { compressionRows, editRows, hiddenWords, stepWords } from './view'

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
})
