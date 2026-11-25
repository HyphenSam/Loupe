/** Settings the page remembers between visits (`localStorage`), parsed defensively: anything missing or
 * unknown takes its default. */

export type Background = 'dark' | 'light' | 'checker'

export type StageSettings = {
  background: Background
  magnifier: boolean
  /** The magnifier's zoom: image pixels to CSS pixels, 2× to 32×. */
  magnification: number
}

export const DEFAULT_STAGE: StageSettings = { background: 'dark', magnifier: false, magnification: 8 }
export const STAGE_KEY = 'loupe.stage'

const MAGNIFICATIONS = [2, 4, 8, 16, 32]

export function parseStageSettings(saved: string | null): StageSettings {
  let value: Partial<Record<keyof StageSettings, unknown>> = {}
  try {
    value = JSON.parse(saved ?? '{}') ?? {}
  } catch {
    // Unreadable: the defaults.
  }
  return {
    background: ['dark', 'light', 'checker'].includes(value.background as string)
      ? (value.background as Background)
      : DEFAULT_STAGE.background,
    magnifier: typeof value.magnifier === 'boolean' ? value.magnifier : DEFAULT_STAGE.magnifier,
    magnification: MAGNIFICATIONS.includes(value.magnification as number)
      ? (value.magnification as number)
      : DEFAULT_STAGE.magnification,
  }
}

/** The next magnification up (`step` 1) or down (−1), within 2× to 32×. */
export function magnifierZoom(current: number, step: 1 | -1): number {
  const i = MAGNIFICATIONS.indexOf(current)
  return MAGNIFICATIONS[Math.min(MAGNIFICATIONS.length - 1, Math.max(0, (i < 0 ? 2 : i) + step))]
}
