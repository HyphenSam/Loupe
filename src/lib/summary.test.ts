import { describe, expect, it } from 'vitest'
import { fileDateWords, findings, infoSections, summaryText } from './summary'
import { fakeCamera, fakeInfo } from './testing'

const gps = { lat: -44.9405, lon: 168.8263, altitude: 312, direction: null, speed: null, accuracy: 5 }

describe('findings', () => {
  it('says when the picture was taken, with its zone, and that a location is recorded', () => {
    expect(findings(fakeInfo({ gps }), 0)).toEqual([
      {
        id: 'taken',
        verdict: 'Taken on 12 March 2025 at 14:32 (UTC+13:00)',
        detail: null,
        rests: 'stated',
        tool: null,
      },
      {
        id: 'location',
        verdict: 'Location recorded',
        detail: 'At 44.940500° S, 168.826300° E.',
        rests: 'stated',
        tool: 'location',
      },
    ])
  })

  it('names the place the location is at, worked out offline', () => {
    const place = {
      type: 'town' as const,
      name: 'Arrowtown',
      region: 'Otago',
      country: 'New Zealand',
      km: 1.3,
      bearing: 120,
    }
    expect(findings(fakeInfo({ gps, place }), 0)[1]).toMatchObject({
      verdict: 'Location recorded: Arrowtown, Otago, New Zealand',
      detail: 'At 44.940500° S, 168.826300° E.',
    })
    expect(findings(fakeInfo({ gps, place: { type: 'sea' } }), 0)[1].verdict).toBe('Location recorded: at sea')
  })

  it('says when nothing is recorded, giving the file’s own date instead', () => {
    const info = fakeInfo({ dates: { taken: null, digitised: null, modified: null, gpsUtc: null }, gps: null })
    expect(findings(info, 0)).toEqual([
      {
        id: 'taken',
        verdict: 'No date taken recorded.',
        detail: 'The file itself is dated 12 March 2025 at 02:00 (UTC).',
        rests: 'nothing',
        tool: null,
      },
      { id: 'location', verdict: 'No location recorded.', detail: null, rests: 'nothing', tool: null },
    ])
  })

  it('puts what wasn’t found after what was', () => {
    const info = fakeInfo({ dates: { taken: null, digitised: null, modified: null, gpsUtc: null }, gps })
    expect(findings(info, 0, null, 3).map((f) => [f.id, f.rests])).toEqual([
      ['location', 'stated'],
      ['privacy', 'stated'],
      ['taken', 'nothing'],
    ])
  })
})

describe('fileDateWords', () => {
  it('writes the file’s date in the browser’s zone', () => {
    expect(fileDateWords(Date.UTC(2025, 2, 12, 2, 0), -780)).toBe('12 March 2025 at 15:00 (UTC+13:00)')
    expect(fileDateWords(Date.UTC(2025, 2, 12, 2, 0), 300)).toBe('11 March 2025 at 21:00 (UTC−05:00)')
  })
})

