/** What this browser can do, as plain data (SPEC.md section 9). Probed once at start-up; planners and views
 * take it as an argument, so tests can describe any browser. */
import type { Format } from './formats'

export type Capabilities = {
  /** Whether an `<img>` decodes a tiny sample of each format. */
  shows: Record<'avif' | 'heic' | 'jxl', boolean>
  /** `ClipboardItem` exists and takes image/png. */
  clipboardImage: boolean
  /** For the 360° view. */
  webgl2: boolean
}

export const NO_CAPABILITIES: Capabilities = {
  shows: { avif: false, heic: false, jxl: false },
  clipboardImage: false,
  webgl2: false,
}

/** The fixtures' 64 × 48 pictures (photo.avif, photo.heic, photo.jxl), small enough to bundle as data URLs:
 * an `<img>` that decodes one can show the format. */
export const SAMPLES: Record<keyof Capabilities['shows'], string> = {
  avif: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAR0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAEAAAAAwAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAASVtZGF0EgAKCRgVf72CBAQNCDKNAhgACiiihQDcvLv4kHDbmvniYho738310V7mbGznAmd1WK0YJ+Qnp1DRyfuaFkUtyAt5kSMubDzM0nYLt++FvYLCZomJDfdLs/emsiuLyx77UztRPQDCSfEULsCSEWGoOA1XbCqiVQLmSY9xiogYO8xumCJ8+w5xc7ybIw7DzupXg5vrDb8tu2bembaF09bhBMAaypBgOeMoJvM1hY29MxFjZsQPkQh/DWvY/JExwkNU/uJiXU175607N/z+FENITWSrzPmiFEnJGSaKit3XxIZtV69IpG3nGFS0X6EeKFCCay0lKzkpGt4V7TUysod+GN6fdgq432aJ8rBanvOK138qxR/cs1kPRFRFUjZq',
  heic: 'data:image/heic;base64,AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAX1tZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAABoQABAAAAAAAAAX4AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAA5waXRtAAAAAAABAAAA/WlwcnAAAADdaXBjbwAAAHZodmNDAQNwAAAAkAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQAqQgEBA3AAAAMAkAAAAwAAAwAeoCCBBZbq5Ka5uAhoMCAAAAMDIAAAAwAhYgABAAZEAcFzwIkAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAoY2xhcAAAAEAAAAABAAAAMAAAAAEAAAAAAAAAAv////AAAAACAAAAEHBpeGkAAAAAAwgICAAAABhpcG1hAAAAAAAAAAEAAQWBAgMFhAAAAYZtZGF0AAABeigBrwngFaRVPjfrbB4dq6TLbKiE2Pu2p84dfgLx463aUJwxjZBy0zdm/nMm4TmVwSdHMlDDkene1JZC7GE8lEVfge3iuieQMX/7XlOmDX12S2SWJOa+CQPovVeY3cWJ/ydsfJGx+A+vhV7pl6NmmJYhgqHyKVcjFqNp6zw7oV6dgKXVa0tab7QDobBOe0NxGNDals0v46gsVlj+srs66/zyla0HBl8GK/AXPQQpVgCraro3Z1e/JGWXDX4lt8g1jEzji8SVO0WazR30JJE1XICkCZjId2wGOMu9DvRLzqZq64qXQ4uBSHiDYvXx8LaK6p7NvMHx4JzQaL2S/lBPYs4Ks3h8sWKkzxaPSwKTwdpHzKh2IZEkSP63GVR1/sKjX2th2UxOmwtqRA3IpJzIAiR//MMpTEH5H/yn8kOdwJibtEt9/p2RmlOg1xqqP4UmJ0qmQqLN+Rb2FlQ6aW8aLUKfoDTnefKXi/A/rhDdhxgbp1/3tQhP5yn/4A==',
  jxl: 'data:image/jxl;base64,/wrLwE4BqAf5PAAAVKiMMm7wcq7nyw8dFtM2rjO01baFJRQ4zpcamQITOZZcUADAiZSSqwLAiIG6wEECQoRQ1C7+39qTIEkBAJQk////////////////////////////////////////N48yBgCnMljvUD7k+RATTxi/GHN49+HD6ICKOgJEhg6VEB20gEmwmhxBmQP4EiEEkRwCSjKjBHvbM2ufh2FgYUoRz10KdB43EjwkkPsZ/fl/JGYHIOp/fBFiB8LWD3JYC/mQ54fTnvMGDTRYeDknehqdvOQAHwYIPB6eaDL6CwX696+YGzxDLSqjAV+SaQM1aAAkPQBIoTJjm3G0ieSue62/ECEFkmxXJDMzTsyYcWKMAxj2Z/ALNgzd/+/7znNYC+NkWebt+t/z/u5A5H7k5+GHH9trd46Hduczow6SfBN1Di9DBmkzfkkThJdiuQuLpWMl3qA61m0G/KzePT0cyS0tcCQ0l5lLULh8mgPl0aMxmEreHjpFsAKXyvgoJKoUZKjT07+7Ad8dHBLjHy86uD/o6weZfU0h9JwzNNPmYXqaxB1oUaiU7MZZuDU52my0khb1S/SKm4nBLT38LWre79ylhRZ+E2dhwUdory/HhtLNX4Y3lvqo/WZbwZeUu2S+Y8e2DmhQGEEB',
}

/** The browser's answers, passed in so this module stays free of the DOM. */
export type Checks = {
  shows: (url: string) => Promise<boolean>
  clipboardImage: () => boolean
  webgl2: () => boolean
}

/** A check that throws, or hasn't answered within `ms`, is a no. */
export async function probeCapabilities(checks: Checks, ms = 2000): Promise<Capabilities> {
  const ask = (url: string) =>
    Promise.race([checks.shows(url).catch(() => false), new Promise<boolean>((resolve) => setTimeout(resolve, ms, false))])
  const now = (check: () => boolean) => {
    try {
      return check()
    } catch {
      return false
    }
  }
  const [avif, heic, jxl] = await Promise.all([ask(SAMPLES.avif), ask(SAMPLES.heic), ask(SAMPLES.jxl)])
  return { shows: { avif, heic, jxl }, clipboardImage: now(checks.clipboardImage), webgl2: now(checks.webgl2) }
}

/** Whether the stage can show this format with an `<img>` of the file itself. */
export function shownByBrowser(format: Format, shows: Capabilities['shows']): boolean {
  switch (format) {
    case 'avif':
    case 'heic':
    case 'jxl':
      return shows[format]
    case 'tiff':
    case 'raw':
      return false
    default:
      return true
  }
}
