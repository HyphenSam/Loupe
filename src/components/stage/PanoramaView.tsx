import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { drag, FRAGMENT_SHADER, keyLook, pinchLook, START, VERTEX_SHADER, wheel, type Look } from '@/lib/pano'
import type { Pixels } from '@/lib/pixels'
import type { StageView } from '@/lib/views'
import { StageToolbar, ZoomButtons } from './StageToolbar'

type Point = { x: number; y: number }

/** Textures this large work on every WebGL 2 device; bigger panoramas are scaled down to the device's limit. */
const LARGEST = 8192

const NO_WEBGL = 'This browser couldn’t start WebGL 2, so the 360° view can’t be drawn.'

type Drawing = { gl: WebGL2RenderingContext; program: WebGLProgram; texture: WebGLTexture }

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
  return shader
}

/** WebGL 2 with the view's one shader and two triangles over the canvas; null where it won't start. */
function start(canvas: HTMLCanvasElement): Drawing | null {
  const gl = canvas.getContext('webgl2')
  if (!gl) return null
  try {
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const corner = gl.getAttribLocation(program, 'corner')
    gl.enableVertexAttribArray(corner)
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    // Round the sides, so the seam behind the viewer joins; no mipmaps, whose choice jumps at the seam.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    return { gl, program, texture }
  } catch {
    return null
  }
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** The 360° view (SPEC.md section 5): an equirectangular panorama drawn with one WebGL shader. Drag or the arrow
 * keys look around; the wheel, + and − change the field of view (30°–100°); 0 looks ahead again. `pixels` gives
 * the upright picture, its longer side at most the size asked for. */
export function PanoramaView({
  name,
  pixels,
  views,
  view,
  onView,
  light,
}: {
  name: string
  pixels: (maxSide: number) => Promise<Pixels>
  views: StageView[]
  view: StageView
  onView: (view: StageView) => void
  light: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<Drawing | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [look, setLook] = useState<Look>(START)
  // Each pointer down on the view, at its last position.
  const fingers = useRef(new Map<number, Point>())

  // WebGL, then the picture as a texture as large as the device takes.
  useEffect(() => {
    const el = canvas.current
    const found = el && start(el)
    if (!found) return setFailed(NO_WEBGL)
    drawing.current = found
    let live = true
    const { gl, texture } = found
    const largest = Math.min(LARGEST, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
    pixels(largest).then(
      (p) => {
        if (!live) return
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, p.width, p.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, p.data)
        setLoaded(true)
      },
      (e: unknown) => live && setFailed(e instanceof Error ? e.message : String(e)),
    )
    // A canvas has one context for life, so it isn't lost here: React runs this effect twice in development,
    // and the second start would find it dead. It goes with the canvas.
    return () => {
      live = false
    }
    // `pixels` is the client's; a new file mounts a new view.
  }, [])

  // Drawn again whenever the look, the size or the picture changes.
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const d = drawing.current
    const el = canvas.current
    if (!d || !el || !loaded || !size.width || !size.height) return
    const frame = requestAnimationFrame(() => {
      const scale = devicePixelRatio
      el.width = Math.round(size.width * scale)
      el.height = Math.round(size.height * scale)
      const { gl, program } = d
      gl.viewport(0, 0, el.width, el.height)
      gl.uniform3f(gl.getUniformLocation(program, 'look'), rad(look.yaw), rad(look.pitch), rad(look.fov))
      gl.uniform1f(gl.getUniformLocation(program, 'aspect'), size.width / size.height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    })
    return () => cancelAnimationFrame(frame)
  }, [look, size, loaded])

  // The wheel zooms the view, never the page.
  const onWheel = useRef<(event: WheelEvent) => void>(() => {})
  onWheel.current = (event) => {
    event.preventDefault()
    setLook((current) => wheel(current, event.deltaY))
  }
  useEffect(() => {
    const el = canvas.current?.parentElement
    const listener = (event: WheelEvent) => onWheel.current(event)
    el?.addEventListener('wheel', listener, { passive: false })
    return () => el?.removeEventListener('wheel', listener)
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const next = keyLook(look, event.key, event.shiftKey)
    if (!next) return
    event.preventDefault()
    setLook(next)
  }

  // One finger (or the mouse) looks around; two pinch the field of view.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = fingers.current.get(event.pointerId)
    if (!start) return
    const before = [...fingers.current.values()] as [Point, Point]
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (fingers.current.size === 2) {
      const after = [...fingers.current.values()] as [Point, Point]
      return setLook((current) => pinchLook(current, before, after))
    }
    if (fingers.current.size > 2) return
    const height = event.currentTarget.clientHeight || 1
    setLook((current) => drag(current, event.clientX - start.x, event.clientY - start.y, height))
  }
  const stop = (event: PointerEvent<HTMLDivElement>) => fingers.current.delete(event.pointerId)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <StageToolbar views={views} view={view} onView={onView} light={light}>
        <ZoomButtons
          onZoom={(factor) => setLook((current) => keyLook(current, factor > 1 ? '+' : '-', false)!)}
          light={light}
        />
        <span aria-label="Field of view" aria-live="polite" className="min-w-10 px-1 text-center text-xs tabular-nums">
          {Math.round(look.fov)}°
        </span>
      </StageToolbar>
      <div
        tabIndex={0}
        role="application"
        aria-roledescription="360° view"
        aria-label={`${name}, 360° view`}
        aria-describedby="pano-help"
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden outline-offset-[-2px] select-none active:cursor-grabbing"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" />
        {failed ? (
          <p className="absolute inset-0 m-auto flex max-w-sm items-center justify-center px-6 text-center text-[13px] text-stage-ink-soft">
            {failed}
          </p>
        ) : (
          !loaded && (
            <p className="absolute inset-0 flex items-center justify-center text-[13px] text-stage-ink-soft">
              Loading the panorama…
            </p>
          )
        )}
      </div>
      <p
        id="pano-help"
        className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-0.5 text-xs text-stage-ink backdrop-blur-sm"
      >
        Drag or use the arrow keys to look around; pinch, the wheel or + and − zoom; 0 looks ahead again.
      </p>
    </div>
  )
}
