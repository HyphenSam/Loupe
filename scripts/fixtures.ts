// Makes fixtures/ (SPEC.md section 12): small pictures generated here, and public samples copied from
// pinned URLs, whose sources and licences it writes to fixtures/SOURCES.md. The output is committed; run
// `pnpm fixtures` only to change or add one. Needs ImageMagick on PATH (GIF, BMP, TIFF) and Docker
// (HEIC: this machine's ImageMagick reads HEIC but can't write it, so libheif's heif-enc runs in Alpine).
//
// Generated files stay under 300 kB and samples under 1 MB (scripts/fixtures.test.ts checks both).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import encodeAvif, { init as initAvif } from '@jsquash/avif/encode.js'
import encodeJpeg, { init as initJpeg } from '@jsquash/jpeg/encode.js'
import encodeJxl, { init as initJxl } from '@jsquash/jxl/encode.js'
import encodePng, { init as initPng } from '@jsquash/png/encode.js'
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode.js'
import { strToU8, zipSync } from 'fflate'
import { SAMPLES, sourcesMarkdown } from './samples.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'fixtures')
const scratch = mkdtempSync(join(tmpdir(), 'loupe-fixtures-'))

// ---------------------------------------------------------------------------------------------------
// The codecs, as Bytesize's tests load them in Node: each package's single-threaded wasm, compiled here.

const require = createRequire(import.meta.url)
const wasm = (pkg: string, file: string) => WebAssembly.compile(readFileSync(join(dirname(require.resolve(pkg)), file)))

// Node has no ImageData; the codecs only need its shape.
globalThis.ImageData ??= class {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
} as unknown as typeof ImageData

await initJpeg(await wasm('@jsquash/jpeg/encode', 'codec/enc/mozjpeg_enc.wasm'))
await initPng(await wasm('@jsquash/png/encode', 'codec/pkg/squoosh_png_bg.wasm'))
await initWebp(await wasm('@jsquash/webp/encode', 'codec/enc/webp_enc_simd.wasm'))
await initAvif(await wasm('@jsquash/avif/encode', 'codec/enc/avif_enc.wasm'))
await initJxl(await wasm('@jsquash/jxl/encode', 'codec/enc/jxl_enc.wasm'))

// ---------------------------------------------------------------------------------------------------
// The picture every generated file shows: smooth gradients (so compression shows), 8 px blocks (so the
// JPEG grid shows) and a white square in the top-left corner (so a turn or a flip shows). `frame` moves a
// bar across it, for the animation.

type Rgba = { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }

