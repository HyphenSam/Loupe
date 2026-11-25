// Makes fixtures/ (SPEC.md section 12): small pictures generated here, and public samples copied from
// pinned URLs, whose sources and licences it writes to fixtures/SOURCES.md. The output is committed; run
// `pnpm fixtures` only to change or add one. Needs ImageMagick on PATH (GIF, BMP, TIFF) and Docker: HEIC
// comes from libheif's heif-enc in Alpine (this machine's ImageMagick reads HEIC but can't write it), and
// Ultra HDR from libultrahdr's ultrahdr_app, built once from tools/ultrahdr/Dockerfile.
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
import { writeMetadata } from '@uswriting/exiftool'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { hideStealth } from '../src/lib/ai/stealth.ts'
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

// Ultra HDR: libultrahdr encodes a 10-bit HLG picture of the same pattern (BT.2100, full range), making
// the SDR base and a single-channel gain map, described in hdrgm XMP and ISO 21496-1 metadata. SDR white
// sits at about 0.75 of the HLG signal; the corner square and the bottom rows go above it, so the gain map
// has highlights to lift.
const hdr = new Uint32Array(64 * 48)
for (let i = 0; i < hdr.length; i++) {
  const [x, y] = [i % 64, Math.floor(i / 64)]
  const bright = (x < 8 && y < 8) || y >= 40
  const rgb = bright ? [1, 1, 1] : [0, 1, 2].map((c) => (base.data[i * 4 + c] / 255) * 0.75)
  const [r, g, b] = rgb.map((v) => Math.round(v * 1023))
  hdr[i] = (r | (g << 10) | (b << 20) | (3 << 30)) >>> 0 // RGBA 10:10:10:2, little-endian
}
writeFileSync(join(scratch, 'hdr.raw'), new Uint8Array(hdr.buffer))
execFileSync('docker', ['build', '-q', '-t', 'loupe-ultrahdr', join(root, 'tools', 'ultrahdr')], { stdio: 'ignore' })
const uhdr = [
  '-m',
  '0',
  '-p',
  '/w/hdr.raw',
  '-a',
  '5',
  '-w',
  '64',
  '-h',
  '48',
  '-C',
  '2',
  '-t',
  '1',
  '-R',
  '1',
  '-M',
  '0',
]
execFileSync(
  'docker',
  ['run', '--rm', '-v', `${scratch}:/w`, 'loupe-ultrahdr', ...uhdr, '-q', '90', '-Q', '85', '-z', '/w/uhdr.jpg'],
  {
    stdio: 'ignore',
  },
)
write('ultra-hdr.jpg', readFileSync(join(scratch, 'uhdr.jpg')))

write('notimage.txt', 'This is a text file, not a picture.\n')

// ---------------------------------------------------------------------------------------------------
// Files with metadata, written by the ExifTool WebAssembly the app uses. Embedding a thumbnail takes a
// second file as ExifTool's input, which the WebAssembly wrapper can't give it, so camera.jpg and
// cropped-thumb.jpg are written by ExifTool in Docker instead. Later phases add the AI
// photoshop.jpg (phase 9), motion-photo.jpg, depth.jpg and pano-360.jpg (phase 11).

const zeroperl = createRequire(import.meta.url).resolve('@6over3/zeroperl-ts/zeroperl.wasm')
const exiftoolWasm = async () =>
  new Response(readFileSync(zeroperl), { headers: { 'content-type': 'application/wasm' } })

async function withTags(name: string, data: Uint8Array, tags: Record<string, string | number>) {
  const result = await writeMetadata({ name, data }, tags, { fetch: exiftoolWasm as never })
  if (!result.success) throw new Error(`${name}: ${result.error}`)
  return bytes(result.data)
}

// Stored 40 × 24 on its side: upright it's 24 × 40, with the white corner at the top right. 4:2:0, so a
// lossless turn needs -trim (24 isn't a multiple of 16).
write('orient-6.jpg', await withTags('orient-6.jpg', await jpeg(picture(40, 24), 2), { 'Orientation#': 6 }))