describe('infoSections', () => {
  const titles = (info: ReturnType<typeof fakeInfo>) => infoSections(info, 0).map((s) => s.title)
  const section = (info: ReturnType<typeof fakeInfo>, title: string) =>
    infoSections(info, 0).find((s) => s.title === title)!.rows

  it('has Picture, Camera and Dates for a phone photo, and Kinds only when there are some', () => {
    expect(titles(fakeInfo())).toEqual(['Picture', 'Camera', 'Dates'])
    expect(titles(fakeInfo({ kinds: ['burst'] }))).toEqual(['Picture', 'Kinds', 'Camera', 'Dates'])
    expect(titles(fakeInfo({ camera: null }))).toEqual(['Picture', 'Dates'])
  })

  it('describes the picture', () => {
    expect(section(fakeInfo(), 'Picture')).toEqual([
      { label: 'Format', value: 'JPEG' },
      { label: 'Dimensions', value: '4032 × 3024, 12.2 MP, 4:3' },
      { label: 'Bit depth', value: '8 bits per channel' },
      { label: 'Transparency', value: 'None' },
      { label: 'Colour profile', value: 'Display P3, wide gamut' },
      { label: 'File size', value: '2.4 MB' },
    ])
  })

  it('notes a misleading extension, the upright size, HDR and animation', () => {
    const rows = section(
      fakeInfo({
        extension: { given: 'png', expected: 'jpg' },
        orientation: 6,
        displayWidth: 3024,
        displayHeight: 4032,
        alpha: true,
        colour: { profile: 'Display P3', space: 'display-p3', hdr: 'gain-map' },
        kinds: ['ultra-hdr'],
        animation: { frames: 24, duration: 2.4, loops: 'forever' },
      }),
      'Picture',
    )
    expect(rows).toContainEqual({ label: 'Format', value: 'JPEG', note: 'Its extension says PNG, but it’s a JPEG.' })
    expect(rows).toContainEqual({ label: 'Upright', value: '3024 × 4032, turned 90° clockwise' })
    expect(rows).toContainEqual({ label: 'Transparency', value: 'Yes' })
    expect(rows).toContainEqual({ label: 'HDR', value: 'Ultra HDR: has a gain map' })
    expect(rows).toContainEqual({ label: 'Animation', value: '24 frames, 2.4 s, loops forever' })
  })

  it('describes the camera, marking what identifies it', () => {
    const info = fakeInfo({
      camera: fakeCamera({
        make: 'Canon',
        model: 'Canon EOS R5',
        bodySerial: '0123',
        owner: 'Ana',
        shutterCount: 18402,
      }),
    })
    expect(section(info, 'Camera')).toEqual([
      { label: 'Camera', value: 'Canon EOS R5' },
      { label: 'Lens', value: 'iPhone 15 Pro back triple camera 6.765mm f/1.78' },
      { label: 'Exposure', value: '1/250 s · f/1.8 · ISO 80 · 7 mm (24 mm equivalent)' },
      { label: 'Flash', value: 'Off, Did not fire' },
      { label: 'Shutter count', value: '18,402', note: 'From the camera’s maker notes.' },
      { label: 'Body serial number', value: '0123', note: 'Identifies this camera.' },
      { label: 'Owner', value: 'Ana' },
      { label: 'Software', value: '17.4' },
    ])
    expect(section(fakeInfo(), 'Camera')[0]).toEqual({ label: 'Camera', value: 'Apple iPhone 15 Pro' })
  })

  it('lists the kinds in sentences', () => {
    expect(section(fakeInfo({ kinds: ['screenshot', 'ultra-hdr'] }), 'Kinds')).toEqual([
      { label: 'Screenshot', value: 'A screenshot.' },
    ])
  })

  it('says how long a Motion Photo’s video runs', () => {
    const motion = { offset: 4000, length: 2233, duration: 2.1, location: null, box: null }
    expect(section(fakeInfo({ kinds: ['motion-photo'], motion }), 'Kinds')).toEqual([
      { label: 'Motion Photo', value: 'A Motion Photo: a 2.1 s video is stored inside.' },
    ])
  })

  it('lists the dates with their zones, the GPS time and the file’s date, and how much later it was modified', () => {
    const info = fakeInfo({
      dates: {
        taken: { local: '2025-03-12T14:32:05', offset: '+13:00' },
        digitised: null,
        modified: { local: '2025-03-15T09:00:00', offset: '+13:00' },
        gpsUtc: '2025-03-12T01:32:05Z',
      },
    })
    expect(section(info, 'Dates')).toEqual([
      { label: 'Taken', value: '12 March 2025 at 14:32 (UTC+13:00)' },
      { label: 'Modified', value: '15 March 2025 at 09:00 (UTC+13:00)', note: 'Modified 2 days after it was taken.' },
      { label: 'GPS time', value: '12 March 2025 at 01:32 (UTC)' },
      { label: 'File date', value: '12 March 2025 at 02:00 (UTC)' },
    ])
  })
})

