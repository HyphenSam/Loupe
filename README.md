# Loupe

**[loupe.hyphensam.com](https://loupe.hyphensam.com)**

One picture, looked at closely, in your browser: where and when it was taken and on what camera, whether
it says it was made with AI, what it gives away about you, whether it has been edited, and everyday edits
to it (crop, straighten, redact, adjust, convert and compress). Pictures never leave your device: the work
is done by [ExifTool](https://exiftool.org/) and the [C2PA SDK](https://github.com/contentauth/c2pa-js)
running as WebAssembly, with [jSquash](https://github.com/jamsinclair/jSquash)'s codecs,
[libheif](https://github.com/strukturag/libheif) and libjpeg-turbo's jpegtran for the pictures. Install it
as an app and it works offline, and opens pictures straight from your file manager.

It opens JPEG, PNG, WebP, AVIF, HEIC and HEIF, JPEG XL, GIF and BMP. Camera raw files (DNG, CR2, CR3,
CRW, NEF, NRW, ARW, SR2, RAF, ORF, RW2, PEF, SRW, 3FR, IIQ, X3F) open for their metadata and embedded
preview, and TIFF for its metadata; Loupe doesn't show TIFF pictures yet.

## Lossless first

Most jobs don't need to touch the picture, so Loupe leaves it alone: removing or changing metadata copies
the picture's bytes as they are, JPEGs are turned, flipped and cropped by moving their compressed blocks
with jpegtran, and PNG, lossless WebP and lossless JPEG XL are written losslessly after an edit. When a
job has to re-encode, the action says so before it runs: every action carries a **Lossless** or
**Re-encodes** label, with a line saying what is kept, what is converted and what is dropped (an
embedded thumbnail that would show the picture before the edit, say). Results are written in the
source's format where a browser can write it; an edited HEIC comes out as a JPEG.

## Tools

Inspect:

- **Info:** a summary (date taken, place, the AI check's verdict, what could identify a person or
  place, the editing software), then the picture (format, size, bit depth, colour profile, HDR, animation), what kind of
  picture it is (Motion Photo, Live Photo, portrait with a depth map, 360° panorama, burst, screenshot,
  raw), the camera (exposure, lens, flash, shutter count from the maker notes, serial numbers), every
  date, and a histogram. "All tags" lists everything ExifTool reads, searchable, to copy as text or
  JSON; "Copy summary" copies the rest as plain text for a report.
- **Location:** the nearest town, named offline from GeoNames ("12 km north-east of Arrowtown, Otago,
  New Zealand"), the coordinates in decimal and degrees, altitude, accuracy, which way the camera
  faced, and where the sun was at the time. The map shows the pin, the camera's field of view and a
  line towards the sun: a bundled world map offline, OpenStreetMap's tiles when online.
- **AI check:** what the file says about how the picture was made (below), with a button that copies
  the picture and opens SynthID to check for Google's invisible watermark.
- **Privacy:** everything in the file that could identify a person or place, grouped (location, device
  serial numbers, people, software and file paths, dates, embedded thumbnails, AI prompts, Content
  Credentials, hidden data after the picture), each ticked to remove. The colour profile and the
  picture's orientation always stay. It reads the result back and says what, if anything, is left. A
  Motion Photo's video keeps playing, its own location blanked.
- **Forensics:** the edit trail (software, Photoshop's history, Lightroom's settings, dates that
  disagree), whether the embedded thumbnail still matches the picture, the JPEG's estimated quality
  and whose tables wrote it, data hidden after the end of the picture, error levels and noise drawn
  over the picture, the file's SHA-256 and a perceptual hash to compare with another picture, and
  buttons that copy the picture and open Google Lens, TinEye or Bing.
- **Text:** reads the text in the picture (Latin letters, Chinese and Japanese; Korean; or Cyrillic) so
  you can copy it, line by line or all at once, with each line's box drawn over the picture and the lines
  it's unsure of marked. PaddleOCR's models run on your device; they're downloaded from Loupe's own site
  the first time you ask (25 to 38 MB depending on the script) and kept for offline use.
- **Extract:** saves what's embedded, as the file holds it: thumbnails and previews, a Motion Photo's
  video, a depth map, an HDR gain map, the colour profile, the XMP packet, a ComfyUI workflow,
  generation settings, the Content Credentials manifest and hidden data. Pictures can be opened in
  Loupe.

Edit:

- **Edit metadata:** date taken with its time zone, title, caption, creator, copyright, keywords and
  location (kept, removed, or set by typing or clicking the map), written to EXIF and XMP, and IPTC when
  the file has it, so they agree. Lossless.
- **Crop and rotate:** free or fixed aspects, quarter turns, flips and straightening up to 45°. JPEG
  crops snap to the block grid so they stay lossless, and a turn that would leave partial blocks offers
  to trim a few pixels instead of re-encoding.
- **Redact:** boxes filled black, blurred or pixelated, with the metadata removed too by default.
  Thumbnails, previews and Content Credentials always go, since they could show what was hidden.
- **Adjust:** exposure, contrast, highlights, shadows, saturation and warmth, previewed as the sliders
  move.
- **Export:** convert to JPEG, WebP, AVIF, JPEG XL or PNG, at a quality or under a target size such as
  200 kB, optionally resized, with or without the metadata. A Compare view shows the result against
  the original, side by side or under a slider.

Results collect in a strip under the picture, each with its size and the change against the original,
to download, copy or open again in Loupe to keep editing.

## How sure the AI check is

It reads three things a file can carry, strongest first, and every finding says which one it rests on:

1. **Content Credentials (C2PA),** checked against the C2PA trust list bundled with the app. A valid
   manifest from a recognised signer is the strongest evidence there is: "Made with AI", "Edited with
   AI" or "Signed by the camera", signed by OpenAI or Google, say, and verified. A valid signature from
   a signer Loupe doesn't recognise is shown as what it claims, and says so. Credentials that don't
   verify mean the file was changed after signing or the signature is broken.
2. **IPTC Digital Source Type** in the XMP, in plain words ("Made with generative AI", "Captured by a
   camera").
3. **Generator metadata:** the settings AUTOMATIC1111, Forge, SD.Next, ComfyUI, Tensor.Art, NovelAI,
   InvokeAI, SwarmUI, Fooocus, Draw Things and Midjourney write, with the prompt, model, seed, sampler
   and LoRAs; stealth metadata hidden in a PNG's pixels by NovelAI and others; and the software fields
   of other known generators.

The last two are statements anyone can add or remove, so they read "Says it was made with AI". A file
with none of these says "No AI markers found", never "Not AI": most sites strip metadata when a picture
is uploaded. Loupe never guesses from the pixels.

## What leaves your device

Loupe has no server, analytics, web fonts or CDNs, and never uploads a picture. Only these leave your
device, and the app says so where each happens:

- **Map tiles** from OpenStreetMap while the Location map shows and you're online. The service worker
  never keeps them.
- **A picture you copy** to SynthID or a reverse image search, after you press that site's button. Loupe
  puts it on the clipboard and opens the site; you paste it there.
- **The sister sites' list** for the app launcher, from `apps.hyphensam.com`.
- Links you follow: OpenStreetMap and Google Maps at the picture's location, and the credits.

Downloading text recognition fetches its files from Loupe's own site and sends nothing; the picture is read
on your device.

## Browsers

Loupe targets current Chrome, Edge, Firefox and Safari on desktop, and Chrome and Safari on phones. It
needs WebAssembly and Web Workers, and turns features on by what the browser can do, never by its name.

- **First visit:** about 19 MB is downloaded and kept, most of it ExifTool and the Content Credentials
  checker, so everything works offline from then on. Text recognition is a separate download of 25 to
  38 MB, fetched only when you ask for it in the Text tool.
- **HEIC, AVIF and JPEG XL** are shown by the browser where it can (HEIC only in Safari) and decoded by
  Loupe otherwise, which takes a moment longer for a large HEIC.
- **Copying pictures** needs a browser whose clipboard takes images. Where it doesn't, the buttons save a
  PNG copy to upload instead.
- **Wide-gamut colour** (Display P3) can't be stored in AVIF or JPEG XL here, so those results are
  converted to sRGB. Chrome converts while decoding; Firefox may leave the colours slightly off.
- **iPhones and iPads** cap a canvas at about 16.7 megapixels, so a bigger picture decoded by Loupe is
  shown scaled down, and says so. Results are still full size.
- **The 360° view** of a panorama needs WebGL 2.
- **Motion Photo videos** are saved as they are; a phone's HEVC video may not play in Firefox.

## Keyboard

On the stage: `0` fits the picture, `1` shows it at 100%, `+` and `-` zoom, arrow keys pan, and `L`
toggles the magnifier, which the arrow keys then move a pixel at a time (ten with Shift). Hold `\` to see
the picture before a crop, redaction or adjustment, and press `[` or `]` to turn it while Crop and rotate
is open. The crop frame's handles, redaction boxes, the map's pin and the 360° view all take the arrow
keys too. In the Text tool each line's Copy button is reached with Tab, and focusing it shows the line's
box on the stage. `Esc` closes the tag sheet or deselects a box.

## Licence

Licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.

Loupe uses, unmodified unless noted, each under its own licence:

- [ExifTool](https://exiftool.org/) by Phil Harvey (the same terms as Perl: Artistic or GPL), run by
  [@uswriting/exiftool](https://github.com/uswriting/exiftool) (Apache-2.0) on
  [zeroperl](https://github.com/6over3/zeroperl-ts) (Apache-2.0, patched to load in a Web Worker).
- The [C2PA SDK](https://github.com/contentauth/c2pa-js) (MIT; c2pa-rs is MIT or Apache-2.0), and the
  C2PA's and the Content Authenticity Initiative's trust lists.
- [jSquash](https://github.com/jamsinclair/jSquash) (Apache-2.0), with MozJPEG, libwebp, libavif, libjxl,
  oxipng and image-rs's png, each under its own licence.
- [libheif](https://github.com/strukturag/libheif) and libde265 (LGPL-3.0), through libheif-js, its
  WebAssembly served as a separate file so it can be replaced.
- [libjpeg-turbo](https://libjpeg-turbo.org/)'s jpegtran (the IJG licence, BSD-3-Clause and zlib), built
  to WebAssembly by `tools/jpegtran/`. This software is based in part on the work of the Independent JPEG
  Group.
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)'s PP-OCRv6 and PP-OCRv5 models (Apache-2.0), run
  by [ONNX Runtime Web](https://onnxruntime.ai/) (MIT, © Microsoft Corporation).
- [Leaflet](https://leafletjs.com/) and [SunCalc](https://github.com/mourner/suncalc) (BSD-2-Clause),
  [world-atlas](https://github.com/topojson/world-atlas) and
  [topojson-client](https://github.com/topojson/topojson-client) (ISC).
- Data: [GeoNames](https://www.geonames.org/) (CC BY 4.0), [Natural Earth](https://www.naturalearthdata.com/)
  (public domain), and map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

The About dialog lists them all with what each does.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the
work by you, as defined in the Apache-2.0 licence, shall be dual licensed as above, without any
additional terms or conditions.

## Development

Needs Node 24+ and pnpm 11 (pinned in `package.json` and `.node-version`, which Cloudflare's builds
read too).

```bash
pnpm install
pnpm test          # Vitest
pnpm typecheck
pnpm dev           # http://localhost:5173
```

This project is test-driven: see [CLAUDE.md](CLAUDE.md) for the rules, the architecture and the image
facts it depends on, [SPEC.md](SPEC.md) for what each tool does, and [PRODUCT.md](PRODUCT.md) and
[DESIGN.md](DESIGN.md) for the interface. ExifTool, the codecs and jpegtran run in Node, so the tests
open every fixture and check the bytes each job writes.

The bundled data and test files are made by scripts and committed:

- `pnpm fixtures` makes the test pictures in `fixtures/` (needs ImageMagick, ffmpeg and Docker); the
  public samples among them are listed in `fixtures/SOURCES.md`.
- `pnpm places` rebuilds `public/places.bin` from GeoNames.
- `pnpm trust` refreshes the C2PA trust lists in `public/trust/`. A GitHub workflow runs it on the 1st of
  each month and opens a pull request when they change.
- `tools/jpegtran/build.sh` rebuilds jpegtran's WebAssembly with Emscripten in Docker.

## Deploying

Cloudflare Workers Builds builds it from this repository on every push to `main` and serves it at
loupe.hyphensam.com (a custom domain on the Worker). The Worker's build settings:

- **Build command:** `pnpm build`
- **Deploy command:** `npx wrangler deploy`

The Worker only serves the static files in `dist/`, as set in [`wrangler.jsonc`](wrangler.jsonc). The
build fails if any file is over the 25 MiB limit on static assets (ExifTool's WebAssembly is 24.2 MiB),
or if the service worker would leave a file out of its precache, so the whole app works offline.
`public/_headers` sets cross-origin isolation headers so the AVIF and JPEG XL encoders can use threads.
To try the production build on the Workers runtime locally: `pnpm build && pnpm exec wrangler dev`.