// A screenshot, as iOS marks one.
write(
  'screenshot.png',
  await withTags('screenshot.png', bytes(await encodePng(imageData(base))), { 'XMP-exif:UserComment': 'Screenshot' }),
)

// A picture that says it was made with generative AI only in IPTC's Digital Source Type, as stock sites and
// some generators mark one. The raw value (`#`), as ExifTool would otherwise expect its printed label.
write(
  'iptc-ai.jpg',
  await withTags('iptc-ai.jpg', grid420, {
    'XMP-iptcExt:DigitalSourceType#': 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  }),
)

/** `p` halved, each pixel the mean of four. */
function half(p: Rgba): Rgba {
  const out = picture(p.width / 2, p.height / 2)
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++)
      for (let c = 0; c < 4; c++) {
        const at = (dx: number, dy: number) => p.data[((y * 2 + dy) * p.width + x * 2 + dx) * 4 + c]
        out.data[(y * out.width + x) * 4 + c] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4
      }
  return out
}

/** The left `width` columns of `p`'s middle. */
function crop(p: Rgba, x: number, width: number): Rgba {
  const out = picture(width, p.height)
  for (let y = 0; y < p.height; y++)
    out.data.set(p.data.subarray((y * p.width + x) * 4, (y * p.width + x + width) * 4), y * width * 4)
  return out
}

// A camera's picture: everything Info, Location and Privacy show, with a matching 32 × 24 thumbnail. Then
// the same cropped to 32 × 48, keeping the thumbnail of the whole.
writeFileSync(join(scratch, 'camera.jpg'), grid420)
writeFileSync(join(scratch, 'thumb.jpg'), await jpeg(half(base), 2, 80))
writeFileSync(join(scratch, 'cropped.jpg'), await jpeg(crop(base, 16, 32), 2))
const cameraTags = [
  '-EXIF:Make=Loupe',
  '-EXIF:Model=Test Camera 1',
  '-EXIF:LensMake=Loupe',
  '-EXIF:LensModel=Loupe 35mm F2',
  '-EXIF:ExposureTime=1/250',
  '-EXIF:FNumber=2.8',
  '-EXIF:ISO=400',
  '-EXIF:ExposureCompensation=-0.7',
  '-EXIF:ExposureProgram#=3',
  '-EXIF:FocalLength=35',
  '-EXIF:FocalLengthIn35mmFormat=52',
  '-EXIF:Flash#=16',
  '-EXIF:SerialNumber=LT0012345',
  '-EXIF:LensSerialNumber=LS0067890',
  '-EXIF:OwnerName=A. Photographer',
  '-EXIF:Software=Loupe fixtures',
  '-EXIF:DateTimeOriginal=2025:03:12 14:32:05',
  '-EXIF:OffsetTimeOriginal=+13:00',
  '-EXIF:CreateDate=2025:03:12 14:32:05',
  '-EXIF:OffsetTimeDigitized=+13:00',
  '-EXIF:ModifyDate=2025:03:15 09:00:00',
  '-EXIF:OffsetTime=+13:00',
  '-GPS:GPSLatitude=44.9405',
  '-GPS:GPSLatitudeRef=S',
  '-GPS:GPSLongitude=168.8263',
  '-GPS:GPSLongitudeRef=E',
  '-GPS:GPSAltitude=312',
  '-GPS:GPSAltitudeRef=0',
  '-GPS:GPSImgDirection=312',
  '-GPS:GPSImgDirectionRef=T',
  '-GPS:GPSHPositioningError=5',
  '-GPS:GPSDateStamp=2025:03:12',
  '-GPS:GPSTimeStamp=01:32:05',
  '-ThumbnailImage<=/w/thumb.jpg',
]
writeFileSync(join(scratch, 'camera.args'), cameraTags.join('\n') + '\n')
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
    'apk add -q exiftool >/dev/null 2>&1 && cd /w && ' +
      'exiftool -q -overwrite_original -@ camera.args camera.jpg && ' +
      'exiftool -q -overwrite_original -tagsFromFile camera.jpg -all:all -ThumbnailImage cropped.jpg',
  ],
  { stdio: 'inherit' },
)
write('camera.jpg', readFileSync(join(scratch, 'camera.jpg')))
write('cropped-thumb.jpg', readFileSync(join(scratch, 'cropped.jpg')))