describe('summaryText', () => {
  it('copies the summary and every section as Key: value lines', () => {
    const text = summaryText(fakeInfo({ gps }), 0)
    expect(text.split('\n').slice(0, 4)).toEqual([
      'File: IMG_0001.jpg',
      'Taken: Taken on 12 March 2025 at 14:32 (UTC+13:00)',
      'Location: Location recorded. At 44.940500° S, 168.826300° E.',
      '',
    ])
    expect(text).toContain('\nFormat: JPEG\n')
    expect(text).toContain('\nCamera: Apple iPhone 15 Pro\n')
    expect(text.endsWith('File date: 12 March 2025 at 02:00 (UTC)')).toBe(true)
  })

  it('puts a row’s note after its value', () => {
    const text = summaryText(fakeInfo({ camera: fakeCamera({ bodySerial: 'X1' }) }), 0)
    expect(text).toContain('\nBody serial number: X1 (Identifies this camera.)\n')
  })
})

describe('the AI check’s finding', () => {
  const made = {
    verdict: 'Made with AI',
    detail: 'Content Credentials signed by OpenAI say it was made with generative AI in ChatGPT.',
    rests: 'signed' as const,
    restsWords: 'Signed by OpenAI and verified.',
  }

  it('comes third, after the date and the location, and opens the AI check', () => {
    const list = findings(fakeInfo({ gps }), 0, made)
    expect(list.map((f) => f.id)).toEqual(['taken', 'location', 'ai'])
    expect(list[2]).toEqual({ id: 'ai', ...made, tool: 'ai' })
  })

  it('is left out until the verdict is known', () => {
    expect(findings(fakeInfo(), 0).map((f) => f.id)).toEqual(['taken', 'location'])
  })

  it('is copied with the summary', () => {
    expect(summaryText(fakeInfo(), 0, made)).toContain(
      '\nAI check: Made with AI. Content Credentials signed by OpenAI say it was made with generative AI in ChatGPT.\n',
    )
  })
})

describe('the privacy finding', () => {
  it('counts what could identify someone, after the AI check, and opens Privacy', () => {
    const list = findings(fakeInfo({ gps }), 0, null, 7)
    expect(list.at(-1)).toEqual({
      id: 'privacy',
      verdict: '7 things in this file could identify a person or place.',
      detail: null,
      rests: 'stated',
      tool: 'privacy',
    })
    expect(findings(fakeInfo({ gps }), 0, null, 1).at(-1)!.verdict).toBe(
      '1 thing in this file could identify a person or place.',
    )
  })

  it('says when nothing is found, and is left out until the Content Credentials are read', () => {
    expect(findings(fakeInfo(), 0, null, 0).at(-1)).toMatchObject({
      verdict: 'Nothing identifying found.',
      rests: 'nothing',
      tool: null,
    })
    expect(findings(fakeInfo(), 0, null, null).map((f) => f.id)).toEqual(['taken', 'location'])
  })

  it('is copied with the summary', () => {
    expect(summaryText(fakeInfo(), 0, null, 2)).toContain(
      '\nPrivacy: 2 things in this file could identify a person or place.',
    )
  })
})

describe('the edit trail’s finding', () => {
  const photoshop = {
    software: 'Adobe Photoshop 25.0 (Windows)',
    history: [],
    settings: [],
    settingsBy: null,
    ancestors: 0,
    mismatches: [],
  }

  it('comes last when the trail names editing software, and opens Forensics', () => {
    const list = findings(fakeInfo({ edits: photoshop, gps }), 0, null, 2)
    expect(list.map((f) => f.id)).toEqual(['taken', 'location', 'privacy', 'edits'])
    expect(list.at(-1)).toMatchObject({ verdict: 'Edited in Adobe Photoshop 25.0 on 12 March 2025', tool: 'forensics' })
  })

  it('is left out when no editing software is named', () => {
    expect(findings(fakeInfo(), 0).map((f) => f.id)).toEqual(['taken', 'location'])
  })

  it('is copied with the summary', () => {
    expect(summaryText(fakeInfo({ edits: photoshop }), 0)).toContain(
      '\nEdit trail: Edited in Adobe Photoshop 25.0 on 12 March 2025\n',
    )
  })
})
