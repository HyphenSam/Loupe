/** Stealth metadata (SPEC.md 6.3): generation settings hidden in the lowest bit of each pixel's alpha, or of
 * its red, green and blue, by NovelAI, the A1111 stealth extension and SwarmUI. The bits run down each
 * column in turn, left to right: a 15-byte signature, a 32-bit length in bits, then the text, gzipped when
 * the signature ends in `comp`. They survive anything that strips metadata but keeps the pixels exact. Read
 * from the decoded pixels before any colour conversion. */
import type { Pixels } from '../pixels'

export type Stealth = { text: string; channel: 'alpha' | 'rgb' }

type Channel = Stealth['channel']

const SIGNATURES: Record<Channel, [plain: string, zipped: string]> = {
  alpha: ['stealth_pnginfo', 'stealth_pngcomp'],
  rgb: ['stealth_rgbinfo', 'stealth_rgbcomp'],
}

/** Where the `i`th bit of a channel's stream lives in `data`. */
function at({ width, height }: Pixels, channel: Channel, i: number): number {
  const pixel = channel === 'alpha' ? i : Math.floor(i / 3)
  const x = Math.floor(pixel / height)
  const y = pixel % height
  if (x >= width) return -1
  return (y * width + x) * 4 + (channel === 'alpha' ? 3 : i % 3)
}

/** `count` bits from `start` as bytes, most significant bit first; null past the end of the picture. */
function readBytes(p: Pixels, channel: Channel, start: number, count: number): Uint8Array | null {
  const out = new Uint8Array(count)
  for (let b = 0; b < count * 8; b++) {
    const index = at(p, channel, start + b)
    if (index < 0) return null
    out[b >> 3] |= (p.data[index] & 1) << (7 - (b & 7))
  }
  return out
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The hidden text and the channel it was in, or null when there's none. */
export async function readStealth(p: Pixels): Promise<Stealth | null> {
  for (const channel of ['alpha', 'rgb'] as const) {
    const signature = readBytes(p, channel, 0, 15)
    const kind = signature && SIGNATURES[channel].indexOf(new TextDecoder().decode(signature))
    if (kind === null || kind < 0) continue
    const length = readBytes(p, channel, 120, 4)
    if (!length) return null
    const bits = new DataView(length.buffer).getUint32(0)
    const data = bits % 8 === 0 ? readBytes(p, channel, 152, bits / 8) : null
    if (!data) return null
    try {
      return { text: new TextDecoder().decode(kind === 1 ? await gunzip(data) : data), channel }
    } catch {
      return null
    }
  }
  return null
}

/** Hides `data` after `signature` in the pixels, as the generators do: for the fixtures and the tests. Bits
 * that don't fit are left out. */
export function hideStealth(p: Pixels, signature: string, data: Uint8Array) {
  const channel: Channel = signature.startsWith('stealth_rgb') ? 'rgb' : 'alpha'
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, data.length * 8)
  const bytes = [...new TextEncoder().encode(signature), ...length, ...data]
  for (let b = 0; b < bytes.length * 8; b++) {
    const index = at(p, channel, b)
    if (index < 0) return
    p.data[index] = (p.data[index] & ~1) | ((bytes[b >> 3] >> (7 - (b & 7))) & 1)
  }
}