// ---------------------------------------------------------------------------------------------------
// The AI generators' markers (SPEC.md 6.3), each laid out as the real files checked in phase 6 lay theirs
// out: the same chunks, keys and EXIF or XMP tags, with made-up prompts and settings. PNG text chunks are
// written here, before IDAT as the generators write them; EXIF and XMP by ExifTool.

/** PNG's CRC-32. */
function crc32(data: Uint8Array): number {
  let crc = ~0
  for (const byte of data) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

type TextChunk = { keyword: string; text: string; international?: boolean }

/** `png` with text chunks after IHDR: tEXt (Latin-1), or iTXt (UTF-8, uncompressed, no language). */
function withText(png: Uint8Array, chunks: TextChunk[]): Uint8Array {
  const encoded = chunks.map(({ keyword, text, international }) => {
    // tEXt holds Latin-1 only; the generators escape anything else (JSON) or write iTXt.
    if (!international && /[^\x00-\xff]/.test(text)) throw new Error(`tEXt “${keyword}” isn’t Latin-1.`)
    const type = international ? 'iTXt' : 'tEXt'
    const body = international
      ? [...Buffer.from(keyword, 'latin1'), 0, 0, 0, 0, 0, ...Buffer.from(text, 'utf8')]
      : [...Buffer.from(keyword, 'latin1'), 0, ...Buffer.from(text, 'latin1')]
    const typed = new Uint8Array([...Buffer.from(type, 'latin1'), ...body])
    const out = new Uint8Array(12 + body.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, body.length)
    out.set(typed, 4)
    view.setUint32(8 + body.length, crc32(typed))
    return out
  })
  const afterIhdr = 8 + 25
  return new Uint8Array([...png.subarray(0, afterIhdr), ...encoded.flatMap((c) => [...c]), ...png.subarray(afterIhdr)])
}

const png = async (p: Rgba) => bytes(await encodePng(imageData(p)))
const text = (keyword: string, value: string | object): TextChunk => ({
  keyword,
  text: typeof value === 'string' ? value : JSON.stringify(value),
})

// Forge: A1111's text in a `parameters` chunk, with two LoRAs and a hires pass.
const forge = [
  'a lighthouse on a cliff at dusk, <lora:film_grain:0.6>, <lora:Coastal Style:1>',
  'with fog rolling in',
  'Negative prompt: blurry, lowres',
  'Steps: 28, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 6.5, Seed: 3141592653, Size: 832x1216, ' +
    'Model hash: 6ce0161689, Model: juggernautXL_v9, Denoising strength: 0.4, Hires upscale: 1.5, ' +
    'Lora hashes: "film_grain: 1a2b3c4d5e6f, Coastal Style: 0f9e8d7c6b5a", Version: f2.0.1v1.10.1-previous-313-g8a042934',
].join('\n')
write('a1111.png', withText(await png(base), [text('parameters', forge)]))

// AUTOMATIC1111 in a JPEG: the same form in EXIF UserComment.
const a1111Jpeg = [
  'a red bicycle against a brick wall',
  'Negative prompt: cartoon',
  'Steps: 20, Sampler: Euler a, Schedule type: Automatic, CFG scale: 7, Seed: 1234567890, Size: 512x768, ' +
    'Model hash: 6ce0161689, Model: v1-5-pruned-emaonly, Version: v1.10.1',
].join('\n')
write('a1111.jpg', await withTags('a1111.jpg', grid420, { 'EXIF:UserComment': a1111Jpeg }))

// ComfyUI: the default text-to-image graph with a LoRA, as `prompt` (API format) and `workflow` (the editor's).
const comfyPrompt = {
  '3': {
    inputs: {
      seed: 156680208700286,
      steps: 20,
      cfg: 8,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1,
      model: ['10', 0],
      positive: ['6', 0],
      negative: ['7', 0],
      latent_image: ['5', 0],
    },
    class_type: 'KSampler',
    _meta: { title: 'KSampler' },
  },
  '4': {
    inputs: { ckpt_name: 'v1-5-pruned-emaonly-fp16.safetensors' },
    class_type: 'CheckpointLoaderSimple',
    _meta: { title: 'Load Checkpoint' },
  },
  '5': {
    inputs: { width: 512, height: 512, batch_size: 1 },
    class_type: 'EmptyLatentImage',
    _meta: { title: 'Empty Latent Image' },
  },
  '6': {
    inputs: { text: 'beautiful scenery nature glass bottle landscape, purple galaxy bottle,', clip: ['10', 1] },
    class_type: 'CLIPTextEncode',
    _meta: { title: 'CLIP Text Encode (Prompt)' },
  },
  '7': {
    inputs: { text: 'text, watermark', clip: ['10', 1] },
    class_type: 'CLIPTextEncode',
    _meta: { title: 'CLIP Text Encode (Prompt)' },
  },
  '8': { inputs: { samples: ['3', 0], vae: ['4', 2] }, class_type: 'VAEDecode', _meta: { title: 'VAE Decode' } },
  '9': {
    inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] },
    class_type: 'SaveImage',
    _meta: { title: 'Save Image' },
  },
  '10': {
    inputs: {
      lora_name: 'galaxy_style.safetensors',
      strength_model: 0.8,
      strength_clip: 0.8,
      model: ['4', 0],
      clip: ['4', 1],
    },
    class_type: 'LoraLoader',
    _meta: { title: 'Load LoRA' },
  },
}
const comfyWorkflow = {
  id: '7d6a2e0c-5b2f-4c1e-9a43-3f2b1c0d9e8f',
  revision: 0,
  last_node_id: 11,
  last_link_id: 12,
  nodes: [
    ...Object.entries(comfyPrompt).map(([id, node]) => ({ id: Number(id), type: node.class_type, mode: 0 })),
    { id: 11, type: 'Note', mode: 0, widgets_values: ['Made for the tests of Loupe.'] },
  ],
  links: [],
  groups: [],
  config: {},
  extra: {},
  version: 0.4,
}
write('comfyui.png', withText(await png(base), [text('prompt', comfyPrompt), text('workflow', comfyWorkflow)]))

