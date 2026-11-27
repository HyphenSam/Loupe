# Loupe

A static web app (Cloudflare Workers, static assets only) for inspecting and editing a single image
entirely on the user's device: ExifTool (WebAssembly) for metadata, the C2PA SDK for Content
Credentials, jSquash and libheif for decoding and encoding, jpegtran for lossless JPEG turns and
crops, PaddleOCR's models in ONNX Runtime Web for reading text. Installable (PWA) and works offline. The name lives in `src/lib/brand.ts` and
`vite.config.ts` (manifest) only. Sister project of Bytesize, Moviola and Art Cleaner; its setup and
UI system are Moviola's, refitted for still images, and its compression engine is Bytesize's.

SPEC.md says what every tool does and is the authority for behaviour. PHASES.md is the build order;
tick a phase's status there when it's finished.

## Test-driven development is mandatory

Every change to behaviour follows red, green, refactor:

1. **Red.** Write or change a test that states the behaviour. Run it (`pnpm test <file>`) and watch it
   fail for the reason you expect. A test you never saw fail proves nothing.
2. **Green.** Write the least code that makes it pass.
3. **Refactor** with the tests green, then run the whole suite (`pnpm test`) and `pnpm typecheck`.

Rules:

- No production code without a failing test first. That includes bug fixes: reproduce the bug in a
  test, then fix it.
- Don't weaken, skip or delete a test to get green. If a test is wrong, say why in the change.
- Keep logic testable: deriving findings from tags, place and sun wording, generator parsers, the
  AI verdict, privacy findings and their removal arguments, JPEG table analysis, trailers, pixel
  maths (adjust, redact, straighten, error levels, noise, perceptual hash), each edit's plan, file
  naming and settings are pure modules in `src/lib/`. They never import ExifTool, the codecs, the C2PA
  SDK or the DOM (`import type` is fine). They take `ImageInfo` (plain data), pixels as
  `{ width, height, data: Uint8ClampedArray }` and settings, and return plain data, a `Plan`, or a
  list of problems written for the user.
- `src/media/` is the only place that calls the WebAssembly libraries: `exiftool.ts` (read and write),
  `codecs.ts` (jSquash, libheif), `jpegtran.ts`, `c2pa.ts`, `ocr.ts` (ONNX Runtime Web). ExifTool, jSquash,
  jpegtran and ONNX Runtime Web run in Node, so reading every fixture, every metadata job and every lossless transform is tested end to end
  in Node against the real files in `fixtures/`. Check the bytes that come out (tags read back, image
  data byte-identical where the job is lossless), not just that nothing threw.
- Fakes over mocks: the worker client and job runner are tested with fakes from `src/lib/testing.ts`.
- Components get React Testing Library tests for behaviour users see (`// @vitest-environment jsdom`
  at the top of the file). Test what the user does and sees, not implementation details.
- Things only a real browser can show (the stage's colour and HDR, the C2PA SDK's worker, the
  clipboard, Leaflet and the tiles, WebGL, the service worker) are checked in a real browser after
  the unit tests pass: Chrome in the built-in browser, Firefox through Playwright (the
  `playwright-cli` skill). Check both at least. Say what you checked when you report.

## Commands

```bash
pnpm install
pnpm dev              # http://localhost:5173
pnpm test             # Vitest, once
pnpm test:watch
pnpm typecheck
pnpm build            # typecheck + build to dist/; fails if any file is over the 25 MiB asset limit
                      # or left out of the service worker's precache
pnpm preview          # serves dist/ with the same headers as production
pnpm fixtures         # regenerates fixtures/ (needs ImageMagick, ffmpeg and Docker; the output is committed)
pnpm places           # rebuilds public/places.bin from GeoNames (downloads; the output is committed)
pnpm trust            # refreshes public/trust/ from the C2PA trust lists (downloads; committed; monthly in CI)
pnpm ocr              # refreshes public/ocr/ and src/lib/ocr/models.json (downloads; committed); again after
                      # updating onnxruntime-web
pnpm exec wrangler dev  # serves dist/ on the Workers runtime, reading public/_headers as production does
```

`tools/jpegtran/build.sh` rebuilds `src/vendor/jpegtran/` with Emscripten in Docker; run it only to
change libjpeg-turbo's version or flags.

## Design

