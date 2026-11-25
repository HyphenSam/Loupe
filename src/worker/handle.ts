/** The worker's answers to the page's requests (SPEC.md section 7). It holds the open file: its bytes,
 * ImageInfo, and its decoded upright pixels once something has asked for them. Kept apart from the worker's
 * global scope so Node's tests can call it directly. */
import { shownByBrowser } from '@/lib/capabilities'
import { sniff, type Sniffed } from '@/lib/formats'
import { turnsSideways, type ImageInfo } from '@/lib/info'
import { downscale, fitArea, pixelAt, type Pixels } from '@/lib/pixels'
import type { Reply, Request, StagePicture } from '@/lib/protocol'
import { toImageInfo } from '@/lib/tags'
import { decode, largestPreview } from '@/media/codecs'
import { readTags } from '@/media/exiftool'
import { placeAt } from './places'

export const CANT_OPEN =
  'Loupe can’t open this file. It reads JPEG, PNG, WebP, AVIF, HEIC, JPEG XL, GIF, BMP, TIFF and camera raw files.'
export const NO_TIFF = 'Loupe can’t show TIFF pictures yet. Its metadata is listed.'
export const NO_RAW_PREVIEW = 'This raw file has no embedded preview Loupe can show. Its metadata is listed.'
export const TOO_LARGE = 'This picture is too large for this browser to show. Its metadata is still listed.'
export const NOTHING_OPEN = 'No picture is open.'

/** iOS caps a canvas at about 16.7 MP, so a decoded picture bigger than that is drawn scaled. */
const CANVAS_AREA = 16_777_216

/** Formats the worker decodes up front, before ExifTool, when the browser can't show them: their decoders
 * stand them upright themselves, so they don't wait for Orientation. */
const DECODED_FIRST: Sniffed[] = ['heic', 'jxl', 'avif']

type Open = { file: File; bytes: Uint8Array; info: ImageInfo; pixels: Promise<Pixels> | null; noPicture: string | null }

let current: Open | null = null
let latest = 0

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
/** Allocation failures, as browsers report running out of memory for a picture. */
const outOfMemory = (error: unknown) => error instanceof RangeError || /memory|allocat/i.test(message(error))

function stagePixels(pixels: Pixels, preview: boolean): StagePicture {
  const fitted = downscale(pixels, fitArea(pixels.width, pixels.height, CANVAS_AREA))
  return { type: 'pixels', pixels: fitted, scaled: fitted !== pixels, preview }
}

async function open(request: Extract<Request, { type: 'open' }>, post: (reply: Reply) => void) {
  const { id, file, shows } = request
  latest = id
  const picture = (p: StagePicture) => post({ type: 'picture', id, picture: p })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniff(bytes)

  // The picture first, when the bytes say enough.
  let pixels: Promise<Pixels> | null = null
  let noPicture: string | null = null
  if (sniffed && shownByBrowser(sniffed, shows)) picture({ type: 'file' })
  else if (sniffed && DECODED_FIRST.includes(sniffed)) {
    pixels = decode(bytes, sniffed, 1)
    try {
      picture(stagePixels(await pixels, false))
    } catch (error) {
      noPicture = outOfMemory(error) ? TOO_LARGE : `Loupe couldn’t show this picture: ${message(error)}`
      picture({ type: 'none', message: noPicture })
    }
  }

  // ExifTool that fails on bytes no decoder recognises is reading something that isn't a picture.
  const json = await readTags(file.name, bytes).catch((error: unknown) => {
    throw sniffed ? error : new Error(CANT_OPEN)
  })
  const info = toImageInfo(json, file, sniffed)
  if (!info) throw new Error(CANT_OPEN)

  if (info.format === 'tiff') {
    noPicture = NO_TIFF
    picture({ type: 'none', message: NO_TIFF })
  } else if (info.format === 'raw') {
    const preview = await largestPreview(file.name, bytes, info.embedded, info.orientation)
    if (preview) {
      pixels = Promise.resolve(preview)
      picture(stagePixels(preview, true))
    } else {
      noPicture = NO_RAW_PREVIEW
      picture({ type: 'none', message: NO_RAW_PREVIEW })
    }
  }

  // A decoder that stood the picture upright itself knows its size better than ExifTool (HEIC's crop).
  if (pixels && !noPicture && info.format !== 'raw') {
    const { width, height } = await pixels
    const sideways = turnsSideways(info.orientation)
    Object.assign(info, {
      displayWidth: width,
      displayHeight: height,
      width: sideways ? height : width,
      height: sideways ? width : height,
    })
  }

  if (info.gps) info.place = await placeAt(info.gps)

  // A newer open overtook this one: its answer is dropped by the page, and its state isn't kept.
  if (id === latest) current = { file, bytes, info, pixels, noPicture }
  post({ type: 'done', id, value: info })
}

/** The open picture's upright pixels, decoded on first use. */
function pixelsOf(open: Open | null): Promise<Pixels> {
  if (!open) throw new Error(NOTHING_OPEN)
  if (open.noPicture) throw new Error(open.noPicture)
  open.pixels ??= decode(open.bytes, open.info.format, open.info.orientation)
  open.pixels.catch(() => {})
  return open.pixels
}

/** Runs one request and posts its replies. */
export async function handle(request: Request, post: (reply: Reply, transfer?: Transferable[]) => void): Promise<void> {
  try {
    switch (request.type) {
      case 'open':
        await open(request, post)
        break
      case 'pixels': {
        const pixels = await pixelsOf(current)
        post({ type: 'done', id: request.id, value: downscale(pixels, request.maxSide) })
        break
      }
      case 'pixel':
        post({ type: 'done', id: request.id, value: pixelAt(await pixelsOf(current), request.x, request.y) })
        break
    }
  } catch (error) {
    const text = outOfMemory(error) ? TOO_LARGE : message(error)
    post({ type: 'failed', id: request.id, message: text })
  }
}
