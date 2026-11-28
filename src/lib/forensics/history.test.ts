import { describe, expect, it } from 'vitest'
import type { Dates } from '../info'
import type { Entry } from '../tags'
import { editedIn, editFinding, editTrail, historySteps, type EditTrail } from './history'

const entry = (key: string, val: Entry['val'], num?: Entry['num']): Entry => {
  const [family, group, name] = key.split(':')
  return { family, group, name, label: name, val, ...(num === undefined ? {} : { num }) }
}

const NO_DATES: Dates = { taken: null, digitised: null, modified: null, gpsUtc: null }

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

describe('editTrail', () => {
  it('names the software that wrote the file: Software, else the XMP creator tool', () => {
    expect(editTrail([entry('EXIF:IFD0:Software', 'Adobe Photoshop 25.0 (Windows)')], NO_DATES).software).toBe(
      'Adobe Photoshop 25.0 (Windows)',
    )
    expect(editTrail([entry('XMP:XMP-xmp:CreatorTool', 'GIMP 2.10')], NO_DATES).software).toBe('GIMP 2.10')
    expect(editTrail([], NO_DATES)).toEqual(trail())
  })

  it('words Camera Raw settings away from their defaults, in Lightroom’s order', () => {
    const crs = [
      entry('XMP:XMP-crs:Version', '16.0'),
      entry('XMP:XMP-crs:WhiteBalance', 'As Shot'),
      entry('XMP:XMP-crs:Exposure2012', '+0.70', 0.7),
      entry('XMP:XMP-crs:Contrast2012', 0),
      entry('XMP:XMP-crs:Highlights2012', -45),
      entry('XMP:XMP-crs:Shadows2012', '+30', 30),
      entry('XMP:XMP-crs:Clarity2012', 12),
      entry('XMP:XMP-crs:Vibrance', 0),
      entry('XMP:XMP-crs:Sharpness', 40),
      entry('XMP:XMP-crs:ColorNoiseReduction', 25),
      entry('XMP:XMP-crs:HasCrop', 'True'),
      entry('XMP:XMP-crs:CropAngle', 1.25),
      entry('XMP:XMP-crs:ConvertToGrayscale', 'False'),
      entry('XMP:XMP-crs:SaturationAdjustmentBlue', -20),
      entry('XMP:XMP-crs:LensProfileEnable', 1),
      entry('XMP:XMP-crs:PostCropVignetteAmount', -15),
    ]
    const found = editTrail(crs, NO_DATES)
    expect(found.settings).toEqual([
      'Exposure +0.70',
      'Highlights −45',
      'Shadows +30',
      'Clarity +12',
      'Colour mixer',
      'Lens corrections',
      'Crop',
      'Straightened 1.3°',
      'Vignette −15',
    ])
    expect(found.settingsBy).toBe('Camera Raw 16.0')
  })

  it('says a white balance other than as shot, black and white, healing and masks', () => {
    const found = editTrail(
      [
        entry('XMP:XMP-crs:WhiteBalance', 'Custom'),
        entry('XMP:XMP-crs:ConvertToGrayscale', 'True'),
        entry('XMP:XMP-crs:RetouchAreaSpotType', 'heal'),
        entry('XMP:XMP-crs:MaskGroupBasedCorrWhat', 'Correction'),
      ],
      NO_DATES,
    )
    expect(found.settings).toEqual(['White balance custom', 'Black and white', 'Healing', 'Masks'])
  })

  it('gives a version ExifTool read as a whole number its .0, as Adobe writes it', () => {
    expect(editTrail([entry('XMP:XMP-crs:Version', 16)], NO_DATES).settingsBy).toBe('Camera Raw 16.0')
    expect(editTrail([entry('XMP:XMP-crs:Version', 15.4)], NO_DATES).settingsBy).toBe('Camera Raw 15.4')
  })

  it('counts the ancestor documents', () => {
    const list = ['xmp.did:1', 'C:\\Users\\sam\\Pictures\\IMG_2041.CR3', 'adobe:docid:photoshop:3']
    expect(editTrail([entry('XMP:XMP-photoshop:DocumentAncestors', list)], NO_DATES).ancestors).toBe(3)
    expect(editTrail([entry('XMP:XMP-photoshop:DocumentAncestors', 'xmp.did:1')], NO_DATES).ancestors).toBe(1)
  })

  it('says where copies of the same date disagree, to the minute', () => {
    const found = editTrail(
      [
        entry('EXIF:ExifIFD:DateTimeOriginal', '2025:03:12 14:32:05'),
        entry('XMP:XMP-exif:DateTimeOriginal', '2025:03:12 15:32:05+13:00'),
        entry('XMP:XMP-photoshop:DateCreated', '2025:03:12 14:32'),
        entry('EXIF:IFD0:ModifyDate', '2025:04:03 09:12:44'),
        entry('XMP:XMP-xmp:ModifyDate', '2025:04:03 09:12:44+13:00'),
      ],
      NO_DATES,
    )
    expect(found.mismatches).toEqual([
      'The date taken differs: 12 March 2025 at 14:32 in EXIF, 12 March 2025 at 15:32 in XMP.',
    ])
  })

  it('says when it was modified after it was taken', () => {
    const dates: Dates = {
      ...NO_DATES,
      taken: { local: '2025-03-12T14:32:05', offset: '+13:00' },
      modified: { local: '2025-04-03T09:12:44', offset: '+13:00' },
    }
    expect(editTrail([], dates).mismatches).toEqual(['Modified 21 days after it was taken.'])
  })
})