PRODUCT.md (who it's for, voice, principles) and DESIGN.md (tokens and rules) are the authorities
for UI work; tokens live in `src/index.css`. Keep to them: zinc neutrals, one magenta accent for action,
selection, the crop frame and progress, a dark neutral stage so the picture can be judged,
sentence-case labels, state shown by form as well as colour, light and dark both first-class. Every
action says whether it is lossless or re-encodes; every finding says what it rests on.

## Code style

- KISS. Small modules, plain functions, no premature abstraction.
- TypeScript strict, Prettier (no semicolons, single quotes, 120 columns).
- Comment the why, briefly, in the style of the existing code.
- UI copy uses British spelling ("colour", "optimise", "licence").
- Stack: Vite, React 19, Tailwind v4, Radix primitives (`radix-ui`), lucide icons, Vitest,
  `@uswriting/exiftool`, `@contentauth/c2pa-web`, jSquash, `libheif-js`, Leaflet, `suncalc`,
  `world-atlas` with `topojson-client`.
- pnpm only.

## Layout

- `src/lib/` pure logic: `info.ts` (the `ImageInfo` type and helpers), `file-types.ts`, `formats.ts`
  (sniffing, from Bytesize's), `containers.ts` (JPEG, PNG and RIFF block walks, from Bytesize's),
  `tags.ts` (ExifTool's JSON into `ImageInfo`'s fields), `words.ts` (plain words for tag values),
  `kinds.ts`, `places.ts` (reading places.bin, the nearest place and its wording), `countries.ts`
  (which outline a point falls in), `geo.ts` (distances, bearings, compass words, DMS, the field of
  view cone, map links), `sun.ts`, `location.ts` (the Location tool's rows), `ai/` (`generators.ts`
  (which parser claims the file, the known-software list, stealth merged in), `finding.ts` (the
  `GeneratorFinding` type and the parsers' helpers), one parser per generator (`a1111.ts`,
  `comfyui.ts`, `tensorart.ts`, `novelai.ts`, `invokeai.ts`, `swarmui.ts`, `fooocus.ts`,
  `drawthings.ts`, `midjourney.ts`), `stealth.ts`,
  `source-type.ts`, `c2pa.ts` (the SDK's manifest JSON into findings), `verdict.ts`, `view.ts` (the AI
  check's rows), `manifests/` (the SDK's JSON for each C2PA sample, saved from Chrome, for the tests)),
  `privacy.ts`
  (findings and the ExifTool arguments that remove them), `forensics/` (`history.ts`, `quant.ts`, `tables.ts` (the tables quant.ts knows, as data), `view.ts` (the
  Forensics tool's rows),
  `trailer.ts`, `ela.ts`, `noise.ts`, `layer.ts` (what the two layers share: amplifying, the sliders), `phash.ts`),
  `motion.ts` (a Motion Photo's MP4: where it is, its duration, its location boxes, blanking them), `extract.ts`
  (Extract's names and types), `pano.ts` (the 360° view's look and its shader), `pixels.ts` (orientation, rotate, flip,
  straighten, crop), `crop.ts` (Crop and rotate's state and how each control and the frame change it), `adjust.ts`,
  `redact.ts`, `mcu.ts` (the JPEG block grid), `resize.ts` and
  `target.ts` (Bytesize's), `plans/` (one module per edit tool: settings + info + capabilities in,
  `Plan` or problems out; `plan.ts` holds the `Plan` type, `metadata.ts` what metadata jobs share, `pixel-edit.ts` what pixel edits share (SPEC.md 6.0)), `capabilities.ts`, `names.ts` (`stem`),
  `settings.ts`, `file-edit.ts` (the open file's tool, view and edits, and when they start afresh), `views.ts` (the stage's view chips), `tiles.ts` (when the map shows tiles),
  `announce.ts` (what a screen reader hears while a file opens), `still.ts` (reduced motion for scripts),
  `protocol.ts` (page ↔ worker), `format-bytes.ts`, `leaving.ts`, `theme.ts`, `apps.ts`, `ocr/` (the Text tool's
  pure steps: `types.ts` (`Quad`, `TextLine`), `scripts.ts`, `models.ts` and `models.json` (the manifest `pnpm ocr`
  writes), `image.ts` (resampling, normalised planes), `quad.ts` (hull, smallest rectangle, unclip), `detect.ts` (the
  detector's input, its map to boxes), `line.ts` (cut and straighten, turn, the recogniser's input), `ctc.ts`,
  `order.ts` (reading order), `files.ts` (which files a script needs, the download size, the default script, stale
  cache keys, the tool's download wording)), `zoom.ts` (fit, zoom, pan, and `reveal`, which brings a box on stage).
- `src/media/` the WebAssembly wiring: `exiftool.ts`, `codecs.ts`, `jpegtran.ts`, `c2pa.ts`, `ocr.ts` (reads text),
  `run.ts` (turns a `Plan` into output bytes with the above). For tests only: `node.ts` (the wasm and
  fixtures from disk) and `image-data.ts` (a file's picture bytes without its metadata, per format, to
  check lossless jobs).
- `src/vendor/jpegtran/` the committed WebAssembly build (see `tools/jpegtran/`).
- `public/ocr/` the text recognition files `pnpm ocr` fetches, with `SOURCES.md`; never precached.
- `tools/text-fixtures/` ImageMagick with the Noto fonts, for the Text tool's fixtures.
- `src/worker/` the Web Worker: holds the open image, answers the requests in SPEC.md section 7, looks up
  the place (`places.ts` loads the places data),
  runs plans with `src/media/`.
- `src/components/` the UI (`ui/` holds the primitives; `JobAction.tsx` the primary action, its
  Lossless badge and the progress in its place; `ExportsStrip.tsx`; `PrivacyView.tsx`; `EditMetadataView.tsx`
  (its form lives in `App`, so it outlasts a visit to another tool and the map can place its pin); `CropRotateView.tsx`
  (its state lives in `App` too, shared with the frame and `[` `]` `\`); `RedactView.tsx` (its boxes live in `App`, shared
  with the stage); `AdjustView.tsx` (its sliders live in `App` too); `OutputDisclosure.tsx` (the Output disclosure
  under those three, its choice in each tool's settings, null for the default); `ExportView.tsx` (its settings live in `App`,
  remembered); `stage/` the stage, its views, the magnifier,
  the crop frame (`CropFrame.tsx`), redaction boxes (`RedactBoxes.tsx`) and Adjust's preview (`AdjustPreview.tsx`, worked out by the worker), the map, the 360° view; `PromptText.tsx` a generator's prompt;
  `save.ts` saves a Blob as a download; `ExtractView.tsx`; `TextView.tsx` (the Text tool: its script and selected line
  live in `App`, shared with the stage's boxes, `stage/TextBoxes.tsx`); `stage/PanoramaView.tsx` the 360° view; `stage/Compare.tsx` (Bytesize's) and `stage/CompareStage.tsx` Export's
  Compare view). `src/App.tsx` puts it together; it
  takes the worker client as a prop so tests pass a fake. `src/main.tsx` creates the real worker.
- `src/hooks/` state: `useSource` (the open file, its picture and info), `useProvenance` (C2PA),
  `useJob`, `useStage` (view, zoom, pan, background, magnifier), `useZoomPan` (Bytesize's),
  `useOnline`, `useTheme`, `useCopyAndOpen` (copy the picture and open a site: SynthID, reverse search), `useLayer` (Forensics' layer for the stage, latest settings winning), `useTextFiles` (the Text tool's download into
  Cache Storage, Cancel and Remove; App takes its `TextStore` and the models manifest as props so tests pass
  `FakeServer`, `FakeCaches` and `fakeModels` from `src/lib/testing.ts`), `useTextReads` (reads per file and script).
- `fixtures/` small images made by `scripts/fixtures.ts`, and the public samples listed in
  `fixtures/SOURCES.md`. Don't edit them by hand.

## How a file opens

1. The page shows the file card and, if the browser decodes the format (`Capabilities.shows`), an
   `<img>` of the file at once.
2. The worker sniffs the bytes, decodes the picture (for the readout, previews and any format the
   browser can't show, which it sends back as an upright `ImageBitmap`), runs ExifTool once, and
   runs Loupe's own readers. It replies with `ImageInfo`.
3. In parallel the page asks the C2PA SDK for the manifest store; the AI check and Privacy wait for it
   with "Reading Content Credentials…".

## How a job runs

1. The user picks a tool and its settings. The tool's planner (`src/lib/plans/`) turns `ImageInfo`,
   the settings and the capabilities into a `Plan`, or into problems that the settings column shows
   and that disable the action.
2. The worker runs the `Plan` with `src/media/run.ts`: metadata jobs through ExifTool on the
   original bytes; lossless JPEG jobs through jpegtran, then ExifTool to fix Orientation, dimensions
   and dropped blocks; pixel jobs as decode, transform (pure `src/lib/` code), encode, then ExifTool
   to copy metadata from the source under SPEC.md 6.0's rules.
3. The result returns as a Blob and joins the exports strip with its size.

Cancelling terminates the worker and starts another, which reopens the current file under the same id. Every request
after `open` names its file by that id (`fileId`), and the worker refuses one about a file it doesn't hold (`OTHER_FILE`).

## Image facts that bite

Checked while writing the spec; re-check each when its phase uses it, and correct this list.

- `@uswriting/exiftool` (1.0.9, ExifTool 13.42) depends on `@6over3/zeroperl-ts`, whose
  `zeroperl.wasm` is 25,358,252 bytes (24.2 MiB): under Cloudflare's 25 MiB asset limit with about
  0.8 MiB to spare, 7.5 MB gzipped. An update that crosses the limit fails the build; then pin the
  last version that fits.
- zeroperl-ts loads its wasm with `fetch('./zeroperl.wasm')` when `window` and `document` exist, and
  otherwise as a file path for Node, Deno or Bun. In a Web Worker the window check fails, and Node's
  own branch breaks on Windows paths. ExifTool's `fetch` option is only used on the window branch. So
  `patches/@6over3__zeroperl-ts@1.0.10.patch` adds `Ee=()=>!0;`, making that branch always taken, and
  Loupe always passes `fetch`: the wasm's Vite `?url` asset in the browser, the file in Node. The patch
  is hand-trimmed to one hunk with no context lines, because the minified line is 35 KB; redo it by
  hand when zeroperl-ts updates. `@6over3/zeroperl-ts` is a direct dependency for the `?url` import.
- ExifTool keeps one Perl instance between calls, held in a WeakRef; `dispose()` frees it. Calls must
  not overlap. Its memory grows with every call: reads slow gradually (130 → 190 ms over 25 reads of a
  small JPEG in Node), and a few hundred reads and writes took calls to 10 s each, then failed with
  "offset is out of bounds". `src/media/exiftool.ts` starts a fresh instance every 40 calls, and the
  Node tests that write call `restart` after each test.
- Writing goes through `writeMetadata(file, {}, { args })` with `-m -q -q`: the wrapper fails on any
  stderr, so minor errors and warnings are kept quiet and the read-back judges the result. The name
  passed must carry the extension of the format the bytes are (`Plan.exifName`): ExifTool refuses a
  JPEG named `.png`. It can't write BMP, nor Hasselblad's 3FR (`%noWriteFile` in ExifTool.pm). It lists X3F
  as writable but writes nothing into its test image, so Edit metadata's read-back says so. `-all=` on a raw file removes its maker notes (a NEF went from
  6 to 3 kB) and CRW refuses it, so Privacy never wipes raw or TIFF files. A bare JPEG XL codestream
  comes back in a container (the codestream unchanged, in a `jxlc` box). An iPhone HEIC keeps its
  gain map item and its `XMP-HDRGainMap` version after `-all=`.
- With `-use MWG`, the `MWG:` composites write EXIF and XMP, and IPTC only when the file already has IPTC.
  Title has no composite: `XMP-dc:Title`, and `IPTC:ObjectName` when there's IPTC. GIF and CRW take no EXIF,
  so they get XMP (GPS goes to `XMP-exif`); a CRW's own date is `CanonRaw:DateTimeOriginal`, written too.
  `MWG:DateTimeOriginal` with an offset also sets `OffsetTimeOriginal`, and without one removes it.
  `-GPSPosition=lat, lon` sets the four GPS tags from signed numbers.
- IPTC written without `CodedCharacterSet=UTF8` comes back empty for anything outside ASCII (’, ©, ë), so
  Edit metadata sets it whenever it writes IPTC.
- ExifTool reads with `-json -l -G0:1 -a -u --System:all` (`READ_ARGS` in `src/media/exiftool.ts`).
  `-l` gives each tag's desc, val and num, so no `#` tags are needed. Without `-b`, binary tags are
  listed by size only; `readBinary` gets the bytes with `-json -b -G0:1 -TAG`. No `-struct`, so the All
  tags sheet gets flat tags.
- The wrapper treats any stderr output as failure, and ExifTool warns when asked for the bytes of a
  stub preview (most of its raw test images), so `largestPreview` catches each `readBinary` and tries
  the next candidate.
- Measured on this machine: in Chrome, the first ExifTool call (start plus a read of a 12.5 MP JPEG)
  took 610 ms; later reads took 344–410 ms for a 12 MP JPEG and 637–701 ms for a 12 MP HEIC. Opening a
  file through to Info took 0.53–0.67 s for a JPEG and 1.4–1.7 s for a HEIC, because libheif decodes
  before ExifTool runs. In Node, reads of 12 MP files took 250–310 ms.
- `-all=` removes Orientation and the ICC profile with everything else, which turns pictures
  sideways and shifts colours. Removing "everything" is `-all= -tagsFromFile @ -ICC_Profile
  -Orientation` (and the gain map's XMP and MPF when it's kept). Check per format in Node.
- `@contentauth/c2pa-web` (0.17.2) runs its own worker; its `c2pa_bg.wasm` is 9.2 MB (3.3 MB gzipped).
  Import the wasm with Vite's `?url` (`@contentauth/c2pa-web/resources/c2pa.wasm?url`) so it can be
  compiled streaming and precached. Settings go in a `Context` passed to each `Reader`
  (`createC2pa({ settings })` was removed); one `Context` fetches the trust lists once and keeps them.
  The SDK fetches a trust setting only when it starts with `http`, so `src/media/c2pa.ts` passes absolute
  same-origin URLs to `public/trust/`, which the service worker precaches (`pem` is in the glob).
- The C2PA trust list's anchors go in as "system" anchors and the frozen interim list's (anchors and
  end-entity `allowed.pem`) as "user" ones; the result then says `found in [manifest_system_anchors]` or
  `[manifest_user_anchors]` and `trustListUri` names the same, which is how the caption tells them apart.
  The interim list's `store.cfg` isn't bundled: its EKUs lack C2PA's claim-signing one, and the SDK's
  default accepts both. In November 2026 ChatGPT (signer "OpenAI OpCo, LLC") and Gemini ("Google LLC")
  chain to the C2PA list; Firefly's 2024 samples to the interim one.
- With `ocspFetch: false` and `remoteManifestFetch: false` nothing is fetched; ChatGPT's and Gemini's
  manifests still report `signingCredential.ocsp.notRevoked` from OCSP responses stapled inside them.
- Who made the picture is in the creating action's `softwareAgent` (ChatGPT: `{ name: 'ChatGPT' }`),
  not the claim generator ('OpenAI Media Service API'); `softwareAgent` can also be a bare string.
  Gemini names no agent, describes its actions instead ("Applied imperceptible SynthID watermark."),
  and gives its claim generator a build number as its version, which Loupe leaves out.
  `digitalSourceType` comes as `http://` or `https://`, and v2 actions include
  `c2pa.watermarked.unbound`.
- Changing any byte the manifest hashes, metadata included, makes Content Credentials fail to
  validate. That's correct, and Edit metadata says so.
- The Windows ImageMagick build reads HEIC but can't write it (no HEVC encoder), so `pnpm fixtures`
  makes `photo.heic` with libheif's `heif-enc` and its x265 plugin in an Alpine container
  (`libheif-tools libheif-plugins-all`).
- libultrahdr publishes no Ultra HDR sample under 1 MB: its `tests/data` holds only Apple gain maps,
  and the smallest image in its benchmark set (`jpegr/mountains.jpg`) is 4.9 MB. So `pnpm fixtures`
  builds its `ultrahdr_app` (`tools/ultrahdr/Dockerfile`, pinned) and encodes `ultra-hdr.jpg`. It writes
  only ISO 21496-1 gain map metadata unless built with `UHDR_WRITE_XMP`, and that XMP describes a
  single-channel gain map only (`-M 0`); phones write both.
- jSquash's packages have no `exports` map, so Node needs `@jsquash/jpeg/encode.js` with the
  extension; its codecs are initialised with a compiled module (`init(module)`), as Bytesize's tests do.
- jSquash's JPEG decoder applies EXIF orientation with `preserveOrientation: true`; the default `false`
  keeps the stored pixels, and Loupe orients them itself.
- `libheif-js` is LGPL-3.0. Use its separate `libheif-wasm/libheif.wasm` (1.5 MB), not the 2 MB
  bundle with the wasm inlined. libheif applies HEIF's `irot`/`imir` transforms itself; HEIC's EXIF
  Orientation describes the same turn, so don't apply it again. libheif-js calls `onRuntimeInitialized`
  before its factory returns, so the code takes the module from `this`.
- ExifTool's ImageSize for HEIC is before the clean-aperture crop (64 × 64 for `photo.heic`, which
  shows as 64 × 48), so the decoder's size wins.
- An `<img>` applies EXIF orientation (CSS `image-orientation: from-image` is the default); jSquash's
  decoders don't, and ignore the ICC profile too (Bytesize).
- In Chrome on this machine, the start-up probe said `<img>` shows JPEG XL.
- world-atlas's outlines are spherical, not cut at the antimeridian: Russia's and Fiji's rings jump
  from +180 to -180 in one edge, and Antarctica's coast is a ring around the pole (with a degenerate
  ring along -89.999°). `countries.ts` unwraps each ring onto the plane and tests a point at ±360° too.
  Natural Earth's France holds French Guiana, Réunion, Martinique, Guadeloupe and Mayotte, which
  GeoNames codes apart; `regions.json` records which codes go with each outline.
- SunCalc 2 (a rewrite) gives altitude and azimuth in degrees, azimuth clockwise from north, and ships
  its own types; SunCalc 1 and `@types/suncalc` used radians from south.
- `geo.ts` and `countries.ts` have no runtime imports and `scripts/places.ts` imports them with `.ts`
  extensions, because Node runs the script without Vite's resolver.
- The worker reads the places data (`src/worker/places.ts`) on the first picture with GPS. In Chrome,
  a warm open of camera.jpg took 189 ms against 172 ms for a picture without GPS.
- Firefox ignores `clipboardData` on a synthetic `ClipboardEvent`, so hand checks there open files
  with Playwright's `setInputFiles` on the file input rather than a pasted `DataTransfer`.
- iOS caps a canvas at about 16.7 MP; draw scaled copies on the stage there.
- Workbox precaches files up to 2 MiB by default and quietly skips bigger ones. Set
  `maximumFileSizeToCacheInBytes` above the largest file (zeroperl's wasm), and let
  `scripts/precache.ts` (Moviola's) catch anything missing.
- Clipboards take images as PNG only. Opening a tab moves focus away, and Chrome refuses clipboard
  writes from a page without focus, so the write starts in the click (a `ClipboardItem` holding the
  PNG, made beforehand) and the tab opens after it resolves, still within the click's activation.
  The desktop app's built-in browser denies `clipboard-write` outright; check Copy through Playwright
  with a real click.
- OpenStreetMap's tile servers need a Referer (`public/_headers` sends `strict-origin-when-cross-origin`),
  visible attribution, and no bulk or offline downloading, so the service worker must never cache
  tiles. Under COEP `require-corp`, cross-origin images need CORS or CORP: request tiles in CORS mode
  (Leaflet's `crossOrigin: 'anonymous'`); OpenStreetMap sends `Access-Control-Allow-Origin` on tiles.
  Check in both browsers that tiles load with the headers on.
- `navigator.onLine` can be true without internet, so the map switches to tiles only when one loads.
- A `parameters` chunk can be `tEXt`, `zTXt` or `iTXt`; read all three. Stealth metadata is read
  from the decoded pixels before any colour conversion: jSquash's PNG decoder gives the stored values.
  ExifTool decodes all three; it names each chunk by its keyword with the first letter capitalised
  (`PNG:Parameters`, `PNG:Sd-metadata`, `PNG:Generation_data`), so the parsers key on `family:name` in
  lower case. The worker decodes every PNG at open for stealth metadata: 0.23 s in Node for NovelAI's
  1773 × 1773 PNG, 0.7–0.8 s to Info in Chrome for 1.5–4.5 MB PNGs.
- tEXt is Latin-1. A non-Latin-1 character written into it (a curly apostrophe in a JSON note) turns
  into a control byte and the JSON fails to parse; the fixtures' chunk writer refuses such text.
- ComfyUI's seeds go past 2^53; `finding.ts`'s `json` keeps their digits with `JSON.parse`'s reviver
  `context.source` (Chrome 114, Firefox 135, Node 21).
- Real ComfyUI graphs nest subgraphs: API node ids like `60:19`, and the workflow's top-level nodes
  include subgraph instances whose `type` is a definition's id in `definitions.subgraphs`.
- jSquash's PNG encoder (`@jsquash/png/encode.js`) is initialised in Node with the same
  `squoosh_png_bg.wasm` as its decoder; the worker's `png` request uses it.
- synthid.com takes a pasted picture (a paste starts detection, asking to sign in first). The
  desktop app's built-in browser denies the clipboard write and blocks the tab a script's click opens,
  so check Check on SynthID through Playwright.
- JPEG lossless turns need whole blocks on the moving edges (8 px, or 16 px for 4:2:0 chroma);
  `-perfect` fails otherwise and `-trim` drops the partial ones. Lossless crops need the left and top
  edges on the grid; jpegtran moves them there itself if they aren't, so the planner snaps first and
  the test checks the result's size. Only the stored right and bottom edges can be partial, and a turn is
  perfect when each ends up at the right or bottom (transpose always is). jpegtran's crop is measured in
  the turned picture after trimming, so a trimmed strip that moved to the left or top shifts it.
- The same blocks turned decode up to 3 apart per channel: libjpeg's integer IDCT rounds between its
  column and row passes, which swap under a transpose, and 4:2:0's fancy upsampling rounds differently
  across and down. So losslessness is tested on the blocks: turned back, jpegtran writes byte-identical
  scan data to what it writes for the source.
- jpegtran writes the quantisation tables as one DQT segment each (a phone JPEG had both in one), and transposes
  them on a quarter turn along with the blocks. An iPhone's tables are symmetric, so they come back identical.
- While cropping, the stage draws the upright picture centred in the turned box and turns it with CSS
  (`cssTurn`: the turn's matrix, then the straightening's rotate), so preview and job share `pixels.ts`'s
  matrices. The readout maps back with `toUpright`.
- Straightening a 12 MP JPEG took about 15 s in Chrome (bicubic in JS in the worker, then MozJPEG).
- Redact previews blur and pixelate on the worker's stage-sized copy (`pixels(2048)`) with the strength scaled, so
  the preview is close to the result but not exact. Pixelate's 8 px minimum blocks leave 32 pt text in a
  45 px box faintly guessable; the tool's warning says so. A drag that starts within 12 px of the selected
  box's corner grabs its handle instead of drawing.
- Adjust's preview is worked out in the worker (`adjusted`, on a 2048 px copy it keeps per open file) and drawn
  over the picture by `AdjustPreview`: one request out at a time, the next asking for the latest settings, the
  newest answer drawn in the next animation frame. `adjust.ts` is three 256-entry tables (exposure and warmth as
  gains in linear light, then the tone curve) and, with saturation, a per-pixel mix; it reads and writes whole
  pixels through `Uint32Array` views, which halved its time, with the clamps written out (Firefox didn't inline a
  helper: 46 ms against 27). On this machine a 2048 × 1536 copy takes 10–11 ms without saturation and 26 ms
  (Chrome) or 32 ms (Firefox) with it. Worked out on the page, that held Firefox's frames at 33 ms while Saturation
  moved; in the worker, dragging over a 12 MP photo keeps both browsers' frames at 15–16 ms median (p95 21 in
  Chrome, 31 in Firefox), with the preview redrawn about 33 times a second in Chrome and 20 in Firefox. Saving it
  took 12 s. The preview is close to the result, not exact: the curves applied before downscaling differ from
  after (a mean of 1.8 per channel over 16 px blocks of foliage, against 0.2 for the result and `adjust.ts` on the
  full picture). A hidden built-in browser pane runs no animation frames, so time drags through Playwright.
- ExifTool can't add a colour profile to AVIF or JPEG XL (13.42: `-ICC_Profile` copies nothing into either), and
  jSquash's libavif and libjxl take none, so Export, Crop and rotate, Redact and Adjust convert those to sRGB
  (SPEC.md 6.0, `needsSrgb` in `plans/pixel-edit.ts`; `run.ts` takes the worker's `srgb` getter). Chrome converts
  while decoding: an Adjust of a 12 MP iPhone JPEG to AVIF or JPEG XL differs from the source as Chrome shows it by
  0.9–1.1 per channel in its most saturated tenth, against 7.4 for P3 values read as sRGB. Playwright's Firefox (158)
  converts nothing: `createImageBitmap` ignores `colorSpaceConversion`, an `<img>` drawn on a canvas gives the stored
  values too, and it has no Display P3 canvas for `decodeSrgb`'s fallback, so its AVIF and JPEG XL from that photo
  differ by 7.2–7.3, as before the conversion. Not checked in a stock Firefox.
- oxipng (`@jsquash/oxipng`) keeps a PNG's chunks (text, XMP, iCCP) and reduces 16-bit to 8 only when no value
  changes; `optimiseAlpha` would change the colour under transparent pixels, so it's off. Pixel edits' PNGs go
  through it; the clipboard's PNG uses the quicker plain encoder. In a worker with threads it starts a thread pool
  (`workerHelpers`).
- jSquash's AVIF and JPEG XL encoders pick their `_mt` builds when `wasm-feature-detect` finds threads (Node
  never), so Node's tests initialise the single-threaded wasm.
- Fitting a target size runs ExifTool once per try; within one test ExifTool's slowdown made three formats' searches
  take 69 s against 30 s with a test each.
- A service worker from an earlier build keeps serving that build on the same localhost port (4173 or 8787):
  unregister it and clear its caches before checking a new build by hand, or block service workers in Playwright.
- ImageMagick's `-annotate` on `xc:white` writes a 16-bit PNG unless asked for `-depth 8 PNG24:`; Loupe then
  says Re-encodes, rightly, since the result has 8 bits a channel.
- user-event reads `[` as the start of a key code: type `[[` for the key. The built-in browser's `key` action
  needs the character (`]`), not a name like `bracketright`. A Playwright `goto` from a page with undownloaded
  exports stops at the leave prompt; start a fresh session instead.
- Pinch zoom (`useZoomPan`) follows fingers in the capture phase, so it works over the crop frame and redaction
  boxes, which stop their pointer events from reaching the stage. A second finger makes the stage
  `setPointerCapture` both pointers: the frame or box gets `lostpointercapture` and puts its drag back. jsdom's
  `PointerEvent` defaults `isPrimary` to false (a browser's first touch is true), so code that tests `isPrimary ===
  false` breaks every `fireEvent.pointerDown` in the tests that doesn't set it. The built-in browser has no
  multi-touch: check pinch there with synthetic `PointerEvent`s of `pointerType: 'touch'`, two ids.
- On narrow screens an edit tool's action is fixed to the foot of the screen, and `.app:has(.job-bar)` pads the
  page by its height. Padding `body` does nothing: `body` and `#root` are `height: 100%`.
- `@uswriting/exiftool` mounts one file, and a second only as `config`, which it passes as `-config <path>`
  after the other arguments. ExifTool ignores a `-config` that isn't first (its warning silenced by
  `-q -q`), so `copyTags` sends the source there and `-tagsFromFile /source.ext` reads it by path.
- A module that exports a function named `then` is thenable, and awaiting its import (Vitest does) calls
  it. Don't export `then`.
- The desktop app's built-in browser never shows a `beforeunload` prompt; check leave prompts in
  Playwright. It doesn't save downloads to disk either: check downloaded bytes through Playwright's
  `download.saveAs`. Privacy's jobs finish in well under a second on small files, too fast for
  Playwright's click on Cancel; click Remove and Cancel from a page script.
- Leaflet (1.9.4) runs in jsdom: give `HTMLElement.prototype`'s `clientWidth` and `clientHeight` a
  size and it lays out tiles as `<img>`s, so firing `load` on one drives the tile switch in tests. Its
  pane z-indices live in its CSS, which Vitest doesn't load, so layering is tested by document order.
- The map's outlines are fetched after the cone and sun line are drawn, so they're sent to the back;
  otherwise the land covers them.
- The built-in browser can't go offline; check the offline map with Playwright's
  `context().setOffline(true)` in Chromium and Firefox. In Firefox, tile requests made at the instant of
  `setOffline(false)` can fail, so the map keeps the outlines until the next `online` event, as SPEC
  6.2 says.

- ExifTool flattens XMP-xmpMM:History into lists that don't line up: a "converted" step has no time or
  software, so its parameters land beside another step's. The worker reads the history again with
  `-struct` (`readHistory`) when the file has `HistoryAction`. ExifTool reads `crs:Version="16.0"` as 16.
- ExifTool (13.42) doesn't read inside a JPEG's embedded MP4: `-ee`, `-ee2` and `-ee3` only add
  `Trailer:File:EmbeddedVideo`. So `motion.ts` walks the video's boxes for its duration and location. ffmpeg's mp4
  muxer writes a location as 3GPP's `loci`; Android writes `©xyz`, which the fixture script appends to moov
  itself (moov last, so no offset moves). ExifTool keeps a Google trailer when it writes EXIF, and `-all=` removes
  it with the container directory.
- Real Motion Photos (NightMean/MotionPhotoSamples on GitHub; a Pixel 9 Pro XL and Samsung Galaxy phones):
  - Samsung JPEGs hold the MP4 once but ExifTool names it twice: `MakerNotes:Samsung:EmbeddedVideoFile` (the MP4)
    and `Trailer:Google:MotionPhotoVideo` (56–111 bytes longer, into Samsung's `SEFH`/`SEFT` trailer). So Extract
    lists the MP4 `motion.ts` found, once.
  - HEIC Motion Photos keep the MP4 in a top-level box after HEIF's own: Google's `mpvd` (the MP4 alone), or on an
    S20 Samsung's `sefd` (`MotionPhoto_Data`, then the MP4, then Samsung's trailer). In mpv3 files
    `EmbeddedVideoFile` is a 12-byte pointer. ExifTool keeps both boxes when it writes, but `-all=` removes `sefd`
    (Samsung's trailer, to ExifTool) and keeps `mpvd`.
  - Samsung writes `©xyz` as `+00.0000+000.0000/` when location is off.
  - The Pixel 9's maker notes say `FrameCount=11` (the HDR+ burst): not an animation. Its GPS block holds only
    `GPSVersionID` and unset fields. Its gain map is MPF image 2, but ExifTool gives `Trailer:GainMapImage` the
    video's bytes; Google's `DirectoryItemLength` has the gain map's true length.
  - The phones' videos are H.264 or HEVC. Playwright's Firefox decodes H.264 but not HEVC (`MEDIA_ERR_DECODE`
    after the metadata loads), so HEVC playback is checked in Chrome. Vite's dev server answers a path with an
    encoded comma (`%2C`) with `index.html`: fetch samples with `encodeURI`, not `encodeURIComponent`.
- ExifTool names GDepth's `Data` `XMP-GDepth:DepthImage` (base64-decoded by `-b`), and a container's depth item
  `Trailer:Google:DepthMapImage` (its trailer reader handles only `image/jpeg` and `video/mp4` items).
- `readBinary` passes `-m`: ExifTool's raw test images hold text stubs ("<Dummy preview image data>") where
  previews were, and without it the wrapper fails on the warning. `-XMP -b` gives the packet as a JSON string, not
  base64; `readBinary` returns its UTF-8 bytes.
- `-Trailer:all=` removes an unknown trailer after a JPEG, and `-all=` does too, but both take known trailers
  (a Motion Photo's video, a gain map) with them, so Privacy cuts hidden data itself (`MetadataPlan.cut`).
  ExifTool reports nothing about an unknown trailer when reading. Its `MPImageStart` is from the start of
  the file.
- Photoshop's Save As tables come from ImpulseAdventure's lookup (archived; the site is gone), checked against
  ExifTool's JPEGDigest: 0–2 match its "Adobe Photoshop" keys, 3–12 its "Adobe Lightroom" bands. Photoshop
  writes both tables in one DQT segment. ExifTool also lists a second Photoshop set for 3–12, by digest only.
  `zeroperl.wasm` holds ExifTool's Perl as text, so `grep -a` finds its tables and readers.
- MozJPEG (jSquash's default, `quant_table` 3) uses one table for luminance and chrominance, and writes 16-bit
  tables when a value passes 255. At quality 100 every scaled table is all ones, so libjpeg's and MozJPEG's
  can't be told apart there.
- ImageMagick's `jpeg:q-table` XML needs a `<description>` in each table, and its tables are scaled by
  `-quality`: at 50 they're written as given.
- PaddlePaddle publishes PaddleOCR's models as ONNX on Hugging Face (`PaddlePaddle/<model>_onnx`, Apache-2.0), so
  nothing is converted with paddle2onnx. PP-OCRv6 (June 2026) has tiny, small and medium detectors and recognisers
  but no recogniser per language: small's 18,708 characters hold Han, kana, about 400 accented Latin letters and
  Greek, and no Hangul or Cyrillic; tiny's have no kana. So Latin, Chinese and Japanese are read with PP-OCRv6 small
  (21.2 MB; 88 against PP-OCRv5 mobile's 76 on PaddleOCR's Japanese set), Korean (13.4 MB) and Cyrillic (8.0 MB) with
  PP-OCRv5 mobile, and every script's lines are found by PP-OCRv6 tiny's detector (1.8 MB; 80.6 against PP-OCRv5
  mobile's 75.2 on PaddleOCR's table, 91 against 65 for rotated text). v6 small's accented letters cover the same
  languages as v5's Latin recogniser; neither has Vietnamese's stacked marks.
- The v5 and v6 models take the same input (BGR, as OpenCV reads; the detector normalised by ImageNet's mean and
  spread in that order, lines 48 px high normalised to −1–1) and give softmax over CTC's blank, the character list
  (`inference.yml`'s `character_dict`) and a space. The detectors' DB thresholds differ (v6 tiny 0.2, 0.4 and unclip
  1.4; v5 mobile 0.3, 0.6, 1.5), so models.json carries the detector's. For a rectangle, pyclipper's unclip followed
  by OpenCV's `minAreaRect` is the rectangle grown by area × ratio ÷ perimeter on every side.
- Downloads per script, ONNX Runtime's wasm (14.8 MB) and the detector included: Latin, Chinese and Japanese 37.9 MB,
  Korean 30.1 MB, Cyrillic 24.7 MB; all three 59.4 MB. The wasm gzips to 3.9 MB; whether Cloudflare compresses
  `.onnx` wasn't checked.
- onnxruntime-web 1.31.1: its plain build (`ort-wasm-simd-threaded.wasm`, 14,848,852 bytes) fits the asset limit; the
  WebGPU (JSEP) build is 29.5 MB and wouldn't. `onnxruntime-web/wasm` resolves to `ort.wasm.bundle.min.mjs` (77 kB,
  the Emscripten glue inlined), which names its wasm with `new URL(…, import.meta.url)`: Vite emits that copy into
  `assets/`, unused and left out of the precache. The worker hands ONNX Runtime the bytes from Cache Storage
  (`env.wasm.wasmBinary`), so it fetches nothing. Its threads are workers named `em-pthread` started from the
  bundle's own module, which is Loupe's worker chunk: Loupe's message handler there sees Emscripten's messages, finds
  no request type it knows and answers nothing. Threads worked in the built app in Chrome and Firefox with the
  headers on: reads took 1.6–1.9 times as long with `numThreads = 1`. It runs in Node too (Vitest, `numThreads = 1`),
  so no onnxruntime-node. PaddleOCR's export leaves unused initialisers that ONNX Runtime warns about on every load;
  `logSeverityLevel: 3` quiets them.
- Measured on this machine (16 threads), built app, files in Cache Storage, with threads (one thread): loading ONNX
  Runtime and the Latin, Chinese and Japanese models in a fresh worker added about 150 ms in Chrome 156 and 240 ms
  in Firefox 158. Reads: 3 lines 152–162 ms (300); the 8-line Latin fixture 348–394 ms (648–671); the sign 406–486 ms
  (686–695); a 12 MP photo of a handwritten sign, 11 lines, 0.72–0.84 s (1.27–1.33 s). In Node on one thread the
  Latin fixture took 0.67 s warm and 1.1 s with the models loading.
- Every rendered fixture and the printed sign read exactly in Node, Chrome and Firefox. The handwritten 12 MP sign
  (Commons, CC0, "JR's Barber Shop", Baltimore; not committed) at 960 px gave "Barber", "TuesoFri", "9+07",
  "Sat-12+07" and the phone number, missed "JR's" and "Shop", and read its painted stars as 米. Detecting at
  1280–2048 px found "JR's" and "Shop" but added a lorry's number plate and stray marks.
- Playwright's Firefox with the app's service worker installing (precaching 56 MB) made the page's fetches crawl and a
  scripted read stalled; open it with `"contextOptions": { "serviceWorkers": "block" }` in a `--config` file.
- On the dev server with service workers blocked nothing is precached, so a file opened offline fails at ExifTool
  ("ExifTool couldn't be loaded"): check the Text tool offline on the built app (`pnpm preview`) with the service worker
  installed, then `setOffline(true)` and reload. Done so in Chromium, it opened a new file and read it from
  `loupe-text`.
- `playwright-cli open` doesn't return on this machine though the browser opens: start it in the background, check
  `playwright-cli list`, then run code against the session.
- Reads in the dev server in Chrome with the files held: the 8-line Latin fixture 1.2 s from Download (local, so
  mostly the 38 MB fetch and hashing), the sign 0.44 s and the vertical Japanese 0.21 s from opening the tool.
- Wikimedia Commons answers Node's default `fetch`; a Commons sample has no commit to pin, so `scripts/samples.ts`
  pins it by SHA-256.

## Hosting facts that bite

- Workers Builds deploys `main` with `npx wrangler deploy`, using `wrangler.jsonc` (assets only, no
  Worker script; unknown paths get `index.html`). pnpm 11 refuses dependency install scripts it
  hasn't been told about, so `workerd` is allowed in `pnpm-workspace.yaml`; a new dependency with an
  install script needs the same. `protobufjs` (onnxruntime-web's) is listed as refused: its script only checks
  versions.
- `.github/workflows/trust.yml` runs `pnpm trust` on the 1st of each month (or by hand) and opens a
  pull request from `trust-lists` when a `.pem` changed. It needs the repository setting "Allow GitHub
  Actions to create and approve pull requests". A pull request opened with the workflow's token
  triggers no other workflows.
- Static assets are capped at 25 MiB a file.
- `public/_headers` sets COOP `same-origin` and COEP `require-corp` so the AVIF and JPEG XL encoders
  can use threads (as Bytesize). Everything is same-origin except OpenStreetMap's tiles (above) and
  the app launcher's list.
- WebAssembly threads and the clipboard need a secure context: localhost or HTTPS.
- The theme choice is a `theme` cookie on `Domain=hyphensam.com`, shared with the sister sites; on
  localhost it stays on the host. `index.html` applies it before the first paint.
- The app launcher (grid button) reads `https://apps.hyphensam.com/apps.json`, a separate static
  Worker (`../hyphensam-apps`); Loupe is added there once, with its icon. It must send CORS and
  `Cross-Origin-Resource-Policy: cross-origin`, or COEP blocks it. `FALLBACK_APPS` in
  `src/lib/apps.ts` lists all four sites.
- vite-plugin-pwa (`prompt` mode) reloads every tab that saw the waiting worker; `UpdateBanner`
  passes `onNeedReload` as in Moviola.
- The service worker precaches everything (ExifTool, the C2PA SDK, the codecs, jpegtran, the places
  and map data), so the whole app works offline after one visit. That first visit is large: 60 files,
  57 MB unpacked, about 19 MB as Cloudflare sends them (brotli) in November 2026, of which zeroperl's
  wasm is 7.4 MB and the C2PA SDK's 3.5 MB; About says "about 19 MB". To measure it again, brotli each
  file the built `dist/sw.js` lists at quality 3, which matched what Cloudflare sent for zeroperl's
  wasm (quality 4 came out 5% smaller, 5 14%). Text recognition kept it at 60 files: `public/ocr/` and Vite's copy of
  ONNX Runtime's wasm are `LEFT_OUT` (`scripts/precache.ts`), and only the worker's chunk grew, by ONNX Runtime's
  JavaScript (about 77 kB before compression).

## Licences

The code is MIT OR Apache-2.0. Used unmodified unless noted, each keeping its own licence, credited
in About:

- ExifTool by Phil Harvey: the same terms as Perl (Artistic or GPL). `@uswriting/exiftool` and
  zeroperl are Apache-2.0 (zeroperl-ts patched as above; the patch stays Apache-2.0); Perl itself is
  Artistic or GPL.
- `@contentauth/c2pa-web` and the C2PA SDK: MIT (c2pa-rs is MIT OR Apache-2.0).
- jSquash: Apache-2.0, with MozJPEG, libwebp, libavif, libjxl and oxipng under their own licences
  (as Bytesize).
- libheif (`libheif-js`): LGPL-3.0, its wasm served as a separate file so it can be replaced.
- libjpeg-turbo (jpegtran): the IJG licence, BSD-3-Clause and zlib. Its notices go in About.
- Leaflet: BSD-2-Clause. SunCalc: BSD-2-Clause. `world-atlas` and `topojson-client`: ISC; Natural
  Earth's data is public domain.
- GeoNames data: CC BY 4.0, credited in About.
- PaddleOCR's models (PP-OCRv6 and PP-OCRv5): Apache-2.0. ONNX Runtime (`onnxruntime-web`): MIT, © Microsoft
  Corporation. Both credited in About (phase 20); `public/ocr/SOURCES.md` records the sources.
- OpenStreetMap tiles: © OpenStreetMap contributors, shown on the map.
