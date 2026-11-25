# Loupe: build phases

Each phase is one Claude Code session. Paste the prompt, let it finish, check the result yourself
(the "You check" list), then run `/clear` before the next phase so each starts with a fresh
context. The docs carry everything a new session needs.

**Before phase 1:** create an empty GitHub repository `HyphenSam/loupe`, clone it, put `CLAUDE.md`,
`SPEC.md`, `PRODUCT.md`, `DESIGN.md` and this file in it, and start Claude Code there. Have
ImageMagick and ffmpeg on your PATH, and Docker running (`pnpm fixtures` writes HEIC with libheif in
a container, as ImageMagick's Windows build can't; phase 7 builds jpegtran).

| Phase | What | Status |
|---|---|---|
| 1 | Scaffold, deploy, app shell, fixtures | ☑ |
| 2 | Open a file, the stage, ExifTool, Info | ☑ |
| 3 | Location: places, map, direction, sun | ☐ |
| 4 | AI check: C2PA, IPTC, generators, SynthID | ☐ |
| 5 | Jobs and exports, Privacy, Edit metadata | ☐ |
| 6 | Forensics and Extract, special kinds | ☐ |
| 7 | jpegtran, Crop and rotate | ☐ |
| 8 | Redact and Adjust | ☐ |
| 9 | Export | ☐ |
| 10 | Polish, offline, accessibility, README | ☐ |

---

## Phase 1: Scaffold, deploy, app shell, fixtures

```
Read CLAUDE.md, PRODUCT.md, DESIGN.md and SPEC.md. This is phase 1 of PHASES.md.

Loupe is a sister project of Moviola and Bytesize. Clone https://github.com/HyphenSam/Moviola and
https://github.com/HyphenSam/Bytesize into a temporary folder outside this repo and use Moviola as
the reference for setup: copy and adapt its package.json scripts, pnpm-workspace.yaml,
.node-version, .prettierrc.json, .gitignore, .gitattributes, tsconfig.json, vite.config.ts (PWA,
the 25 MiB asset check and the precache check in scripts/, dev and preview headers),
wrangler.jsonc, public/_headers, .claude/launch.json, src/test-setup.ts, src/test-pwa.ts,
src/lib/cn.ts, theme.ts, apps.ts, leaving.ts, format-bytes.ts, the ui/ primitives, the theme menu,
the app launcher, the update banner and the About dialog's structure. Use the latest versions of
the same dependencies. Drop mediabunny, its add-ons and gifenc. Add only what this phase needs.
Copy LICENSE-MIT and LICENSE-APACHE.

Then:
1. src/lib/brand.ts with APP_NAME 'Loupe', a one-line description, SOURCE_URL
   https://github.com/HyphenSam/Loupe. Manifest name, short name, description, en-GB,
   file_handlers for the types in SPEC.md section 3 (one table in src/lib/file-types.ts, shared
   with the file input's accept). Add Loupe to FALLBACK_APPS.
2. src/index.css with DESIGN.md's tokens for light and dark, including the dark stage and the
   magenta accent with white text on it in light and dark ink on it in dark. src/contrast.test.ts
   (as Moviola's) checks every text/background pair DESIGN.md names, in both themes.
3. An icon: public/icon.svg, a simple original mark (a lens ring over the corner of a print, in the
   accent on a dark rounded square), tools/icon-maskable.svg, and the PNG sizes Moviola has,
   rendered as its tools/README.md describes.
4. The app shell from DESIGN.md's Layout section: the tool rail with all eleven tools in two groups
   (icons from lucide, all disabled until a file is open), the settings column with the empty
   state, the dark stage with the "Drop an image here" drop target and "Choose file" (no behaviour
   yet beyond accepting the file into state, and paste), the stage toolbar's empty frame, and the
   mobile layout. About dialog with the structure for SPEC.md section 10's two sentences and the
   credits in CLAUDE.md's Licences section (filled in as each library arrives).
5. The WebAssembly and Worker check: without them the stage says the browser is too old.
6. scripts/fixtures.ts and `pnpm fixtures` (run with Node's TypeScript support or tsx): generate
   every file in SPEC.md section 12 that doesn't need ExifTool or the C2PA SDK yet (base pictures
   in every format, trailer-zip.jpg, misnamed.png, notimage.txt), with a clear place for the rest,
   which later phases add. Copy the public samples (C2PA test files from the C2PA SDK's repository,
   one Ultra HDR image from libultrahdr's, and ExifTool's maker-note test images from its
   distribution) and record each one's URL and licence in fixtures/SOURCES.md. Check the size
   limits. Commit them.

Follow the TDD rules in CLAUDE.md for every behaviour (the rail renders eleven tools in two groups,
the drop target and paste accept a file, the too-old message). Run pnpm test, pnpm typecheck and
pnpm build. Start the dev server and check the shell in the browser in light and dark, desktop and
narrow widths. Then tick phase 1 in PHASES.md and commit.
```