describe('historySteps', () => {
  it('reads ExifTool’s History structures, each step with what it holds', () => {
    const history = [
      {
        Action: 'created',
        InstanceID: 'xmp.iid:1',
        When: '2025:04:02 16:10:21+13:00',
        SoftwareAgent: 'Adobe Photoshop 25.0 (Windows)',
      },
      { Action: 'converted', Parameters: 'from application/vnd.adobe.photoshop to image/jpeg' },
      {
        Action: 'saved',
        When: '2025:04:03 09:12:44+13:00',
        SoftwareAgent: 'Adobe Photoshop 25.0 (Windows)',
        Changed: '/',
      },
    ]
    expect(historySteps(history)).toEqual([
      {
        action: 'Created',
        when: { local: '2025-04-02T16:10:21', offset: '+13:00' },
        software: 'Adobe Photoshop 25.0 (Windows)',
        detail: null,
      },
      { action: 'Converted', when: null, software: null, detail: 'From PSD to JPEG' },
      {
        action: 'Saved',
        when: { local: '2025-04-03T09:12:44', offset: '+13:00' },
        software: 'Adobe Photoshop 25.0 (Windows)',
        detail: null,
      },
    ])
  })

  it('says a save that changed only the metadata, and words other formats', () => {
    expect(historySteps([{ Action: 'saved', Changed: '/metadata' }])[0].detail).toBe('Metadata only')
    expect(
      historySteps([{ Action: 'derived', Parameters: 'converted from image/x-canon-cr3 to image/tiff' }])[0],
    ).toMatchObject({
      action: 'Derived',
      detail: 'Converted from CR3 to TIFF',
    })
  })

  it('takes one structure as a list of one, and anything else as nothing', () => {
    expect(historySteps({ Action: 'created' })).toHaveLength(1)
    expect(historySteps(null)).toEqual([])
    expect(historySteps('saved')).toEqual([])
  })
})

describe('editTrail: Samsung Gallery’s edit data', () => {
  const samsung = (name: string, val: Entry['val']) => entry(`JSON:Samsung:${name}`, val)
  const doodles = (n: number) => JSON.stringify({ arrays: JSON.stringify(new Array(n).fill({ bmpWidth: 4 })) })
  // As ExifTool reads a Gallery edit that changed nothing.
  const untouched = [
    samsung('OriginalPath', '/data/sec/photoeditor/0/a.png'),
    samsung('ClipCenterX', 0.5),
    samsung('ClipWidth', 1),
    samsung('ClipHeight', 1),
    samsung('ClipRotation', 0),
    samsung('ClipRotate', 0),
    samsung('ClipHFlip', 0),
    samsung('ClipVFlip', 0),
    samsung('ClipHozPerspective', 0),
    samsung('Brightness', 100),
    samsung('Exposure', 100),
    samsung('WBMode', -1),
    samsung('WBTemperature', 100),
    samsung('Shadow', 100),
    samsung('FilterIndication', 4097),
    samsung('FilterType', 0),
    samsung('PortraitEffectID', -1),
    samsung('StickerEditInfo', '{"arrays":"[]"}'),
    samsung('DoodleEditInfo', doodles(0)),
  ]
  const changed = (over: Record<string, Entry['val']>) =>
    untouched.map((e) => (e.name in over ? { ...e, val: over[e.name] } : e))

  it('says what Gallery changed: the crop, turns and flips, the tone sliders away from 100, filters and drawing', () => {
    const entries = changed({
      ClipWidth: 0.5805685520172119,
      ClipRotate: 90,
      ClipRotation: 2.5,
      ClipVFlip: 1,
      ClipHozPerspective: 3,
      Brightness: 120,
      WBTemperature: 80,
      Shadow: 110,
      FilterType: 3,
      PortraitEffectID: 2,
      StickerEditInfo: doodles(1),
      DoodleEditInfo: doodles(2),
    })
    expect(editTrail(entries, NO_DATES).samsung).toEqual([
      'Crop',
      'Turn',
      'Straightened',
      'Flip',
      'Perspective',
      'Brightness',
      'Temperature',
      'Shadows',
      'Filter',
      'Portrait effect',
      'Stickers',
      'Drawing',
    ])
  })

  it('lists nothing for an edit that changed nothing it names, and is null without Gallery’s edit data', () => {
    expect(editTrail(untouched, NO_DATES).samsung).toEqual([])
    expect(editTrail([samsung('DoodleEditInfo', 'not json')], NO_DATES).samsung).toEqual([])
    expect(editTrail([entry('MakerNotes:Samsung:TimeStamp', '2025:01:01')], NO_DATES).samsung).toBe(null)
  })
})

