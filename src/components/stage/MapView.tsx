import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useReducer, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import outlinesUrl from 'world-atlas/countries-50m.json?url'
import { useOnline } from '@/hooks/useOnline'
import { cn } from '@/lib/cn'
import { prepareCountries, type Outlines } from '@/lib/countries'
import { cone, destination, mapMetres, type LatLon } from '@/lib/geo'
import type { ImageInfo } from '@/lib/info'
import { locationView } from '@/lib/location'
import { maxZoom, nextTiles, startTiles, TILE_ATTRIBUTION, TILE_TIMEOUT_MS, TILE_URL } from '@/lib/tiles'
import type { StageView } from '@/lib/views'
import { StageToolbar, ZoomButtons } from './StageToolbar'

/** Country level over the outlines; street level once the tiles show. */
const START_ZOOM = 6
const STREET_ZOOM = 16

/** The pin: the accent, outlined in accent-ink so it reads on the sea, the land and the tiles. */
const PIN = L.divIcon({
  className: 'map-pin',
  html: '<svg viewBox="0 0 24 32" width="26" height="34" aria-hidden="true"><path d="M12 31s10-10.2 10-18.5a10 10 0 0 0-20 0C2 20.8 12 31 12 31z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
  iconSize: [26, 34],
  iconAnchor: [13, 33],
})

/** The world-atlas outlines as Leaflet rings, each unwrapped across the antimeridian (countries.ts). Fetched
 * once from the same file the worker reads, which the service worker precaches. */
let outlines: Promise<L.LatLngExpression[][][]> | null = null
function loadOutlines() {
  outlines ??= fetch(outlinesUrl)
    .then((r) => r.json() as Promise<Topology>)
    .then((topology) =>
      prepareCountries(feature(topology, topology.objects.countries) as Outlines).flatMap((country) =>
        country.shapes.map((shape) => shape.rings.map((ring) => ring.map(([lon, lat]) => [lat, lon] as L.LatLngTuple))),
      ),
    )
  outlines.catch(() => (outlines = null))
  return outlines
}

/** A point as Leaflet takes it, on the same side of the antimeridian as `near`. */
function latLng(point: LatLon, near: LatLon): L.LatLngTuple {
  const lon = point.lon + (point.lon - near.lon > 180 ? -360 : point.lon - near.lon < -180 ? 360 : 0)
  return [point.lat, lon]
}

/** Where the map starts with nothing to centre on: the whole world. */
const WORLD: L.LatLngTuple = [20, 0]
const WORLD_ZOOM = 2

/** Edit metadata's Set location (SPEC.md 6.7): the pin it places, or null before one is, and where to put it. */
export type Placing = { pin: LatLon | null; onPin: (at: LatLon) => void }

const wrapped = (at: L.LatLng): LatLon => {
  const { lat, lng } = at.wrap()
  return { lat, lon: lng }
}

/** One arrow key's step in screen pixels: one, or ten with Shift. */
function arrowStep(e: KeyboardEvent): [number, number] | null {
  const step = e.shiftKey ? 10 : 1
  const steps: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  return steps[e.key] ?? null
}

/** The stage's map (SPEC.md 6.2, DESIGN.md's Map): the bundled outlines at once, then OpenStreetMap's tiles if
 * one loads. For Location, the picture's pin, the field of view and a line towards the sun. With `pick`, for
 * Edit metadata, a pin the user places with a click, drags or moves with the arrow keys instead. `onTiles` says
 * whether tiles show, for the caption under the place. */