**You check:** `pnpm dev` shows the shell in both themes. Then deploy: in Cloudflare, create a
Worker from the repository with build command `pnpm build`, deploy command `npx wrangler deploy`,
and add the custom domain `loupe.hyphensam.com`. Add Loupe and its icon to `hyphensam-apps`'
`apps.json`. Push, and confirm the site loads and the launcher lists it on every sister site.

---

## Phase 2: Open a file, the stage, ExifTool, Info

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 2 of PHASES.md; phase 1 is done.

Build:
1. src/media/exiftool.ts over @uswriting/exiftool, with the zeroperl-ts patch CLAUDE.md describes
   so it runs in a Web Worker. Measure and record in CLAUDE.md: the wasm's size, the first start
   and a typical read of a 12 MP JPEG and a HEIC (use phone photos of your own if the fixtures are
   too small to tell). Settle ExifTool's arguments (SPEC.md section 4) and record them.
2. src/lib/formats.ts (sniffing, from Bytesize's, plus HEIC, JPEG XL, TIFF), src/lib/info.ts
   (ImageInfo), src/lib/tags.ts (ExifTool JSON into camera, dates, GPS, kinds, embedded items),
   src/lib/words.ts, src/lib/kinds.ts. Test tags.ts against the JSON ExifTool gives for every
   fixture, ExifTool's maker-note images included (shutter counts, serials).
3. src/media/codecs.ts: decoding with jSquash (from Bytesize: PNG, JPEG, WebP, JPEG XL), libheif
   for HEIC/HEIF (its separate wasm), the browser for AVIF, GIF and BMP; orientation applied
   (Bytesize's orientation.ts; not again for HEIC). Raw files: the largest embedded preview.
4. src/lib/protocol.ts and src/worker/ with open, pixels and pixel (SPEC.md section 7), a fake in
   src/lib/testing.ts, src/hooks/useSource.ts. App takes the client as a prop.
5. src/lib/capabilities.ts (SPEC.md section 9) with its start-up probe.
6. Opening a file: drop, paste, Choose file, launchQueue; errors as SPEC.md section 3; the file
   card with its kind chips. Tools enable and dim per SPEC.md section 6.
7. The stage (SPEC.md section 5): <img> or decoded canvas, zoom and pan (Bytesize's useZoomPan),
   the toolbar with view chips (Picture only for now), background menu, the magnifier, the pixel
   readout, the keyboard shortcuts.
8. The Info tool (SPEC.md 6.1) with the summary findings that don't depend on later phases (the
   rest show once their tools exist), the histogram, the All tags sheet with search and both copy
   buttons, and Copy summary.
9. Credit ExifTool and zeroperl, jSquash and its decoders, and libheif in About.

TDD throughout: tags, words, kinds, formats and the histogram maths in Node; components with
Testing Library. Then check by hand in Chrome and Firefox: every fixture opens; HEIC opens in both;
a real phone JPEG and HEIC of your own show the right camera, dates and orientation; the magnifier
and readout agree with an image editor's colour picker. Report what you checked. Tick phase 2 and
commit.
```

**You check:** open a few of your own photos (phone, camera, a screenshot, something saved from a
website) and compare Info with `exiftool -G1 -a -s <file>`.

---

## Phase 3: Location: places, map, direction, sun

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 3 of PHASES.md; phases 1–2 are done.

1. scripts/places.ts and `pnpm places`: download GeoNames' cities1000 and admin1CodesASCII and write
   public/places.bin and public/regions.json (SPEC.md section 12), under 5 MB. Commit them.
2. src/lib/places.ts (nearest place, the three wordings in SPEC.md 6.2, country by point in polygon
   from world-atlas's countries-50m, "At sea") and src/lib/geo.ts (compass words, DMS, the field of
   view cone). Many small tests: places near borders, the antimeridian, the poles, the sea.
3. src/lib/sun.ts over suncalc, with the UTC rules and wording in SPEC.md 6.2.
4. The map stage view (DESIGN.md's Map) with Leaflet: the bundled world map at once, OpenStreetMap
   tiles in CORS mode when online, switched to only when a tile loads, src/hooks/useOnline.ts, the
   pin, the cone and the sun line, attribution, and the tile caption. Make sure the service worker
   never caches tiles.
5. The Location tool (SPEC.md 6.2), dimmed without GPS, and Info's location finding.
6. Credit Leaflet, SunCalc, Natural Earth, GeoNames and OpenStreetMap in About.

TDD for the pure modules and the tool view. By hand in Chrome and Firefox, with the COEP headers on
(pnpm preview): tiles load online; with the network off (devtools) the offline map shows and the
pin is in the right place; the cone points the right way on camera.jpg and on a real phone photo
taken facing a known direction; the sun line is plausible for a photo whose time you know. Report
what you checked. Tick phase 3 and commit.
```

**You check:** open a phone photo taken somewhere you know and confirm the place, the direction
and the sun. Turn your network off and reload: the offline map should appear.

---

## Phase 4: AI check: C2PA, IPTC, generators, SynthID

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 4 of PHASES.md; phases 1–3 are done.

1. scripts/trust.ts and `pnpm trust`: fetch the official C2PA trust list's anchors and the Content
   Authenticity Initiative's interim trust list into public/trust/ with the fetch date. Find their
   current URLs from the C2PA and CAI documentation, and record them in the script.
2. src/media/c2pa.ts over @contentauth/c2pa-web (wasm via ?url, a Context with trust checking and
   the bundled anchors), src/hooks/useProvenance.ts, and src/lib/ai/c2pa.ts turning the manifest
   store into findings. Test c2pa.ts against the manifest JSON the SDK gives for each C2PA sample
   (save those JSONs as fixtures; the SDK needs a browser).
3. src/lib/ai/source-type.ts (every Digital Source Type term), the generator parsers and stealth.ts
   (SPEC.md 6.3's table), and verdict.ts with every row of the verdict table. Add the AI fixtures to
   scripts/fixtures.ts, then check each parser against at least one real file from that generator
   (search for public samples, or ask me for some) and correct the table where they differ.
4. The AI check tool (SPEC.md 6.3): the verdict, Content Credentials, Digital Source Type,
   generators with Copy prompt and Save workflow, and Check on SynthID with the PNG made ahead
   (the worker's png request) and the clipboard rules in CLAUDE.md. Info's AI finding.
5. Credit the C2PA SDK in About.

TDD throughout. By hand in Chrome and Firefox: each C2PA sample shows the right verdict and signer;
a picture you make with ChatGPT or Gemini today shows its Content Credentials; Check on SynthID
copies and opens the site in both browsers (check whether synthid.com accepts a paste, and tell me;
if it doesn't, make the caption say to drop the saved copy instead). Report what you checked. Tick
phase 4 and commit.
```

**You check:** generate one picture each with ChatGPT and Gemini, and one with your own Stable
Diffusion or ComfyUI setup if you have one, and open them. Try Check on SynthID on the Gemini one.

---

## Phase 5: Jobs and exports, Privacy, Edit metadata

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 5 of PHASES.md; phases 1–4 are done.

Build the job machinery and the two metadata tools:
1. The Plan type (src/lib/plans/plan.ts), src/media/run.ts for metadata plans, the run and cancel
   messages (cancel restarts the worker and reopens the file), src/hooks/useJob.ts (SPEC.md
   section 7), the progress component, the Lossless/Re-encodes badge, and the exports strip with
   Download, Copy and Open in Loupe. src/lib/names.ts (SPEC.md section 8). beforeunload and the
   update banner's wording, as Moviola's.
2. src/lib/privacy.ts and src/lib/plans/privacy.ts, and the Privacy tool (SPEC.md 6.4): findings,
   quick picks, what's always kept, the read-back after the job. Info's privacy finding.
3. src/lib/plans/edit-metadata.ts and the Edit metadata tool (SPEC.md 6.7), with MWG writing, Set
   location on the map, and the Content Credentials warning.
4. Node tests end to end: for every fixture ExifTool can write, run Privacy's Everything and
   Location only, and Edit metadata's fields, then read the result back: the right tags gone or
   written, Orientation and the ICC profile kept, and the image data byte-identical to the
   source's (compare JPEG scan data, PNG IDAT, and so on per format).

TDD throughout. By hand in Chrome and Firefox: clean a real phone photo and check it with
`exiftool`; set a location on the map and see it in Location after Open in Loupe; cancel a job.
Report what you checked. Tick phase 5 and commit.
```

**You check:** clean one of your own photos with Privacy's Everything, then run
`exiftool -a -G1 -s` on the result and read what's left.

---

## Phase 6: Forensics and Extract, special kinds

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 6 of PHASES.md; phases 1–5 are done.

1. src/lib/forensics/: history.ts (edit trail and crs: settings in plain words), quant.ts
   (quality estimate, IJG and Photoshop tables, room for known devices), trailer.ts (known and
   unknown trailers, what unknown ones look like), ela.ts, noise.ts and phash.ts on plain pixels.
   Exhaustive tests: quant.ts against JPEGs made at known qualities by MozJPEG; phash.ts distances
   for the same picture resized, recompressed and cropped.
2. The worker's layer, extract and fingerprint requests; the Error levels and Noise stage views.
3. The Forensics tool (SPEC.md 6.5), Compare with another image, and Find it online with the same
   copy-and-open helper as SynthID. Info's edit trail finding.
4. The Extract tool (SPEC.md 6.6) for every embedded kind, with Open in Loupe for pictures.
5. The special kinds: Motion Photo, depth map (the Depth view), Ultra HDR gain map, 360° panorama
   (the 360° view, one WebGL shader), with their fixtures in scripts/fixtures.ts.

TDD throughout. By hand in Chrome and Firefox: cropped-thumb.jpg shows the mismatch; the ZIP comes
out of trailer-zip.jpg and opens; error levels on a JPEG you edited and re-saved show the edit; a
real Motion Photo's video plays (if you have a Pixel or Samsung photo); the 360° view turns with the
mouse and the keyboard. Report what you checked. Tick phase 6 and commit.
```

**You check:** send yourself a photo through WhatsApp (or another chat app) and open both copies:
compare their compression findings and fingerprints. If the chat app's tables aren't recognised,
give Claude both files in a later session to add them to quant.ts.

---

## Phase 7: jpegtran, Crop and rotate

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 7 of PHASES.md; phases 1–6 are done.

1. tools/jpegtran/: build.sh building libjpeg-turbo's jpegtran (the latest release) to WebAssembly
   with Emscripten in Docker, exposing one function: bytes in, transform (rotate, flip, transpose,
   transverse, crop, perfect, trim, copy all) in, bytes out. Commit the output to src/vendor/jpegtran/
   and record the version and flags in tools/jpegtran/README.md. src/media/jpegtran.ts over it.
2. src/lib/mcu.ts (the block grid in the source's orientation, snapping), src/lib/pixels.ts (exact
   turns, flips and crops; straightening with bicubic resampling and the largest inner rectangle),
   and src/lib/plans/crop-rotate.ts with every lossless rule in SPEC.md 6.8 and 6.0.
3. run.ts for pixel plans: decode, transform, encode (jSquash, from Bytesize's engine), then
   ExifTool copying metadata under SPEC.md 6.0, dropping what it lists.
4. The crop frame and handles on the stage (DESIGN.md), keyboard included, the grid chip, `[` `]`
   and `\`, and the Crop and rotate tool view.
5. Node tests end to end: every turn and flip of grid-444.jpg and grid-420.jpg is lossless (decode
   the result and compare with turning the decoded source); orient-6.jpg needs -trim and loses the
   promised pixels only; a grid-snapped crop is lossless and has the promised size; PNG turns are
   pixel-exact; Orientation is 1 and thumbnails are gone in every result.
6. Credit libjpeg-turbo in About.

TDD throughout. By hand in Chrome and Firefox: crop and turn a real phone JPEG losslessly, open the
result in Loupe and check the badge's promise held (Forensics' compression section should show the
original's tables). Report what you checked. Tick phase 7 and commit.
```

**You check:** rotate a sideways photo of your own and open the result in your usual photo viewer
and in a browser: both should show it upright.

---

## Phase 8: Redact and Adjust

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 8 of PHASES.md; phases 1–7 are done.

1. src/lib/redact.ts (black, blur and pixelate on plain pixels) and src/lib/plans/redact.ts, the
   redaction boxes on the stage (DESIGN.md), keyboard included, and the Redact tool (SPEC.md 6.9)
   with its metadata rules.
2. src/lib/adjust.ts (exposure in linear light, contrast, highlights, shadows, saturation, warmth),
   tested on known pixels; src/lib/plans/adjust.ts; the preview on a stage-sized copy redrawn at
   most once a frame; the Adjust tool (SPEC.md 6.10) with reset and `\`.
3. Node tests end to end: a redacted PNG differs from its source only inside the boxes; a redacted
   JPEG has no thumbnail, no Content Credentials and, with the switch on, no identifying tags.

TDD throughout. By hand in Chrome and Firefox: redact text in a screenshot with each fill; adjust a
real photo and compare preview and result side by side; check the sliders' feel at the extremes.
Report what you checked. Tick phase 8 and commit.
```

---

## Phase 9: Export

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 9 of PHASES.md; phases 1–8 are done.

1. Bring over Bytesize's engine pieces Loupe needs: the encoders and their settings, resize.ts,
   target.ts (fitQuality), the AVIF and JPEG XL threads, and the Compare component. Keep its tests.
2. src/lib/plans/export.ts and the Export tool (SPEC.md 6.11): formats, quality, lossless switch,
   resize, target size, Keep metadata, the badge rule, the Compare stage view, the size change, and
   remembered settings.
3. Node tests: the Lossless badge's cases; a target size lands under the target or says why not;
   Keep metadata off leaves only the colour profile.
4. Credit MozJPEG, libwebp, libavif, libjxl and oxipng in About.

TDD throughout. By hand in Chrome and Firefox: export a real photo to each format with and without
a resize and a target size; compare in each mode; check the threaded encoders run with the headers
on. Report sizes and timings and what you checked. Tick phase 9 and commit.
```

---

## Phase 10: Polish, offline, accessibility, README

```
Read CLAUDE.md, SPEC.md, PRODUCT.md, DESIGN.md. This is phase 10 of PHASES.md; phases 1–9 are done.

1. PWA: precache everything (ExifTool, the C2PA SDK, the codecs, jpegtran, the places and map data,
   the trust lists) with maximumFileSizeToCacheInBytes set; confirm the whole app works offline
   after one visit, map included (the bundled one); the update banner; file_handlers launching
   straight into the file. Record the first visit's download size in About and CLAUDE.md.
2. Accessibility pass against PRODUCT.md: keyboard through every tool, the stage, the magnifier,
   the crop frame, redaction boxes, the map and the 360° view; visible focus in both themes; labels
   and live regions for findings, progress and errors; reduced motion.
3. Mobile pass at 375 px: layout from DESIGN.md, the primary action fixed at the bottom, tool chips,
   pinch zoom on the stage, the crop frame and boxes by touch.
4. Copy pass against SPEC.md sections 10 and 11: every finding says what it rests on, every
   message is a full sentence naming the real format or number, British spelling.
5. README.md in the style of Moviola's: what it does tool by tool, the lossless promise, how sure
   each AI finding is, what leaves the device, browser notes, licence and credits, development and
   deploying.
6. Re-read SPEC.md against the app and fix any drift, in the code or the spec.

Test what can be tested; check the rest by hand in Chrome, Firefox and, through the deployed site,
Safari on an iPhone if one is available (HEIC shows natively there). Report what you checked. Tick
phase 10 and commit.
```

**You check:** install the app from the deployed site, open a photo with it from the file manager,
and go through every tool once more, offline.
