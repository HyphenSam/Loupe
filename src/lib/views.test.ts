import { describe, expect, it } from 'vitest'
import type { Embedded } from './info'
import { fakeInfo } from './testing'
import type { ToolId } from './tools'
import { isLayer, nextView, shownView, stageViews, VIEW_LABELS, type StageView } from './views'

const gps = { lat: -44.9405, lon: 168.8263, altitude: null, direction: null, speed: null, accuracy: null }
/** The view after moving from one tool to another, Edit metadata's Location on Set or not. */
const tool = (chosen: StageView, from: ToolId, to: ToolId, picking = false) =>
  nextView(chosen, { type: 'tool', from, to, picking })

const depthMap: Embedded = {
  id: 'XMP:XMP-GDepth:DepthImage',
  kind: 'depth-map',
  label: 'Depth map',
  size: 418,
  extension: 'png',
  isImage: true,
}

describe('The stage’s view chips (SPEC.md section 5)', () => {
  it('always offers Picture, and Map when the picture has a location', () => {
    expect(stageViews(null)).toEqual(['picture'])
    expect(stageViews(fakeInfo({ gps: null }))).toEqual(['picture'])
    expect(stageViews(fakeInfo({ gps }))).toEqual(['picture', 'map'])
  })

  it('switches to Map on opening Location, and back to Picture on leaving it', () => {
    expect(tool('picture', 'info', 'location')).toBe('map')
    expect(tool('map', 'location', 'info')).toBe('picture')
    expect(tool('picture', 'location', 'privacy')).toBe('picture')
  })

  it('leaves the view as it is between other tools', () => {
    expect(tool('map', 'info', 'privacy')).toBe('map')
    expect(tool('picture', 'info', 'crop')).toBe('picture')
  })

  it('shows Picture when the chosen view doesn’t apply to the open file', () => {
    expect(shownView('map', fakeInfo({ gps }))).toBe('map')
    expect(shownView('map', fakeInfo({ gps: null }))).toBe('picture')
    expect(shownView('map', null)).toBe('picture')
  })
  it('offers Map while Edit metadata sets a location, even without one in the file', () => {
    expect(stageViews(fakeInfo({ gps: null }), { picking: true })).toEqual(['picture', 'map'])
    expect(shownView('map', fakeInfo({ gps: null }), { picking: true })).toBe('map')
  })

  it('switches to Map on coming back to Edit metadata while it sets a location, and back on leaving', () => {
    expect(tool('picture', 'info', 'edit-metadata', true)).toBe('map')
    expect(tool('picture', 'info', 'edit-metadata', false)).toBe('picture')
    expect(tool('map', 'edit-metadata', 'info', true)).toBe('picture')
    expect(tool('map', 'edit-metadata', 'location', true)).toBe('map')
  })

  it('offers Error levels and Noise while Forensics is open on a picture Loupe shows', () => {
    expect(stageViews(fakeInfo({ gps: null }), { layers: true })).toEqual(['picture', 'ela', 'noise'])
    expect(stageViews(fakeInfo({ gps }), { layers: true })).toEqual(['picture', 'map', 'ela', 'noise'])
    expect(shownView('ela', fakeInfo(), { layers: true })).toBe('ela')
    expect(shownView('noise', fakeInfo(), { layers: false })).toBe('picture')
  })

  it('switches back to Picture on leaving Forensics from a layer, and leaves the view on opening it', () => {
    expect(tool('ela', 'forensics', 'info')).toBe('picture')
    expect(tool('noise', 'forensics', 'location')).toBe('map')
    expect(tool('picture', 'info', 'forensics')).toBe('picture')
    expect(tool('map', 'info', 'forensics')).toBe('map')
  })

  it('offers Depth for a picture Loupe shows that has a depth map, whatever the tool', () => {
    const portrait = fakeInfo({ kinds: ['portrait-depth'], embedded: [depthMap] })
    expect(stageViews(portrait, { shows: true })).toEqual(['picture', 'depth'])
    expect(stageViews(portrait, { shows: false })).toEqual(['picture'])
    expect(stageViews(fakeInfo({ kinds: ['portrait-depth'] }), { shows: true })).toEqual(['picture'])
    expect(shownView('depth', portrait, { shows: true })).toBe('depth')
    expect(tool('depth', 'forensics', 'info')).toBe('depth')
  })

  it('offers 360° for an equirectangular panorama where WebGL 2 works', () => {
    const pano = fakeInfo({ kinds: ['panorama-360'] })
    expect(stageViews(pano, { shows: true, webgl2: true })).toEqual(['picture', 'pano'])
    expect(stageViews(pano, { shows: true, webgl2: false })).toEqual(['picture'])
    expect(stageViews(pano, { shows: false, webgl2: true })).toEqual(['picture'])
    expect(shownView('pano', pano, { shows: true, webgl2: false })).toBe('picture')
  })

  it('draws Error levels, Noise and Depth over the picture, and nothing else', () => {
    expect(['picture', 'map', 'ela', 'noise', 'depth', 'pano'].filter((v) => isLayer(v as never))).toEqual([
      'ela',
      'noise',
      'depth',
    ])
  })

  it('names the views as the toolbar shows them', () => {
    expect(VIEW_LABELS).toMatchObject({ ela: 'Error levels', noise: 'Noise', depth: 'Depth', pano: '360°' })
  })

  it('offers Compare while Export has a result for this file, and leaves it with Export (SPEC.md 6.11)', () => {
    expect(stageViews(fakeInfo(), { compare: true })).toEqual(['picture', 'compare'])
    expect(VIEW_LABELS.compare).toBe('Compare')
    expect(shownView('compare', fakeInfo(), {})).toBe('picture')
    expect(tool('compare', 'export', 'info')).toBe('picture')
    expect(tool('picture', 'export', 'info')).toBe('picture')
  })

  it('offers Text while the Text tool has read a picture Loupe shows, and leaves it with the tool (SPEC.md 6.12)', () => {
    expect(stageViews(fakeInfo(), { text: true, shows: true })).toEqual(['picture', 'text'])
    expect(stageViews(fakeInfo(), { text: true, shows: false })).toEqual(['picture'])
    expect(VIEW_LABELS.text).toBe('Text')
    expect(shownView('text', fakeInfo(), { shows: true })).toBe('picture')
    expect(tool('text', 'text', 'info')).toBe('picture')
    expect(tool('text', 'text', 'location')).toBe('map')
  })
})

