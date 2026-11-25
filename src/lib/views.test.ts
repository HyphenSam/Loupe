import { describe, expect, it } from 'vitest'
import { fakeInfo } from './testing'
import { shownView, stageViews, viewForTool } from './views'

const gps = { lat: -44.9405, lon: 168.8263, altitude: null, direction: null, speed: null, accuracy: null }

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
})