export default function MapView({
  info,
  views,
  view,
  onView,
  onTiles,
  pick,
}: {
  info: ImageInfo
  views: StageView[]
  view: StageView
  onView: (view: StageView) => void
  onTiles: (showing: boolean) => void
  pick?: Placing
}) {
  const gps = pick ? null : info.gps
  const location = gps ? locationView(info) : null
  // Where the map opens: the picture's location, or the pin being placed (the file's own, at first).
  const [centre] = useState<LatLon | null>(() => (pick ? (pick.pin ?? info.gps) : info.gps))
  const element = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [zoom, setZoom] = useState(centre ? START_ZOOM : WORLD_ZOOM)
  const online = useOnline()
  const [tiles, dispatch] = useReducer(nextTiles, online, startTiles)
  const asking = tiles !== 'outlines'
  const tileLayer = useRef<L.TileLayer | null>(null)
  const land = useRef<L.FeatureGroup | null>(null)
  const showingTiles = useRef(false)
  showingTiles.current = tiles === 'tiles'
  const onPin = useRef(pick?.onPin)
  onPin.current = pick?.onPin
  const picking = !!pick
  const marker = useRef<L.Marker | null>(null)

  useEffect(() => {
    const m = L.map(element.current!, {
      zoomControl: false,
      minZoom: 1,
      maxZoom: maxZoom('outlines'),
      // The outlines aren't repeated east and west, so neither is the map.
      maxBounds: [
        [-90, -200],
        [90, 200],
      ],
      maxBoundsViscosity: 1,
    }).setView(centre ? [centre.lat, centre.lon] : WORLD, centre ? START_ZOOM : WORLD_ZOOM)
    m.attributionControl.setPrefix(false)
    if (gps) L.marker([gps.lat, gps.lon], { icon: PIN, interactive: false, keyboard: false }).addTo(m)
    if (picking) m.on('click', (e: L.LeafletMouseEvent) => onPin.current?.(wrapped(e.latlng)))
    m.on('zoomend', () => setZoom(m.getZoom()))
    setMap(m)
    return () => {
      m.remove()
      marker.current = null
      setMap(null)
    }
  }, [centre, gps, picking])

  // The pin being placed: dragged, or moved a pixel at a time (ten with Shift) with the arrow keys once it has
  // focus. Coordinates typed into the settings move it, and the map follows it if it leaves the view.
  const pin = pick?.pin ?? null
  useEffect(() => {
    if (!map || !picking) return
    if (!pin) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (marker.current) marker.current.setLatLng([pin.lat, pin.lon])
    else {
      const m = L.marker([pin.lat, pin.lon], { icon: PIN, draggable: true, keyboard: true, title: 'New location' })
      m.on('dragend', () => onPin.current?.(wrapped(m.getLatLng())))
      m.addTo(map)
      m.getElement()!.addEventListener('keydown', (e) => {
        const step = arrowStep(e)
        if (!step) return
        e.preventDefault()
        e.stopPropagation()
        const point = map.latLngToContainerPoint(m.getLatLng()).add(step)
        onPin.current?.(wrapped(map.containerPointToLatLng(point)))
      })
      marker.current = m
    }
    if (!map.getBounds().contains([pin.lat, pin.lon])) map.panTo([pin.lat, pin.lon])
  }, [map, picking, pin?.lat, pin?.lon])

  // The bundled world map: sunken land, canvas sea, line borders (index.css), drawn once per map. If it
  // can't be read, the sea and the pin still show.
  useEffect(() => {
    if (!map) return
    let cancelled = false
    loadOutlines().then(
      (shapes) => {
        if (cancelled) return
        land.current = L.featureGroup(
          shapes.map((rings) => L.polygon(rings, { className: 'map-land', interactive: false })),
        )
        // The tiles may have won the race. The outlines arrive after the cone and the sun line, so they go
        // beneath them.
        if (!showingTiles.current) land.current.addTo(map).bringToBack()
      },
      () => {},
    )
    return () => {
      cancelled = true
      land.current?.remove()
      land.current = null
    }
  }, [map])

  useEffect(() => dispatch(online ? 'online' : 'offline'), [online])

  // Tiles are asked for, invisible under the outlines, until the first loads or 5 s pass.
  useEffect(() => {
    if (!map || !asking) return
    const layer = L.tileLayer(TILE_URL, {
      crossOrigin: 'anonymous',
      maxZoom: maxZoom('tiles'),
      noWrap: true,
      opacity: 0,
      attribution: TILE_ATTRIBUTION,
    })
    layer.on('tileload', () => dispatch('load'))
    layer.on('tileerror', () => dispatch('error'))
    layer.addTo(map)
    tileLayer.current = layer
    const timer = setTimeout(() => dispatch('timeout'), TILE_TIMEOUT_MS)
    return () => {
      clearTimeout(timer)
      layer.remove()
      tileLayer.current = null
    }
  }, [map, asking])

  useEffect(() => {
    if (!map || tiles !== 'tiles') return
    tileLayer.current?.setOpacity(1)
    land.current?.remove()
    map.setMaxZoom(maxZoom('tiles'))
    // Untouched since it opened on a place: go to street level, where the tiles say most.
    if (centre && map.getZoom() === START_ZOOM) map.setView([centre.lat, centre.lon], STREET_ZOOM, { animate: false })
  }, [map, tiles, centre])

  useEffect(() => {
    onTiles(tiles === 'tiles')
  }, [tiles, onTiles])
  useEffect(() => () => onTiles(false), [onTiles])

  // The field of view and the sun line keep their size on screen, so they're redrawn at each zoom.
  useEffect(() => {
    if (!map || !gps || !location) return
    const at = { lat: gps.lat, lon: gps.lon }
    const metres = mapMetres(zoom)
    const layers: L.Layer[] = []
    if (gps.direction && location.fieldOfView !== null) {
      const points = cone(at, gps.direction.degrees, location.fieldOfView, metres).map((p) => latLng(p, at))
      layers.push(L.polygon(points, { className: 'map-cone', interactive: false }))
    }
    if (location.sun.azimuth !== null) {
      const end = latLng(destination(at, location.sun.azimuth, metres * 1.5), at)
      layers.push(L.polyline([latLng(at, at), end], { className: 'map-sun', interactive: false }))
      layers.push(L.circleMarker(end, { className: 'map-sun-end', radius: 4, interactive: false }))
    }
    for (const layer of layers) layer.addTo(map)
    return () => layers.forEach((layer) => layer.remove())
  }, [map, zoom, info]) // `gps` and `location` follow `info`

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <StageToolbar views={views} view={view} onView={onView} light={false}>
        <ZoomButtons onZoom={(step) => (step > 1 ? map?.zoomIn() : map?.zoomOut())} light={false} />
      </StageToolbar>
      {/* Leaflet owns its element's classes, so the state goes on a wrapper. */}
      <div
        className={cn(
          'map isolate flex min-h-0 flex-1 flex-col',
          tiles === 'tiles' && 'map-tiles',
          picking && 'map-picking',
        )}
      >
        <div
          ref={element}
          role="region"
          aria-label="Map"
          aria-describedby="map-description"
          className="min-h-0 flex-1"
        />
      </div>
      <p id="map-description" className="sr-only">
        {picking ? (
          'Click the map to place the pin for the new location. Drag the pin, or focus it and use the arrow keys, to move it.'
        ) : (
          <>
            The pin marks where the picture was taken.
            {gps?.direction && location?.fieldOfView != null && ' The shaded wedge is what the camera saw.'}
            {location?.sun.azimuth != null && ' The dashed line points towards the sun.'}
          </>
        )}
      </p>
    </div>
  )
}