// ComfyUI's WebP: `prompt:` in EXIF Model, `workflow:` in Make (its `_create_webp_metadata`).
write(
  'comfyui.webp',
  await withTags('comfyui.webp', bytes(await encodeWebp(imageData(base), { lossless: 1, exact: 1 })), {
    'EXIF:Model': `prompt:${JSON.stringify(comfyPrompt)}`,
    'EXIF:Make': `workflow:${JSON.stringify(comfyWorkflow)}`,
  }),
)

// NovelAI: its text chunks, and the same again gzipped in the alpha channel's lowest bits.
const naiComment = {
  prompt: 'a fox in a snowy forest, watercolour',
  steps: 28,
  height: 1216,
  width: 832,
  scale: 5,
  uncond_scale: 0,
  cfg_rescale: 0,
  seed: 2716481234,
  n_samples: 1,
  noise_schedule: 'karras',
  v4_prompt: { caption: { base_caption: 'a fox in a snowy forest, watercolour', char_captions: [] } },
  sampler: 'k_euler_ancestral',
  uc: 'lowres, blurry',
  request_type: 'PromptGenerateRequest',
}
const naiChunks = {
  Title: 'AI generated image',
  Description: naiComment.prompt,
  Software: 'NovelAI',
  Source: 'NovelAI Diffusion V4.5 4BDE2A90',
  'Generation time': '3.215',
  Comment: JSON.stringify(naiComment),
}
const nai = picture(128, 96)
hideStealth(nai, 'stealth_pngcomp', gzipSync(strToU8(JSON.stringify(naiChunks)), { mtime: 0 }))
write(
  'novelai.png',
  withText(
    await png(nai),
    Object.entries(naiChunks).map(([k, v]) => text(k.replace(' ', '_'), v)),
  ),
)

