/** The worker's answers to the page's requests (SPEC.md section 7). It holds the open file: its bytes,
 * ImageInfo, and its decoded upright pixels once something has asked for them. Kept apart from the worker's
 * global scope so Node's tests can call it directly. */
import { shownByBrowser } from '@/lib/capabilities'
import { sniff, type Sniffed } from '@/lib/formats'
import { turnsSideways, type ImageInfo } from '@/lib/info'
import { downscale, fitArea, pixelAt, type Pixels } from '@/lib/pixels'
import type { Fingerprint, Reply, Request, StagePicture, ThumbnailMatch } from '@/lib/protocol'
import { withStealth } from '@/lib/ai/generators'
import { readStealth } from '@/lib/ai/stealth'
import { errorLevels } from '@/lib/forensics/ela'
import { historySteps } from '@/lib/forensics/history'
import { amplify, type Grey } from '@/lib/forensics/layer'
import { noiseResidual } from '@/lib/forensics/noise'
import { perceptualHash, thumbnailCheck } from '@/lib/forensics/phash'
import { extractType } from '@/lib/extract'
import { generationText, toImageInfo } from '@/lib/tags'
import { decode, encodePng, largestEmbedded, largestPreview, resaveJpeg } from '@/media/codecs'
import { readBinary, readHistory, readTags } from '@/media/exiftool'
import { run } from '@/media/run'
import { placeAt } from './places'

export const CANT_OPEN =
  'Loupe can’t open this file. It reads JPEG, PNG, WebP, AVIF, HEIC, JPEG XL, GIF, BMP, TIFF and camera raw files.'
export const NO_TIFF = 'Loupe can’t show TIFF pictures yet. Its metadata is listed.'
export const NO_RAW_PREVIEW = 'This raw file has no embedded preview Loupe can show. Its metadata is listed.'
export const TOO_LARGE = 'This picture is too large for this browser to show. Its metadata is still listed.'
export const NOTHING_OPEN = 'No picture is open.'
export const NO_DEPTH = 'This file has no depth map Loupe can show.'

/** iOS caps a canvas at about 16.7 MP, so a decoded picture bigger than that is drawn scaled. */
const CANVAS_AREA = 16_777_216

/** Formats the worker decodes up front, before ExifTool, when the browser can't show them: their decoders
 * stand them upright themselves, so they don't wait for Orientation. */
const DECODED_FIRST: Sniffed[] = ['heic', 'jxl', 'avif']

type Open = {
  file: File
  bytes: Uint8Array
  info: ImageInfo
  pixels: Promise<Pixels> | null
  noPicture: string | null
  // Forensics' layers before amplifying, kept so a brightness slider only amplifies again: error levels for
  // the last quality asked for, and noise.
  ela?: { quality: number; levels: Grey }
  noise?: Grey
  depth?: Promise<Pixels>
}

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
  const info = toImageInfo(json, file, sniffed, bytes)
  if (!info) throw new Error(CANT_OPEN)
  // Photoshop's history needs a reading of its own (history.ts says why).
  if (info.tags.some((t) => t.name === 'HistoryAction'))
    info.edits.history = historySteps(await readHistory(file.name, bytes).catch(() => null))

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

  // Stealth metadata lives in a PNG's stored pixels, read before anything turns or converts them.
  if (info.format === 'png') {
    const stored = decode(bytes, 'png', 1)
    if (info.orientation === 1) pixels ??= stored
    const stealth = await stored.then(readStealth, () => null)
    info.generators = withStealth(info.generators, stealth)
  }

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

/** A layer before amplifying, worked out on first use. */
async function layerOf(open: Open, layer: 'ela' | 'noise', quality: number): Promise<Grey> {
  const pixels = await pixelsOf(open)
  if (layer === 'noise') return (open.noise ??= noiseResidual(pixels))
  if (open.ela?.quality !== quality)
    open.ela = { quality, levels: errorLevels(pixels, await resaveJpeg(pixels, quality)) }
  return open.ela.levels
}

/** The depth map, stored as the picture is, so stood upright by its Orientation. */
async function depthOf(open: Open): Promise<Pixels> {
  const item = open.info.embedded.find((e) => e.kind === 'depth-map')
  if (!item) throw new Error(NO_DEPTH)
  const bytes = await readBinary(open.file.name, open.bytes, item.id)
  const format = bytes && sniff(bytes)
  if (!bytes || (format !== 'png' && format !== 'jpeg')) throw new Error(NO_DEPTH)
  return decode(bytes, format, open.info.orientation)
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

/** Another file's upright picture, read as opening it would without making it the open one; null for one
 * Loupe can't show. */
async function pictureOfFile(file: File, bytes: Uint8Array): Promise<Pixels | null> {
  const sniffed = sniff(bytes)
  const json = await readTags(file.name, bytes).catch(() => null)
  const info = json && toImageInfo(json, file, sniffed, bytes)
  if (!info) throw new Error(CANT_OPEN)
  if (info.format === 'tiff') return null
  if (info.format === 'raw') return largestPreview(file.name, bytes, info.embedded, info.orientation)
  return decode(bytes, info.format, info.orientation)
}

async function fingerprint(file: File | undefined): Promise<Fingerprint> {
  const open = current
  if (!file && !open) throw new Error(NOTHING_OPEN)
  const bytes = file ? new Uint8Array(await file.arrayBuffer()) : open!.bytes
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes.slice()))
  const pixels = file ? await pictureOfFile(file, bytes) : open!.noPicture ? null : await pixelsOf(open)
  return { sha256, phash: pixels && perceptualHash(pixels) }
}

