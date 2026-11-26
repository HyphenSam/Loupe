import { ImageUp, MonitorX } from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useZoomPan } from '@/hooks/useZoomPan'
import { isNeutral, type Adjustments } from '@/lib/adjust'
import type { LayerState } from '@/hooks/useLayer'
import type { Source } from '@/hooks/useSource'
import { cn } from '@/lib/cn'
import { cssTurn, toUpright, type CropTool } from '@/lib/crop'
import type { Pixels, Rect } from '@/lib/pixels'
import type { Rgba } from '@/lib/protocol'
import type { Fill } from '@/lib/redact'
import { magnifierZoom, type StageSettings } from '@/lib/settings'
import { VIEW_LABELS, type StageView } from '@/lib/views'
import { readoutWords } from '@/lib/words'
import { clampPan, fitted, zoomAt, type Size, type View } from '@/lib/zoom'
import { Button } from '../ui/Button'
import { AdjustPreview } from './AdjustPreview'
import { CompareStage, type Compared } from './CompareStage'
import { CropFrame } from './CropFrame'
import { Magnifier } from './Magnifier'
import type { Placing } from './MapView'
import { PanoramaView } from './PanoramaView'
import { RedactBoxes } from './RedactBoxes'
import { PictureControls, StageToolbar } from './StageToolbar'

// Leaflet and the outlines load only when the map is first shown.
const MapView = lazy(() => import('./MapView'))

type Props = {
  supported: boolean
  source: Source | null
  settings: StageSettings
  onSettings: (settings: StageSettings) => void
  onBrowse: () => void
  /** One exact pixel of the open picture, from the worker. */
  pixel: (x: number, y: number) => Promise<Rgba | null>
  /** The open picture's upright pixels, its longer side at most `maxSide`: the 360° view's texture. */
  pixels: (maxSide: number) => Promise<Pixels>
  /** The same, adjusted by the worker: Adjust's preview. */
  adjusted: (maxSide: number, adjustments: Adjustments) => Promise<Pixels>
  /** The view chips the open file offers, the one shown, and the user's choice. */
  views: StageView[]
  view: StageView
  onView: (view: StageView) => void
  /** Whether the map shows OpenStreetMap's tiles. */
  onTiles: (showing: boolean) => void
  /** Edit metadata placing a new location on the map. */
  pick?: Placing
  /** Forensics' layer or the depth map, drawn over the picture when the view is one. */
  layer?: LayerState | null
  /** Crop and rotate: the picture drawn turned and straightened as the job will, the frame over it, and the
   * lossless grid's chip. */
  crop?: { tool: CropTool; onTool: (tool: CropTool) => void; chip: string | null }
  /** Redact: the boxes over the picture, drawn and changed there. */
  redact?: Redacting
  /** Adjust: the adjustment previewed over the picture. */
  adjust?: Adjustments
  /** Export's newest result and how to make a PNG of the source, for the Compare view. */
  compare?: { result: Compared; originalPng: () => Promise<Blob> }
}

export type Redacting = {
  boxes: Rect[]
  fill: Fill
  selected: number | null
  onBoxes: (boxes: Rect[]) => void
  onSelect: (index: number | null) => void
}

/** The dark area where the picture sits (SPEC.md section 5): the drop target before a file is open, the
 * picture with its toolbar once one is, or why this browser can't be used. */