describe('editedIn', () => {
  it('names editing software, without its platform, and when the last step happened', () => {
    const found = editedIn(
      trail({
        software: 'Adobe Photoshop 25.0 (Windows)',
        history: [
          { action: 'Saved', when: { local: '2025-04-03T09:12:44', offset: '+13:00' }, software: null, detail: null },
        ],
      }),
      NO_DATES,
    )
    expect(found).toEqual({
      software: 'Adobe Photoshop 25.0',
      when: { local: '2025-04-03T09:12:44', offset: '+13:00' },
    })
  })

  it('falls back to the modified date', () => {
    const modified = { local: '2025-04-03T09:12:44', offset: null }
    expect(
      editedIn(trail({ software: 'Adobe Lightroom Classic 13.1 (Macintosh)' }), { ...NO_DATES, modified }),
    ).toEqual({
      software: 'Adobe Lightroom Classic 13.1',
      when: modified,
    })
  })

  it('doesn’t call a camera’s or a phone’s firmware an editor', () => {
    expect(editedIn(trail({ software: 'Ver.1.00' }), NO_DATES)).toBe(null)
    expect(editedIn(trail({ software: '17.4' }), NO_DATES)).toBe(null)
  })

  it('takes an editor from the history when the file’s own software isn’t one', () => {
    const history = [{ action: 'Saved', when: null, software: 'GIMP 2.10', detail: null }]
    expect(editedIn(trail({ software: 'Loupe fixtures', history }), NO_DATES)?.software).toBe('GIMP 2.10')
  })

  it('names Samsung Gallery when its edit data is there and nothing else names an editor', () => {
    const modified = { local: '2025-11-02T10:15:00', offset: null }
    expect(editedIn(trail({ software: 'S928BXXU4AXK1', samsung: ['Crop'] }), { ...NO_DATES, modified })).toEqual({
      software: 'Samsung Gallery',
      when: modified,
    })
    expect(editedIn(trail({ samsung: [] }), NO_DATES)?.software).toBe('Samsung Gallery')
    expect(editedIn(trail({ software: 'GIMP 2.10', samsung: ['Crop'] }), NO_DATES)?.software).toBe('GIMP 2.10')
  })

  it('takes the file’s software when it has develop settings, whatever it’s called', () => {
    expect(editedIn(trail({ software: 'Some Raw App 2', settings: ['Exposure +1.00'] }), NO_DATES)?.software).toBe(
      'Some Raw App 2',
    )
  })
})

describe('editFinding', () => {
  it('says it was edited, in what and when', () => {
    const modified = { local: '2025-04-03T09:12:44', offset: '+13:00' }
    expect(editFinding(trail({ software: 'Adobe Photoshop 25.0 (Windows)' }), { ...NO_DATES, modified })).toEqual({
      id: 'edits',
      verdict: 'Edited in Adobe Photoshop 25.0 on 3 April 2025',
      detail: null,
      rests: 'stated',
      tool: 'forensics',
    })
  })

  it('says when no editing software is recorded, and that this proves nothing', () => {
    expect(editFinding(trail({ software: 'Ver.1.00' }), NO_DATES)).toEqual({
      id: 'edits',
      verdict: 'No editing software recorded.',
      detail: 'That doesn’t mean it wasn’t edited.',
      rests: 'nothing',
      tool: null,
    })
  })
})
