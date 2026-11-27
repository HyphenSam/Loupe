import { describe, expect, it } from 'vitest'
import { fakeInfo } from './testing'
import { GROUPS, toolReason, TOOLS } from './tools'

describe('TOOLS', () => {
  it('lists the twelve tools in rail order, Inspect then Edit (SPEC.md section 6)', () => {
    expect(TOOLS.map((t) => t.label)).toEqual([
      'Info',
      'Location',
      'AI check',
      'Privacy',
      'Forensics',
      'Text',
      'Extract',
      'Edit metadata',
      'Crop and rotate',
      'Redact',
      'Adjust',
      'Export',
    ])
  })

  it('puts the read-only tools under Inspect and the ones that make a file under Edit', () => {
    expect(GROUPS.map((g) => g.label)).toEqual(['Inspect', 'Edit'])
    expect(TOOLS.filter((t) => t.group === 'inspect')).toHaveLength(7)
    expect(TOOLS.filter((t) => t.group === 'edit')).toHaveLength(5)
  })
})

describe('toolReason', () => {
  it('lets every tool apply to a phone photo with a location and a thumbnail', () => {
    const info = fakeInfo({
      gps: { lat: 1, lon: 2, altitude: null, direction: null, speed: null, accuracy: null },
      embedded: [
        {
          id: 'EXIF:IFD1:ThumbnailImage',
          kind: 'thumbnail',
          label: '',
          size: 10,
          extension: 'jpg',
          isImage: true,
          tag: { family: 'EXIF', group: 'IFD1', name: 'ThumbnailImage' },
        },
      ],
    })
    for (const tool of TOOLS) expect(toolReason(tool.id, info), tool.id).toBe(null)
  })

  it('dims Location without GPS and Extract with nothing embedded, saying why', () => {
    const info = fakeInfo({ gps: null, embedded: [] })
    expect(toolReason('location', info)).toBe('This picture has no location.')
    expect(toolReason('extract', info)).toBe('Nothing is embedded in this file.')
  })

  it('dims the pixel edit tools for TIFF and raw files, naming the format, but not their metadata tools', () => {
    const preview = {
      id: 'EXIF:IFD0:PreviewImage',
      kind: 'preview',
      label: 'Preview',
      size: 900,
      extension: 'jpg',
      isImage: true,
      tag: { family: 'EXIF', group: 'IFD0', name: 'PreviewImage' },
    }
    const cases = [
      [
        fakeInfo({ format: 'raw', formatName: 'NEF', embedded: [preview as never] }),
        'Loupe can’t edit NEF pictures. Extract the preview to edit that instead.',
      ],
      [fakeInfo({ format: 'tiff', formatName: 'TIFF' }), 'Loupe can’t edit TIFF pictures.'],
    ] as const
    for (const [info, reason] of cases) {
      for (const tool of ['crop', 'redact', 'adjust', 'export'] as const) expect(toolReason(tool, info)).toBe(reason)
      expect(toolReason('edit-metadata', info)).toBe(null)
      expect(toolReason('privacy', info)).toBe(null)
    }
  })

  it('dims Text for TIFF only: a raw file’s text is read from its preview', () => {
    expect(toolReason('text', fakeInfo({ format: 'tiff', formatName: 'TIFF' }))).toBe(
      'Loupe can’t show TIFF pictures yet, so it can’t read their text.',
    )
    expect(toolReason('text', fakeInfo({ format: 'raw', formatName: 'NEF' }))).toBe(null)
  })

  it('dims nothing while the metadata is still being read', () => {
    for (const tool of TOOLS) expect(toolReason(tool.id, null)).toBe(null)
  })
})
