/** The 360° view's look (SPEC.md section 5): where it looks and how wide, changed by dragging, the keys and the
 * wheel, and where a point on the stage lands in the equirectangular picture. The view's fragment shader does
 * `lookup` for every pixel; it's here, in plain numbers, so the tests can check it. */

/** Degrees: `yaw` turns right from the middle of the picture, `pitch` looks up, `fov` is the vertical field of
 * view. */
export type Look = { yaw: number; pitch: number; fov: number }

export const START: Look = { yaw: 0, pitch: 0, fov: 75 }

const FOV = { min: 30, max: 100 }
const PITCH = 85
const STEP = 5

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
/** Into (-180, 180]. */
const wrap = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180
  return d === -180 ? 180 : d
}

const turned = (look: Look, yaw: number, pitch: number): Look => ({
  ...look,
  yaw: wrap(look.yaw + yaw),
  pitch: clamp(look.pitch + pitch, -PITCH, PITCH),
})
const zoomed = (look: Look, fov: number): Look => ({ ...look, fov: clamp(fov, FOV.min, FOV.max) })

/** A drag by `dx`, `dy` pixels on a stage `height` pixels tall: the picture follows the pointer. */
export function drag(look: Look, dx: number, dy: number, height: number): Look {
  const perPixel = look.fov / height
  return turned(look, -dx * perPixel, dy * perPixel)
}

/** A key: arrows look around (Shift for further), `+` and `-` narrow and widen the view, `0` starts again. Null
 * for any other key. */
export function keyLook(look: Look, key: string, shift: boolean): Look | null {
  const step = shift ? STEP * 4 : STEP
  switch (key) {
    case 'ArrowLeft':
      return turned(look, -step, 0)
    case 'ArrowRight':
      return turned(look, step, 0)
    case 'ArrowUp':
      return turned(look, 0, step)
    case 'ArrowDown':
      return turned(look, 0, -step)
    case '+':
    case '=':
      return zoomed(look, look.fov - STEP)
    case '-':
    case '_':
      return zoomed(look, look.fov + STEP)
    case '0':
      return START
    default:
      return null
  }
}

/** The wheel: away from you narrows the view. */
export const wheel = (look: Look, deltaY: number): Look => zoomed(look, look.fov * Math.exp(deltaY * 0.001))

type Point = { x: number; y: number }
const apart = ([a, b]: [Point, Point]) => Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))

/** Two fingers moving from `from` to `to`: the field of view narrows as far as they spread (closer in), and widens
 * as they close. */
export const pinchLook = (look: Look, from: [Point, Point], to: [Point, Point]): Look =>
  zoomed(look, (look.fov * apart(from)) / apart(to))

const rad = (deg: number) => (deg * Math.PI) / 180

/** Where the stage's point `x`, `y` (each −1 to 1, y up) lands in the picture, as texture coordinates (`u` left to
 * right, `v` top to bottom), on a stage `aspect` times as wide as it is tall. */
export function lookup(look: Look, aspect: number, x: number, y: number): { u: number; v: number } {
  const t = Math.tan(rad(look.fov) / 2)
  const [dx, dy, dz] = [x * aspect * t, y * t, 1]
  // Up by the pitch, about the x axis, then right by the yaw, about the y axis.
  const [cp, sp, cy, sy] = [
    Math.cos(rad(look.pitch)),
    Math.sin(rad(look.pitch)),
    Math.cos(rad(look.yaw)),
    Math.sin(rad(look.yaw)),
  ]
  const y1 = dy * cp + dz * sp
  const z1 = -dy * sp + dz * cp
  const x2 = dx * cy + z1 * sy
  const z2 = -dx * sy + z1 * cy
  const lon = Math.atan2(x2, z2)
  const lat = Math.asin(y1 / Math.hypot(x2, y1, z2))
  return { u: 0.5 + lon / (2 * Math.PI), v: 0.5 - lat / Math.PI }
}

/** `lookup` in GLSL, for the view's fragment shader. */
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D picture;
uniform vec3 look; // yaw, pitch and the vertical field of view, in radians
uniform float aspect;
in vec2 point;
out vec4 colour;
const float PI = 3.14159265358979;
void main() {
  float t = tan(look.z / 2.0);
  vec3 d = vec3(point.x * aspect * t, point.y * t, 1.0);
  float cp = cos(look.y), sp = sin(look.y), cy = cos(look.x), sy = sin(look.x);
  float y1 = d.y * cp + d.z * sp;
  float z1 = -d.y * sp + d.z * cp;
  float x2 = d.x * cy + z1 * sy;
  float z2 = -d.x * sy + z1 * cy;
  float lon = atan(x2, z2);
  float lat = asin(y1 / length(vec3(x2, y1, z2)));
  colour = texture(picture, vec2(0.5 + lon / (2.0 * PI), 0.5 - lat / PI));
}
`

/** Two triangles over the whole stage, each corner's point passed on for `lookup`. */
export const VERTEX_SHADER = `#version 300 es
in vec2 corner;
out vec2 point;
void main() {
  point = corner;
  gl_Position = vec4(corner, 0.0, 1.0);
}
`