describe('Moving between views (SPEC.md section 5)', () => {
  it('goes to the view the user chooses, from a chip or a Forensics section', () => {
    expect(nextView('picture', { type: 'choose', view: 'ela' })).toBe('ela')
    expect(nextView('ela', { type: 'choose', view: 'picture' })).toBe('picture')
    expect(nextView('map', { type: 'choose', view: 'depth' })).toBe('depth')
  })

  it('goes to Map when Edit metadata’s Location goes to Set, and back to Picture from Map when it leaves Set', () => {
    expect(nextView('picture', { type: 'picking', picking: true })).toBe('map')
    expect(nextView('map', { type: 'picking', picking: false })).toBe('picture')
    // A view chosen meanwhile stays.
    expect(nextView('depth', { type: 'picking', picking: false })).toBe('depth')
  })

  it('goes to Text when the Text tool finds lines', () => {
    expect(nextView('picture', { type: 'lines' })).toBe('text')
    expect(nextView('map', { type: 'lines' })).toBe('text')
  })

  it('keeps a view while it’s on offer', () => {
    expect(nextView('compare', { type: 'offered', views: ['picture', 'compare'] })).toBe('compare')
    expect(nextView('map', { type: 'offered', views: ['picture', 'map', 'ela', 'noise'] })).toBe('map')
  })

  it('forgets a view once it’s no longer offered, so it doesn’t come back by itself', () => {
    // Compare chosen, its export removed from the strip, another made.
    let view = nextView('picture', { type: 'choose', view: 'compare' })
    view = nextView(view, { type: 'offered', views: ['picture'] })
    expect(view).toBe('picture')
    view = nextView(view, { type: 'offered', views: ['picture', 'compare'] })
    expect(view).toBe('picture')
  })

  it('forgets Text while the picture is read again, and goes back once the new read finds lines', () => {
    let view = nextView('text', { type: 'offered', views: ['picture'] })
    expect(view).toBe('picture')
    view = nextView(view, { type: 'lines' })
    expect(view).toBe('text')
  })
})