function picture(width: number, height: number, frame = 0): Rgba {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const corner = x < 8 && y < 8
      const bar = frame > 0 && Math.floor(x / 8) === frame * 2
      const block = ((x >> 3) + (y >> 3)) & 1
      data[i] = corner || bar ? 255 : Math.round((x / (width - 1)) * 230)
      data[i + 1] = corner || bar ? 255 : Math.round((y / (height - 1)) * 200) + 20
      data[i + 2] = corner || bar ? 255 : block ? 190 : 70
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

const imageData = (p: Rgba) => new ImageData(p.data, p.width, p.height)
const bytes = (buffer: ArrayBuffer) => new Uint8Array(buffer)

function write(name: string, data: Uint8Array | string) {
  writeFileSync(join(out, name), data)
  console.log(`  ${name}`)
}

/** Writes `p` as raw RGBA for ImageMagick and returns its `rgba:` argument. */
function raw(p: Rgba, name: string): string {
  const path = join(scratch, name)
  writeFileSync(path, p.data)
  return `rgba:${path}`
}

/** ImageMagick, without the dates and names it would otherwise write, so regenerating changes nothing. */
function magick(...args: string[]) {
  execFileSync('magick', args, { stdio: 'inherit' })
}

// ---------------------------------------------------------------------------------------------------

mkdirSync(out, { recursive: true })
console.log('Generating:')

const base = picture(64, 48)

// JPEG blocks: 8 px with 4:4:4 chroma, 16 px with 4:2:0. Baseline, with the standard (IJG) tables, so a
// quality can be estimated from them.
const jpeg = (p: Rgba, chroma: 1 | 2, quality = 90) =>
  encodeJpeg(imageData(p), {
    quality,
    progressive: false,
    quant_table: 0,
    auto_subsample: false,
    chroma_subsample: chroma,
    separate_chroma_quality: false,
  }).then(bytes)
const grid420 = await jpeg(base, 2)
write('grid-444.jpg', await jpeg(base, 1))
write('grid-420.jpg', grid420)

// A JPEG named .png: extensions lie.
write('misnamed.png', await jpeg(picture(32, 24), 2))

// A small ZIP after the end of the picture: hidden data.
const zip = zipSync({
  'note.txt': [strToU8('Hidden after the end of the picture.\n'), { mtime: new Date(2025, 0, 1) }],
})
write('trailer-zip.jpg', new Uint8Array([...grid420, ...zip]))

// 16 bits a channel with alpha fading across.
const deep = new Uint16Array(64 * 48 * 4)
for (let i = 0; i < 64 * 48; i++) {
  const x = i % 64
  for (let c = 0; c < 3; c++) deep[i * 4 + c] = base.data[i * 4 + c] * 257 + (x & 7) * 31
  deep[i * 4 + 3] = Math.round((x / 63) * 65535)
}
write('png-16-alpha.png', bytes(await encodePng({ data: deep, width: 64, height: 48 }, { bitDepth: 16 })))

write('lossy.webp', bytes(await encodeWebp(imageData(base), { quality: 75 })))
write('lossless.webp', bytes(await encodeWebp(imageData(base), { lossless: 1, exact: 1 })))
write('photo.avif', bytes(await encodeAvif(imageData(base), { quality: 50, speed: 6 })))
write('photo.jxl', bytes(await encodeJxl(imageData(base), { quality: 75 })))
write('lossless.jxl', bytes(await encodeJxl(imageData(base), { lossless: true })))

const plain = ['-strip', '+set', 'date:create', '+set', 'date:modify']
const size = ['-size', '64x48', '-depth', '8']
const frames = [0, 1, 2].map((f) => raw(picture(64, 48, f), `frame-${f}.rgba`))
magick('-delay', '20', '-loop', '0', ...size, ...frames, ...plain, join(out, 'anim.gif'))
console.log('  anim.gif')
magick(...size, frames[0], '-alpha', 'off', '-type', 'TrueColor', ...plain, `BMP3:${join(out, 'picture.bmp')}`)
console.log('  picture.bmp')
magick(...size, frames[0], '-alpha', 'off', '-compress', 'zip', ...plain, `TIFF:${join(out, 'scan.tif')}`)
console.log('  scan.tif')

// HEIC: libheif's encoder with its x265 plugin, in Docker, from an RGB PNG so it has no alpha plane, as a
// phone's hasn't.
magick(...size, frames[0], '-alpha', 'off', ...plain, `PNG24:${join(scratch, 'photo.png')}`)
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${scratch}:/w`,
    'alpine:3',
    'sh',
    '-c',
    'apk add -q libheif-tools libheif-plugins-all >/dev/null 2>&1 && heif-enc -q 60 -o /w/photo.heic /w/photo.png',
  ],
  { stdio: 'inherit' },
)
write('photo.heic', readFileSync(join(scratch, 'photo.heic')))

write('notimage.txt', 'This is a text file, not a picture.\n')

// ---------------------------------------------------------------------------------------------------
// Later phases add the files that need metadata written by ExifTool or chunk writers here: camera.jpg,
// cropped-thumb.jpg and orient-6.jpg (phase 2), photoshop.jpg and screenshot.png (phases 2 and 6), the AI
// generators' files and iptc-ai.jpg (phase 4), motion-photo.jpg, depth.jpg and pano-360.jpg (phase 6).

// ---------------------------------------------------------------------------------------------------
// Public samples, fetched once from pinned commits; ones already here are kept.

console.log('Samples:')
for (const sample of SAMPLES) {
  const path = join(out, sample.path)
  if (existsSync(path)) continue
  const response = await fetch(sample.url)
  if (!response.ok) throw new Error(`${sample.url}: ${response.status}`)
  mkdirSync(dirname(path), { recursive: true })
  write(sample.path, bytes(await response.arrayBuffer()))
}
writeFileSync(join(out, 'SOURCES.md'), sourcesMarkdown())
console.log('  SOURCES.md')

rmSync(scratch, { recursive: true, force: true })
