import { describe, expect, it } from 'vitest'
import { mapMotion } from './still'

describe('mapMotion', () => {
  it('turns off every animation Leaflet runs when reduced motion is asked for', () => {
    expect(mapMotion(true)).toEqual({
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: false,
    })
  })

  it('leaves Leaflet’s own otherwise', () => {
    expect(mapMotion(false)).toEqual({
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      inertia: true,
    })
  })
})
