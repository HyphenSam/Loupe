import { describe, expect, it } from 'vitest'
import { drag, keyLook, lookup, START, wheel } from './pano'

describe('the 360° view’s look (SPEC.md section 5)', () => {
  it('starts looking at the middle of the picture, level, at 75°', () => {
    expect(START).toEqual({ yaw: 0, pitch: 0, fov: 75 })
  })

  it('turns with a drag, the picture following the pointer: a stage’s height is the field of view', () => {
    expect(drag(START, -300, 0, 600)).toEqual({ yaw: 37.5, pitch: 0, fov: 75 })
    expect(drag(START, 0, 300, 600)).toEqual({ yaw: 0, pitch: 37.5, fov: 75 })
  })

  it('wraps round, and stops looking up or down at 85°', () => {
    expect(drag({ ...START, yaw: 170 }, -160, 0, 600).yaw).toBe(-170)
    expect(drag(START, 0, 10_000, 600).pitch).toBe(85)
    expect(drag(START, 0, -10_000, 600).pitch).toBe(-85)
  })

  it('looks around with the arrow keys, further with Shift, and zooms with + and -', () => {
    expect(keyLook(START, 'ArrowRight', false)).toEqual({ yaw: 5, pitch: 0, fov: 75 })
    expect(keyLook(START, 'ArrowLeft', true)).toEqual({ yaw: -20, pitch: 0, fov: 75 })
    expect(keyLook(START, 'ArrowUp', false)).toEqual({ yaw: 0, pitch: 5, fov: 75 })
    expect(keyLook(START, 'ArrowDown', false)).toEqual({ yaw: 0, pitch: -5, fov: 75 })
    expect(keyLook(START, '+', false)).toEqual({ yaw: 0, pitch: 0, fov: 70 })
    expect(keyLook(START, '=', false)).toEqual({ yaw: 0, pitch: 0, fov: 70 })
    expect(keyLook(START, '-', false)).toEqual({ yaw: 0, pitch: 0, fov: 80 })
    expect(keyLook(START, '0', false)).toEqual(START)
    expect(keyLook(START, 'a', false)).toBe(null)
  })

  it('zooms with the wheel, keeping the field of view between 30° and 100°', () => {
    expect(wheel(START, -100).fov).toBeLessThan(75)
    expect(wheel(START, 100).fov).toBeGreaterThan(75)
    expect(wheel({ ...START, fov: 31 }, -100).fov).toBe(30)
    expect(wheel({ ...START, fov: 99 }, 100).fov).toBe(100)
    expect(keyLook({ ...START, fov: 30 }, '+', false)!.fov).toBe(30)
  })
})

describe('lookup: where a point on the stage lands in the equirectangular picture', () => {
  const close = (a: { u: number; v: number }, b: { u: number; v: number }) => {
    expect(a.u).toBeCloseTo(b.u, 6)
    expect(a.v).toBeCloseTo(b.v, 6)
  }

  it('puts the middle of the stage where the view looks', () => {
    close(lookup(START, 1.5, 0, 0), { u: 0.5, v: 0.5 })
    close(lookup({ ...START, yaw: 90 }, 1.5, 0, 0), { u: 0.75, v: 0.5 })
    close(lookup({ ...START, yaw: -90 }, 1.5, 0, 0), { u: 0.25, v: 0.5 })
    close(lookup({ ...START, pitch: 45 }, 1.5, 0, 0), { u: 0.5, v: 0.25 })
  })

  it('spans the field of view from the bottom of the stage to the top', () => {
    const view = { yaw: 0, pitch: 0, fov: 90 }
    close(lookup(view, 1, 0, 1), { u: 0.5, v: 0.25 })
    close(lookup(view, 1, 0, -1), { u: 0.5, v: 0.75 })
    close(lookup(view, 1, 1, 0), { u: 0.625, v: 0.5 })
  })
})