export function Stage({
  supported,
  source,
  settings,
  onSettings,
  onBrowse,
  pixel,
  pixels,
  adjusted,
  views,
  view,
  onView,
  onTiles,
  pick,
  layer,
  crop,
  redact,
  adjust,
  compare,
}: Props) {
  return (
    <div
      className={cn(
        'on-stage relative flex min-h-0 flex-1 flex-col',
        settings.background === 'light' ? 'bg-stage-light text-stage-light-ink' : 'bg-stage text-stage-ink',
        source && settings.background === 'checker' && 'checker',
      )}
    >
      {!supported ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <MonitorX aria-hidden="true" className="size-6 text-stage-ink-soft" strokeWidth={1.75} />
          <h2 className="text-lg leading-snug font-semibold">This browser is too old for Loupe</h2>
          <p className="max-w-sm text-[13px] text-stage-ink-soft">
            Loupe needs WebAssembly and Web Workers. Any current version of Chrome, Edge, Firefox or Safari has both.
          </p>
        </div>
      ) : source?.info && view === 'map' && (source.info.gps || pick) ? (
        <Suspense
          fallback={
            <p className="flex flex-1 items-center justify-center text-[13px] text-stage-ink-soft">Loading the map…</p>
          }
        >
          <MapView
            // A fresh map for each file, and for placing a pin rather than showing the picture's.
            key={`${source.id}-${pick ? 'pick' : 'show'}`}
            info={source.info}
            views={views}
            view={view}
            onView={onView}
            onTiles={onTiles}
            pick={pick}
          />
        </Suspense>
      ) : source && view === 'compare' && compare ? (
        <CompareStage
          key={source.id}
          source={source}
          result={compare.result}
          originalPng={compare.originalPng}
          settings={settings}
          onSettings={onSettings}
          views={views}
          view={view}
          onView={onView}
        />
      ) : source?.info && view === 'pano' ? (
        <PanoramaView
          key={source.id}
          name={source.file.name}
          pixels={pixels}
          views={views}
          view={view}
          onView={onView}
          light={settings.background === 'light'}
        />
      ) : source ? (
        <PictureView
          key={source.id}
          source={source}
          settings={settings}
          onSettings={onSettings}
          pixel={pixel}
          views={views}
          view={view}
          onView={onView}
          pixels={pixels}
          adjusted={adjusted}
          layer={layer}
          crop={crop}
          redact={redact}
          adjust={adjust}
        />
      ) : (
        <div className="m-4 flex flex-1 flex-col items-center justify-center gap-4 rounded-panel border-2 border-dashed border-stage-line px-6 py-10 text-center lg:m-5">
          <ImageUp aria-hidden="true" className="size-6 text-stage-ink-soft" strokeWidth={1.75} />
          <div>
            <h2 className="text-lg leading-snug font-semibold">Drop an image here</h2>
            <p className="mt-1 max-w-sm text-xs text-stage-ink-soft">
              JPEG, PNG, WebP, AVIF, HEIC, JPEG XL, GIF, BMP, TIFF or a camera raw file. You can also paste one.
            </p>
          </div>
          <Button variant="primary" onClick={onBrowse}>
            Choose file
          </Button>
          <p className="mt-4 text-xs text-stage-ink-soft">Runs on your device. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  )
}

/** A file's object URL for as long as the component shows it. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) return setUrl(null)
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

const PAN_STEP = 40
/** The longer side of the copy Redact's blur and pixelate, and Adjust, are previewed on. */
const PREVIEW_SIDE = 2048

function PictureView({
  source,
  settings,
  onSettings,
  pixel,
  views,
  view: stageView,
  onView,
  pixels,
  adjusted,
  layer,
  crop: cropProp,
  redact: redactProp,
  adjust: adjustProp,
}: Omit<Props, 'supported' | 'onBrowse' | 'source' | 'onTiles' | 'compare'> & { source: Source }) {
  const { picture, info } = source
  const viewport = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const layerCanvas = useRef<HTMLCanvasElement>(null)
  const [stageSize, setStageSize] = useState<Size | null>(null)
  const [natural, setNatural] = useState<Size | null>(null)
  const [broken, setBroken] = useState(false)
  const url = useObjectUrl(picture?.type === 'file' ? source.file : null)

  // The picture's upright size in the worker's coordinates, which the readout and the magnifier use.
  const drawn = picture?.type === 'pixels' ? picture : null
  const pictureSize: Size | null =
    picture?.type === 'file'
      ? natural
      : drawn
        ? drawn.scaled && info
          ? { width: info.displayWidth, height: info.displayHeight }
          : { width: drawn.pixels.width, height: drawn.pixels.height }
        : null
  // Cropping, the stage holds the picture as turned: its box is the turned size, and the picture is drawn
  // upright in the middle of it and turned there with CSS. Sizes are the full picture's, as the frame's are.
  const crop = cropProp && info && stageView === 'picture' ? cropProp : null
  const redact = redactProp && info && stageView === 'picture' ? redactProp : null
  const adjust = adjustProp && info && stageView === 'picture' && !isNeutral(adjustProp) ? adjustProp : null
  // Boxes are drawn on the upright picture, at its full size, before an <img> has said how large it is.
  const upright = (crop || redact) && info ? { width: info.displayWidth, height: info.displayHeight } : pictureSize
  // What zoom and pan work on: the picture, or its turned box.
  const size = crop && upright && crop.tool.turn >= 5 ? { width: upright.height, height: upright.width } : upright
  const colorSpace: PredefinedColorSpace = info?.colour.space === 'display-p3' ? 'display-p3' : 'srgb'

  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    const measure = () => setStageSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Decoded pixels go on a canvas tagged with the picture's colour space, so Display P3 shows as such.
  useEffect(() => {
    const el = canvas.current
    if (!el || !drawn) return
    const { width, height, data } = drawn.pixels
    el.width = width
    el.height = height
    const context = el.getContext('2d', { colorSpace })
    context?.putImageData(new ImageData(new Uint8ClampedArray(data), width, height, { colorSpace }), 0, 0)
  }, [drawn, colorSpace])

  // Blur and pixelate are shown on a copy scaled to the stage, asked for once.
  const [preview, setPreview] = useState<Pixels | null>(null)
  const latestPixels = useRef(pixels)
  latestPixels.current = pixels
  const wantsPreview = !!redact && redact.fill !== 'black' && !preview
  useEffect(() => {
    if (!wantsPreview) return
    let live = true
    latestPixels.current(PREVIEW_SIDE).then(
      (p) => live && setPreview(p),
      () => {},
    )
    return () => {
      live = false
    }
  }, [wantsPreview])

  // The layer is greyscale, so it needs no colour space; the worker made its pixels for this, so no copy.
  const layerPixels = layer?.pixels ?? null
  useEffect(() => {
    const el = layerCanvas.current
    if (!el || !layerPixels) return
    const { width, height, data } = layerPixels
    el.width = width
    el.height = height
    el.getContext('2d')?.putImageData(new ImageData(data as ImageDataArray, width, height), 0, 0)
  }, [layerPixels])

  // Cropping, Fit leaves room around the picture for the frame's handles, clear of the toolbar and the chips.
  const fit = (): View | null => {
    if (!size || !stageSize) return null
    if (!crop) return fitted(size, stageSize)
    const room = { x: 32, top: 60, bottom: 44 }
    const inner = {
      width: Math.max(1, stageSize.width - 2 * room.x),
      height: Math.max(1, stageSize.height - room.top - room.bottom),
    }
    const view = fitted(size, inner)
    return { ...view, x: view.x + room.x, y: view.y + room.top }
  }
  const zoom = useZoomPan({ size, viewport: stageSize, stage: viewport, fit })
  const view: View | null = zoom.view ?? fit()
  // A turn or \ changes what's fitted; start again from Fit.
  const sizeKey = size ? `${size.width}×${size.height}` : ''
  const { reset } = zoom
  useEffect(() => reset(), [sizeKey])

  function actualSize() {
    if (!size || !stageSize) return
    if (fitted(size, stageSize).scale >= 1) return zoom.reset()
    const centre = { x: stageSize.width / 2, y: stageSize.height / 2 }
    const current = zoom.view ?? fit() ?? fitted(size, stageSize)
    zoom.set(clampPan(zoomAt(current, centre, 1 / current.scale, size, stageSize), size, stageSize))
  }

  // The pixel under the pointer (or the magnifier moved by keyboard), and its exact colour from the worker:
  // one request at a time, the latest position winning.
  const [hover, setHover] = useState<{ x: number; y: number; client: { x: number; y: number } } | null>(null)
  const [colour, setColour] = useState<{ x: number; y: number; rgba: Rgba } | null>(null)
  const want = useRef<{ x: number; y: number } | null>(null)
  const asking = useRef(false)
  const ask = useCallback(() => {
    const point = want.current
    if (!point || asking.current) return
    asking.current = true
    pixel(point.x, point.y).then(
      (rgba) => {
        asking.current = false
        if (rgba) setColour({ ...point, rgba })
        if (want.current && (want.current.x !== point.x || want.current.y !== point.y)) ask()
      },
      () => (asking.current = false),
    )
  }, [pixel])

  function aim(x: number, y: number, client: { x: number; y: number }) {
    setHover({ x, y, client })
    want.current = { x, y }
    ask()
  }

  /** The upright picture's pixel under the pointer, through the turn and straightening while cropping. */
  function pointAt(event: { clientX: number; clientY: number }) {
    const rect = viewport.current?.getBoundingClientRect()
    if (!rect || !view || !size || !upright) return null
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const at = { x: (local.x - view.x) / view.scale, y: (local.y - view.y) / view.scale }
    if (crop) {
      const point = toUpright(at, crop.tool.turn, crop.tool.straighten, upright)
      return point && { ...point, client: local }
    }
    const [x, y] = [Math.floor(at.x), Math.floor(at.y)]
    return x >= 0 && y >= 0 && x < size.width && y < size.height ? { x, y, client: local } : null
  }

  const readable = !!picture && picture.type !== 'none' && !broken

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    zoom.handlers.onPointerMove(event)
    const point = readable ? pointAt(event) : null
    if (point) aim(point.x, point.y, point.client)
    else {
      setHover(null)
      want.current = null
    }
  }

  // Wheel zooms the picture, or the magnifier while it's on; never the page.
  const wheel = useRef<(event: WheelEvent) => void>(() => {})
  wheel.current = (event: WheelEvent) => {
    event.preventDefault()
    if (settings.magnifier && hover) {
      onSettings({ ...settings, magnification: magnifierZoom(settings.magnification, event.deltaY < 0 ? 1 : -1) })
      return
    }
    zoom.handlers.onWheel(event)
  }
  useEffect(() => {
    const el = viewport.current
    const listener = (event: WheelEvent) => wheel.current(event)
    el?.addEventListener('wheel', listener, { passive: false })
    return () => el?.removeEventListener('wheel', listener)
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const centre = stageSize ? { x: stageSize.width / 2, y: stageSize.height / 2 } : undefined
    if (event.key === '0') zoom.reset()
    else if (event.key === '1') actualSize()
    else if (event.key === '+' || event.key === '=') zoom.zoomBy(1.25, centre)
    else if (event.key === '-' || event.key === '_') zoom.zoomBy(0.8, centre)
    else if (arrows[event.key] && settings.magnifier && size && view && readable && !crop) {
      // The magnifier moves a pixel at a time (ten with Shift), from the middle if it isn't anywhere yet.
      const [dx, dy] = arrows[event.key]
      const step = event.shiftKey ? 10 : 1
      const from = hover ?? { x: Math.floor(size.width / 2), y: Math.floor(size.height / 2) }
      const x = Math.min(size.width - 1, Math.max(0, from.x + dx * step))
      const y = Math.min(size.height - 1, Math.max(0, from.y + dy * step))
      aim(x, y, { x: view.x + (x + 0.5) * view.scale, y: view.y + (y + 0.5) * view.scale })
    } else if (arrows[event.key] && zoom.view && size && stageSize) {
      const [dx, dy] = arrows[event.key]
      zoom.set(
        clampPan({ ...zoom.view, x: zoom.view.x - dx * PAN_STEP, y: zoom.view.y - dy * PAN_STEP }, size, stageSize),
      )
    } else return
    event.preventDefault()
  }

  const hex =
    colour && hover && colour.x === hover.x && colour.y === hover.y
      ? readoutWords(colour.x, colour.y, colour.rgba, !!info?.alpha)
      : null
  // The magnifier looks at what's shown: the layer over the picture, when there is one.
  const source2d = layerPixels ? layerCanvas.current : picture?.type === 'file' ? image.current : canvas.current
  const sourceScale =
    layerPixels && upright
      ? layerPixels.width / upright.width
      : drawn && upright
        ? drawn.pixels.width / upright.width
        : 1
  const layerName = layer ? VIEW_LABELS[layer.layer].toLowerCase() : null
  // Under an opaque layer the picture would only show at its anti-aliased edges, in colour.
  const under = layerPixels ? 'invisible' : undefined
  const placed = view && size && upright
  const style = placed
    ? crop
      ? {
          // Upright in the middle of the turned box, turned about its centre.
          left: ((size.width - upright.width) * view.scale) / 2,
          top: ((size.height - upright.height) * view.scale) / 2,
          width: upright.width * view.scale,
          height: upright.height * view.scale,
          transform: cssTurn(crop.tool.turn, crop.tool.straighten),
          transformOrigin: 'center',
          imageRendering: view.scale > 1 ? ('pixelated' as const) : undefined,
        }
      : {
          width: size.width * view.scale,
          height: size.height * view.scale,
          transform: `translate(${view.x}px, ${view.y}px)`,
          // Pixels stay sharp past 100%, so they can be judged.
          imageRendering: view.scale > 1 ? ('pixelated' as const) : undefined,
        }
    : { opacity: 0 }
  const turned = crop ? cssTurn(crop.tool.turn, crop.tool.straighten) : undefined

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <StageToolbar views={views} view={stageView} onView={onView} light={settings.background === 'light'}>
        <PictureControls
          zoom={view ? `${Math.round(view.scale * 100)}%` : ''}
          fitted={!zoom.view}
          settings={settings}
          onSettings={onSettings}
          onFit={() => zoom.reset()}
          onActualSize={actualSize}
          onZoom={(factor) =>
            zoom.zoomBy(factor, stageSize ? { x: stageSize.width / 2, y: stageSize.height / 2 } : undefined)
          }
          light={settings.background === 'light'}
        />
      </StageToolbar>
      <div
        ref={viewport}
        tabIndex={0}
        role="img"
        aria-label={[
          source.file.name,
          layerName,
          adjust && 'adjusted',
          info && `${info.displayWidth} × ${info.displayHeight}`,
        ]
          .filter(Boolean)
          .join(', ')}
        aria-roledescription="picture"
        className={cn(
          'relative min-h-0 flex-1 touch-none overflow-hidden outline-offset-[-2px] select-none',
          zoom.view && !settings.magnifier && 'cursor-grab active:cursor-grabbing',
          settings.magnifier && readable && 'cursor-none',
        )}
        onKeyDown={onKeyDown}
        onPointerDown={zoom.handlers.onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={zoom.handlers.onPointerUp}
        onPointerLeave={() => {
          setHover(null)
          want.current = null
        }}
      >
        {/* Cropping, the turned box: it holds the frame, and its inner box clips the straightened picture's corners.
            Otherwise neither makes a box, so the picture isn't remounted (and its canvas redrawn) on the way in and
            out. */}
        <div
          className={crop && placed ? 'absolute top-0 left-0' : 'contents'}
          style={
            crop && placed
              ? {
                  width: size.width * view.scale,
                  height: size.height * view.scale,
                  transform: `translate(${view.x}px, ${view.y}px)`,
                }
              : undefined
          }
        >
          <div className={crop && placed ? 'absolute inset-0 overflow-hidden' : 'contents'}>
            {picture?.type === 'file' && url && !broken && (
              <img
                ref={image}
                src={url}
                alt=""
                draggable={false}
                onLoad={(e) =>
                  setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
                }
                onError={() => setBroken(true)}
                className={cn('absolute top-0 left-0 max-w-none origin-top-left', under)}
                style={style}
              />
            )}
            {drawn && (
              <canvas
                ref={canvas}
                className={cn('absolute top-0 left-0 max-w-none origin-top-left', under)}
                style={style}
              />
            )}
            {adjust && !layerPixels && (
              <AdjustPreview
                adjustments={adjust}
                adjusted={(a) => adjusted(PREVIEW_SIDE, a)}
                colorSpace={colorSpace}
                style={style}
              />
            )}
            {layerPixels && (
              <canvas
                ref={layerCanvas}
                aria-hidden="true"
                className="absolute top-0 left-0 max-w-none origin-top-left"
                style={style}
              />
            )}
          </div>
          {crop && placed && info && <CropFrame tool={crop.tool} info={info} scale={view.scale} onTool={crop.onTool} />}
        </div>
        {redact && placed && (
          <div
            className="absolute top-0 left-0"
            style={{
              width: size.width * view.scale,
              height: size.height * view.scale,
              transform: `translate(${view.x}px, ${view.y}px)`,
            }}
          >
            <RedactBoxes
              boxes={redact.boxes}
              fill={redact.fill}
              selected={redact.selected}
              size={size}
              scale={view.scale}
              preview={preview}
              onBoxes={redact.onBoxes}
              onSelect={redact.onSelect}
            />
          </div>
        )}
        {(picture?.type === 'none' || broken) && (
          <p className="absolute inset-0 m-auto flex max-w-sm items-center justify-center px-6 text-center text-[13px] text-stage-ink-soft">
            {picture?.type === 'none'
              ? picture.message
              : 'This browser couldn’t show the picture. Its metadata is listed.'}
          </p>
        )}
        {!picture && (
          <p className="absolute inset-0 flex items-center justify-center text-[13px] text-stage-ink-soft">Opening…</p>
        )}
        {settings.magnifier && hover && source2d && (
          <Magnifier
            source={source2d}
            scale={sourceScale}
            point={hover}
            at={hover.client}
            magnification={settings.magnification}
            colour={hex ? hex.split(' · ')[1] : null}
            colorSpace={colorSpace}
            transform={turned}
          />
        )}
      </div>
      <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex items-end justify-between gap-2">
        <p
          className={cn(
            'min-h-6 rounded-full px-2.5 py-0.5 font-mono text-xs',
            hex ? 'bg-black/55 text-stage-ink backdrop-blur-sm' : 'invisible',
          )}
          aria-live="off"
        >
          {hex ?? ' '}
        </p>
        <div className="flex gap-1.5">
          {layer?.error ? (
            <Chip>{layer.error}</Chip>
          ) : (
            layer?.busy && (
              <Chip>{layer.layer === 'depth' ? 'Reading the depth map…' : `Working out ${layerName}…`}</Chip>
            )
          )}
          {crop?.chip && <Chip>{crop.chip}</Chip>}
          {drawn?.preview && <Chip>Embedded preview</Chip>}
          {drawn?.scaled && <Chip>Preview scaled to fit this browser</Chip>}
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-xs text-stage-ink backdrop-blur-sm">{children}</span>
  )
}
