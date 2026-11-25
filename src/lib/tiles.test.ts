import { describe, expect, it } from 'vitest'
import { maxZoom, nextTiles, startTiles, TILE_TIMEOUT_MS, type TileEvent, type TileState } from './tiles'

const run = (state: TileState, ...events: TileEvent[]) => events.reduce(nextTiles, state)

describe('The map’s tile switch (SPEC.md 6.2)', () => {
  it('asks for tiles at once when online, and draws only the outlines when offline', () => {
    expect(startTiles(true)).toBe('trying')
    expect(startTiles(false)).toBe('outlines')
  })

  it('switches to the tiles when the first one loads', () => {
    expect(run('trying', 'load')).toBe('tiles')
  })

  it('keeps the outlines, saying nothing, when no tile loads in 5 s or tiles fail', () => {
    expect(TILE_TIMEOUT_MS).toBe(5000)
    expect(run('trying', 'timeout')).toBe('outlines')
    expect(run('trying', 'error')).toBe('outlines')
  })

  it('ignores a tile that loads after it gave up', () => {
    expect(run('trying', 'timeout', 'load')).toBe('outlines')
  })

  it('tries again when the browser goes online', () => {
    expect(run('outlines', 'online')).toBe('trying')
    expect(run('trying', 'error', 'online', 'load')).toBe('tiles')
  })

  it('keeps whatever is showing when the browser goes offline', () => {
    expect(run('tiles', 'offline')).toBe('tiles')
    expect(run('outlines', 'offline')).toBe('outlines')
    expect(run('trying', 'offline')).toBe('trying')
  })

  it('keeps the tiles once they show, whatever fails later', () => {
    expect(run('tiles', 'error', 'timeout', 'online')).toBe('tiles')
  })

  it('zooms 1–7 over the outlines and up to 19 over the tiles', () => {
    expect(maxZoom('outlines')).toBe(7)
    expect(maxZoom('trying')).toBe(7)
    expect(maxZoom('tiles')).toBe(19)
  })
})
