import { describe, expect, it } from 'vitest'
import { extractName, extractType } from './extract'
import type { Embedded, EmbeddedKind } from './info'

const item = (kind: EmbeddedKind, extension = 'jpg', id: string = kind): Embedded => ({
  id,
  kind,
  label: '',
  size: 10,
  extension,
  isImage: false,
  tag: { family: 'EXIF', group: 'IFD1', name: id },
})

describe('extractName (SPEC.md 6.6)', () => {
  it('names each kind after the source', () => {
    const names = (
      [
        item('thumbnail'),
        item('preview'),
        item('motion-video', 'mp4'),
        item('depth-map', 'png'),
        item('gain-map'),
        item('icc-profile', 'icc'),
        item('xmp', 'xmp'),
        item('comfyui-workflow', 'json'),
        item('generation-parameters', 'txt'),
        item('c2pa-manifest', 'json'),
        item('trailer', 'zip'),
      ] as Embedded[]
    ).map((e, _, all) => extractName('PXL_0042.MP.jpg', e, all))
    expect(names).toEqual([
      'PXL_0042.MP thumbnail.jpg',
      'PXL_0042.MP preview.jpg',
      'PXL_0042.MP video.mp4',
      'PXL_0042.MP depth.png',
      'PXL_0042.MP gain map.jpg',
      'PXL_0042.MP profile.icc',
      'PXL_0042.MP.xmp',
      'PXL_0042.MP workflow.json',
      'PXL_0042.MP parameters.txt',
      'PXL_0042.MP credentials.json',
      'PXL_0042.MP hidden.zip',
    ])
  })

  it('names what Samsung’s trailer holds, numbering the drawings', () => {
    const all = [
      item('samsung-picture', 'jpg', 'samsung:2'),
      item('samsung-edits', 'json'),
      item('drawing-tiles', 'png'),
      item('drawing', 'png', 'drawing:0'),
      item('drawing', 'png', 'drawing:1'),
    ]
    expect(all.map((e) => extractName('20251102_101500.png', e, all))).toEqual([
      '20251102_101500 picture.jpg',
      '20251102_101500 edits.json',
      '20251102_101500 drawing tiles.png',
      '20251102_101500 drawing.png',
      '20251102_101500 drawing (2).png',
    ])
  })

  it('calls MPF’s pictures previews, and numbers a name that repeats', () => {
    const all = [item('preview', 'jpg', 'a'), item('mpf-image', 'jpg', 'b'), item('preview', 'jpg', 'c')]
    expect(all.map((e) => extractName('DSC_1.NEF', e, all))).toEqual([
      'DSC_1 preview.jpg',
      'DSC_1 preview (2).jpg',
      'DSC_1 preview (3).jpg',
    ])
  })
})

describe('extractType', () => {
  it('gives each saved item its media type', () => {
    expect(extractType(item('preview'))).toBe('image/jpeg')
    expect(extractType(item('depth-map', 'png'))).toBe('image/png')
    expect(extractType(item('motion-video', 'mp4'))).toBe('video/mp4')
    expect(extractType(item('icc-profile', 'icc'))).toBe('application/vnd.iccprofile')
    expect(extractType(item('xmp', 'xmp'))).toBe('application/rdf+xml')
    expect(extractType(item('comfyui-workflow', 'json'))).toBe('application/json')
    expect(extractType(item('generation-parameters', 'txt'))).toBe('text/plain')
    expect(extractType(item('trailer', 'bin'))).toBe('application/octet-stream')
  })
})