// The A1111 stealth extension's RGB form, uncompressed, with no text chunks: only the pixels hold it.
const hidden = picture(64, 48)
hideStealth(
  hidden,
  'stealth_rgbinfo',
  strToU8(
    'a paper boat on a puddle\nNegative prompt: people\nSteps: 24, Sampler: DPM++ 2M, CFG scale: 5, Seed: 99, Size: 512x512, Model: sdxl_base, Version: v1.10.1',
  ),
)
write('stealth.png', await png(hidden))

// InvokeAI 5: `invokeai_metadata`, beside the graph it ran (trimmed) in `invokeai_graph`.
const invoke = {
  app_version: '5.6.0',
  generation_mode: 'sdxl_txt2img',
  positive_prompt: 'a castle on a hill above the clouds',
  negative_prompt: 'blurry',
  width: 1024,
  height: 1024,
  seed: 3293022630,
  rand_device: 'cpu',
  cfg_scale: 7.5,
  cfg_rescale_multiplier: 0,
  steps: 30,
  scheduler: 'dpmpp_2m_k',
  model: { key: 'b1c2', hash: 'blake3:0a1b2c3d', name: 'Juggernaut XL v9', base: 'sdxl', type: 'main' },
  loras: [
    { model: { key: 'c3d4', hash: 'blake3:4e5f', name: 'Pixel Art XL', base: 'sdxl', type: 'lora' }, weight: 0.75 },
  ],
  vae: { key: 'd4e5', hash: 'blake3:6a7b', name: 'sdxl-vae-fp16-fix', base: 'sdxl', type: 'vae' },
}
const invokeGraph = { id: 'sdxl_graph', nodes: {}, edges: [] }
write(
  'invokeai.png',
  withText(await png(base), [text('invokeai_metadata', invoke), text('invokeai_graph', invokeGraph)]),
)

// SwarmUI: its documented example in an iTXt `parameters` chunk with no language, as it writes one.
const swarm = {
  sui_image_params: {
    prompt: 'a photo of a cat',
    model: 'OfficialStableDiffusion/sd_xl_base_1.0',
    seed: 1,
    steps: 20,
    cfgscale: 7.0,
    aspectratio: '1:1',
    width: 1024,
    height: 1024,
    automaticvae: true,
    negativeprompt: '',
    swarm_version: '0.9.3.1',
  },
  sui_extra_data: { date: '2025-01-25', prep_time: '6.11 sec', generation_time: '4.84 sec' },
  sui_models: [
    {
      name: 'OfficialStableDiffusion/sd_xl_base_1.0.safetensors',
      param: 'model',
      hash: '0xd7a9105a900fd52748f20725fe52fe52b507fd36bee4fc107b1550a26e6ee1d7',
    },
  ],
}
write(
  'swarmui.png',
  withText(await png(base), [{ keyword: 'parameters', text: JSON.stringify(swarm, null, 2), international: true }]),
)

