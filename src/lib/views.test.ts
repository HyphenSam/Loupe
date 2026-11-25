import { describe, expect, it } from 'vitest'
import type { Embedded } from './info'
import { fakeInfo } from './testing'
import { isLayer, shownView, stageViews, viewForTool, VIEW_LABELS } from './views'

const gps = { lat: -44.9405, lon: 168.8263, altitude: null, direction: null, speed: null, accuracy: null }
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
    expect(viewForTool('picture', 'info', 'location')).toBe('map')
    expect(viewForTool('map', 'location', 'info')).toBe('picture')
    expect(viewForTool('picture', 'location', 'privacy')).toBe('picture')
  })

  it('leaves the view as it is between other tools', () => {
    expect(viewForTool('map', 'info', 'privacy')).toBe('map')
    expect(viewForTool('picture', 'info', 'crop')).toBe('picture')
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
    expect(viewForTool('picture', 'info', 'edit-metadata', true)).toBe('map')
    expect(viewForTool('picture', 'info', 'edit-metadata', false)).toBe('picture')
    expect(viewForTool('map', 'edit-metadata', 'info', true)).toBe('picture')
    expect(viewForTool('map', 'edit-metadata', 'location', true)).toBe('map')
  })

  it('offers Error levels and Noise while Forensics is open on a picture Loupe shows', () => {
    expect(stageViews(fakeInfo({ gps: null }), { layers: true })).toEqual(['picture', 'ela', 'noise'])
    expect(stageViews(fakeInfo({ gps }), { layers: true })).toEqual(['picture', 'map', 'ela', 'noise'])
    expect(shownView('ela', fakeInfo(), { layers: true })).toBe('ela')
    expect(shownView('noise', fakeInfo(), { layers: false })).toBe('picture')
  })

  it('switches back to Picture on leaving Forensics from a layer, and leaves the view on opening it', () => {
    expect(viewForTool('ela', 'forensics', 'info')).toBe('picture')
    expect(viewForTool('noise', 'forensics', 'location')).toBe('map')
    expect(viewForTool('picture', 'info', 'forensics')).toBe('picture')
    expect(viewForTool('map', 'info', 'forensics')).toBe('map')
  })

  it('offers Depth for a picture Loupe shows that has a depth map, whatever the tool', () => {
    const portrait = fakeInfo({ kinds: ['portrait-depth'], embedded: [depthMap] })
    expect(stageViews(portrait, { shows: true })).toEqual(['picture', 'depth'])
    expect(stageViews(portrait, { shows: false })).toEqual(['picture'])
    expect(stageViews(fakeInfo({ kinds: ['portrait-depth'] }), { shows: true })).toEqual(['picture'])
    expect(shownView('depth', portrait, { shows: true })).toBe('depth')
    expect(viewForTool('depth', 'forensics', 'info')).toBe('depth')
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
})
