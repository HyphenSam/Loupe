/** When the Location map shows OpenStreetMap's tiles rather than the bundled outlines (SPEC.md 6.2).
 * `navigator.onLine` can be true with no internet, so tiles are only asked for ('trying', hidden under the
 * outlines) until the first one loads. If none loads within 5 s, or one fails, the outlines stay and
 * nothing is said; going online later tries again, going offline keeps whatever is showing. */

export type TileState = 'outlines' | 'trying' | 'tiles'
export type TileEvent = 'load' | 'error' | 'timeout' | 'online' | 'offline'

export const TILE_TIMEOUT_MS = 5000

/** OpenStreetMap's standard tiles. Requested in CORS mode, which COEP `require-corp` needs; OpenStreetMap
 * sends `Access-Control-Allow-Origin` on them. Never cached by the service worker (vite.config.ts). */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export const startTiles = (online: boolean): TileState => (online ? 'trying' : 'outlines')

export function nextTiles(state: TileState, event: TileEvent): TileState {
  if (state === 'tiles') return state
  if (state === 'trying')
    return event === 'load' ? 'tiles' : event === 'error' || event === 'timeout' ? 'outlines' : state
  return event === 'online' ? 'trying' : state
}

/** The outlines are 1:50m, which says nothing past zoom 7; the tiles go to street level and beyond. */
export const maxZoom = (state: TileState) => (state === 'tiles' ? 19 : 7)