/** SPEC.md 6.5's Embedded thumbnail: the largest thumbnail or preview beside the picture. A raw file's picture
 * is its largest preview already, so it has nothing to compare. */
async function thumbnail(open: Open | null): Promise<ThumbnailMatch | null> {
  if (!open) throw new Error(NOTHING_OPEN)
  const { info } = open
  if (open.noPicture || info.format === 'raw') return null
  const found = await largestEmbedded(open.file.name, open.bytes, info.embedded, info.orientation, [
    'thumbnail',
    'preview',
  ])
  if (!found) return null
  const pixels = await pixelsOf(open)
  return {
    label: found.item.label,
    thumbnail: await encodePng(found.pixels),
    picture: await encodePng(downscale(pixels, 240)),
    ...thumbnailCheck(pixels, found.pixels),
  }
}

/** An embedded item's bytes as the file holds them (SPEC.md 6.6): the data after the picture by its place,
 * generators' text as ExifTool read it, and the rest by ExifTool's tag. Content Credentials are read on the page. */
async function extract(open: Open | null, id: string): Promise<Blob> {
  if (!open) throw new Error(NOTHING_OPEN)
  const { info, bytes, file } = open
  const item = info.embedded.find((e) => e.id === id)
  if (!item || item.kind === 'c2pa-manifest') throw new Error(`This file has nothing to save as “${id}”.`)
  const type = extractType(item)
  // The data after the picture and the Motion Photo's video, by their place.
  const place = item.kind === 'trailer' ? info.trailer : item.id === 'motion-video' ? info.motion : null
  if (place) return new Blob([bytes.slice(place.offset, place.offset + place.length)], { type })
  if (item.kind === 'comfyui-workflow' || item.kind === 'generation-parameters') {
    const text =
      item.kind === 'comfyui-workflow'
        ? info.generators.find((g) => g.workflow)?.workflow?.json
        : generationText(info.tags, info.generators)?.text
    return new Blob([text ?? ''], { type })
  }
  const tag = item.kind === 'icc-profile' ? 'ICC_Profile' : item.kind === 'xmp' ? 'XMP' : item.id
  const data = await readBinary(file.name, bytes, tag)
  if (!data) throw new Error(`ExifTool found nothing to save as “${item.label}”.`)
  return new Blob([data as Uint8Array<ArrayBuffer>], { type })
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
      case 'layer': {
        if (!current) throw new Error(NOTHING_OPEN)
        const open = current
        if (request.layer === 'depth') {
          open.depth ??= depthOf(open)
          open.depth.catch(() => (open.depth = undefined))
          post({ type: 'done', id: request.id, value: await open.depth })
          break
        }
        const levels = await layerOf(open, request.layer, request.quality)
        const pixels = amplify(levels, request.amount)
        // As big as the stage's canvas can be, as the picture is.
        const fitted = downscale(pixels, fitArea(pixels.width, pixels.height, CANVAS_AREA))
        post({ type: 'done', id: request.id, value: fitted }, [fitted.data.buffer])
        break
      }
      case 'fingerprint':
        post({ type: 'done', id: request.id, value: await fingerprint(request.file) })
        break
      case 'thumbnail':
        post({ type: 'done', id: request.id, value: await thumbnail(current) })
        break
      case 'png': {
        const { source } = request
        const pixels = source
          ? await decode(new Uint8Array(await source.blob.arrayBuffer()), source.format, source.orientation)
          : await pixelsOf(current)
        post({ type: 'done', id: request.id, value: await encodePng(pixels) })
        break
      }
      case 'pixel':
        post({ type: 'done', id: request.id, value: pixelAt(await pixelsOf(current), request.x, request.y) })
        break
      case 'extract':
        post({ type: 'done', id: request.id, value: await extract(current, request.item) })
        break
      case 'run': {
        if (!current) throw new Error(NOTHING_OPEN)
        // No job can say how far along it is: ExifTool, jpegtran and the encoders each run in one call.
        post({ type: 'progress', id: request.id, fraction: null })
        const open = current
        post({ type: 'done', id: request.id, value: await run(request.plan, open.bytes, () => pixelsOf(open)) })
        break
      }
    }
  } catch (error) {
    const text = outOfMemory(error) ? TOO_LARGE : message(error)
    post({ type: 'failed', id: request.id, message: text })
  }
}