// Midjourney: `Creation Time`, `Author` and `Description` chunks, and XMP with the Job ID and the Digital
// Source Type, as its PNG downloads carry them.
const job = '6a1f0c2e-9b3d-4e5f-8a7b-1c2d3e4f5a6b'
const xmp = [
  '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
  '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 4.4.0-Exiv2">',
  ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
  '  <rdf:Description rdf:about=""',
  '    xmlns:iptcExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"',
  `   iptcExt:DigImageGUID="${job}"`,
  '   iptcExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>',
  ' </rdf:RDF>',
  '</x:xmpmeta>',
  '<?xpacket end="w"?>',
].join('\n')
write(
  'midjourney.png',
  withText(await png(base), [
    text('Creation Time', 'Wed, 10 Jul 2024 18:29:18 GMT'),
    text('Author', 'loupe_tester'),
    text('Description', `a bowl of ramen, food photography --ar 3:2 --style raw --v 6.1 Job ID: ${job}`),
    { keyword: 'XML:com.adobe.xmp', text: xmp, international: true },
  ]),
)

// Draw Things: its JSON in XMP's exif:UserComment, with xmp:CreatorTool naming it.
const drawThings = {
  c: 'a koi pond, watercolour',
  uc: 'text',
  seed: 1234,
  steps: 20,
  scale: 4.5,
  sampler: 'DPM++ 2M Karras',
  model: 'sd_xl_base_1.0_f16.ckpt',
  size: '1024x768',
  strength: 1,
  lora: [{ file: 'koi_v1_lora_f16.ckpt', weight: 0.6 }],
}
write(
  'drawthings.png',
  await withTags('drawthings.png', await png(base), {
    'XMP-exif:UserComment': JSON.stringify(drawThings),
    'XMP-xmp:CreatorTool': 'Draw Things',
  }),
)

// Tensor.Art: its `generation_data` JSON beside the ComfyUI graph it ran, with its own node names.
const tensorData = {
  prompt: 'a lantern-lit street market at night, ',
  negativePrompt: 'bad quality, worst quality,',
  width: 768,
  height: 1024,
  imageCount: 1,
  steps: 25,
  cfgScale: 7,
  seed: '-1',
  clipSkip: 2,
  baseModel: {
    label: 'v14',
    type: 'BASE_MODEL',
    modelFileName: 'Illustrious-XL-v1',
    baseModel: 'SDXL 1.0',
    hash: 'BDB59BAC77D94AE7',
  },
  sdVae: 'Automatic',
  ksamplerName: 'dpmpp_2s_ancestral',
  schedule: 'sgm_uniform',
}
const tensorPrompt = {
  '10001': {
    class_type: 'ECHOCheckpointLoaderSimple',
    inputs: { ckpt_name: 'EMS-123456-EMS.safetensors' },
    _properties: null,
  },
  '10021': { class_type: 'EmptyLatentImage', inputs: { batch_size: 1, height: 1024, width: 768 }, _properties: null },
  '10032': {
    class_type: 'BNK_CLIPTextEncodeAdvanced',
    inputs: { clip: ['10001', 1], text: 'a lantern-lit street market at night' },
    _properties: null,
  },
  '10033': {
    class_type: 'BNK_CLIPTextEncodeAdvanced',
    inputs: { clip: ['10001', 1], text: 'bad quality, worst quality' },
    _properties: null,
  },
  '11002': {
    class_type: 'KSampler_A1111',
    inputs: {
      cfg: 7.0,
      denoise: 1.0,
      latent_image: ['10021', 0],
      model: ['10001', 0],
      negative: ['10033', 0],
      positive: ['10032', 0],
      sampler_name: 'dpmpp_2s_ancestral',
      scheduler: 'sgm_uniform',
      seed: 3013050530,
      steps: 25,
    },
    _properties: null,
  },
  '11019': { class_type: 'VAEDecode', inputs: { samples: ['11002', 0], vae: ['10001', 2] }, _properties: null },
  '12005': {
    class_type: 'SaveImage',
    inputs: { filename_prefix: '874258249849799801', images: ['11019', 0] },
    _properties: null,
  },
}
write('tensorart.png', withText(await png(base), [text('generation_data', tensorData), text('prompt', tensorPrompt)]))

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
