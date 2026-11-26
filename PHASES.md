# Loupe: build phases

Each phase is one Claude Code session. Paste the prompt, let it finish, check the result yourself
(the "You check" list), then run `/clear` before the next phase so each starts with a fresh
context. The docs carry everything a new session needs.

**Before phase 1:** create an empty GitHub repository `HyphenSam/loupe`, clone it, put `CLAUDE.md`,
`SPEC.md`, `PRODUCT.md`, `DESIGN.md` and this file in it, and start Claude Code there. Have
ImageMagick and ffmpeg on your PATH, and Docker running (`pnpm fixtures` writes HEIC with libheif in
a container, as ImageMagick's Windows build can't; phase 12 builds jpegtran).

Each phase is sized to fit one session's context. If one still runs long, stop at a clean point,
commit what works, and split the rest into a new phase here before going on.

| Phase | What | Status |
|---|---|---|
| 1 | Scaffold, deploy, app shell, fixtures | ☑ |
| 2 | Open a file, the stage, ExifTool, Info | ☑ |
| 3 | Places, sun and the Location tool | ☑ |
| 4 | The map | ☑ |
| 5 | Content Credentials, Digital Source Type and the verdict | ☑ |
| 6 | Generators, stealth metadata and SynthID | ☑ |
| 7 | Jobs and exports, Privacy | ☑ |
| 8 | Edit metadata | ☑ |
| 9 | Forensics: edit trail, compression, hidden data | ☑ |
| 10 | Forensics: thumbnail, fingerprints, error levels, noise | ☑ |
| 11 | Extract and special kinds | ☑ |
| 12 | jpegtran and pixel jobs | ☑ |
| 13 | The Crop and rotate tool | ☑ |
| 14 | Redact | ☑ |
| 15 | Adjust | ☑ |
| 16 | Export | ☐ |
| 17 | Offline, accessibility, mobile | ☐ |
| 18 | Copy, README, spec review | ☐ |

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

## Phase 3: Places, sun and the Location tool

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 3 of PHASES.md; phases 1–2 are done.

1. scripts/places.ts and `pnpm places`: download GeoNames' cities1000 and admin1CodesASCII and write
   public/places.bin and public/regions.json (SPEC.md section 12), under 5 MB. Commit them.
2. src/lib/places.ts (nearest place, the three wordings in SPEC.md 6.2, country by point in polygon
   from world-atlas's countries-50m, "At sea") and src/lib/geo.ts (compass words, DMS, the field of
   view cone). Many small tests: places near borders, the antimeridian, the poles, the sea.
3. src/lib/sun.ts over suncalc, with the UTC rules and wording in SPEC.md 6.2.
4. The Location tool (SPEC.md 6.2) in the settings column, dimmed without GPS: place, coordinates,
   direction, sun, Open elsewhere, and Also in the metadata. Info's location finding. The map is
   phase 4, so the stage stays on Picture for now.
5. Credit SunCalc, Natural Earth and GeoNames in About.

TDD for the pure modules and the tool view. By hand in Chrome and Firefox: camera.jpg and a real
phone photo show the right place and direction, and the sun wording is plausible for a photo whose
time you know. Report what you checked. Tick phase 3 and commit.
```

**You check:** open a phone photo taken somewhere you know and confirm the place, the direction
and the sun.

---

## Phase 4: The map

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 4 of PHASES.md; phases 1–3 are done.

1. The Map stage view (SPEC.md sections 5 and 6.2, DESIGN.md's Map) with Leaflet: the bundled world
   map at once, OpenStreetMap tiles in CORS mode when online, switched to only when a tile loads,
   src/hooks/useOnline.ts, the pin, the field of view cone and the sun line from phase 3's modules,
   attribution, and the tile caption. Opening Location switches the stage to Map; leaving it
   switches back to Picture.
2. Make sure the service worker never caches tiles.
3. Credit Leaflet and OpenStreetMap in About.

TDD for useOnline, the tile switch's rules and the view chip. By hand in Chrome and Firefox, with
the COEP headers on (pnpm preview): tiles load online; with the network off (devtools) the offline
map shows and the pin is in the right place; the cone points the right way on camera.jpg and on a
real phone photo taken facing a known direction; the sun line agrees with Location's sun wording.
Report what you checked. Tick phase 4 and commit.
```

**You check:** turn your network off and reload a photo with a location: the offline map should
appear with the pin in the right place.

---

## Phase 5: Content Credentials, Digital Source Type and the verdict

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 5 of PHASES.md; phases 1–4 are done.

1. scripts/trust.ts and `pnpm trust`: fetch the official C2PA trust list's anchors and the Content
   Authenticity Initiative's interim trust list into public/trust/ with the fetch date. Find their
   current URLs from the C2PA and CAI documentation, and record them in the script.
2. src/media/c2pa.ts over @contentauth/c2pa-web (wasm via ?url, a Context with trust checking and
   the bundled anchors), src/hooks/useProvenance.ts, and src/lib/ai/c2pa.ts turning the manifest
   store into findings. Test c2pa.ts against the manifest JSON the SDK gives for each C2PA sample
   (save those JSONs as fixtures; the SDK needs a browser).
3. src/lib/ai/source-type.ts (every Digital Source Type term) and src/lib/ai/verdict.ts with every
   row of SPEC.md 6.3's verdict table. The generator row's findings arrive in phase 6; test it now
   with a hand-made finding. Add iptc-ai.jpg to scripts/fixtures.ts.
4. The AI check tool (SPEC.md 6.3) with the verdict, Content Credentials (signer, time, claim
   generator, actions, ingredients with their thumbnails, the validation result and the trust list
   caption) and Digital Source Type. The tool waits with "Reading Content Credentials…". Info's AI
   finding.
5. Credit the C2PA SDK in About.

TDD throughout. By hand in Chrome and Firefox: each C2PA sample shows the right verdict and signer;
a picture made with ChatGPT or Gemini today (ask me for one) shows its Content Credentials; with the
network off the bundled trust list is still used. Report what you checked. Tick phase 5 and commit.
```

**You check:** generate one picture each with ChatGPT and Gemini and open them.

---

## Phase 6: Generators, stealth metadata and SynthID

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 6 of PHASES.md; phases 1–5 are done.

1. src/lib/ai/generators.ts, one parser per generator, and stealth.ts (SPEC.md 6.3's table). Add the
   AI fixtures to scripts/fixtures.ts, then check each parser against at least one real file from
   that generator (search for public samples, or ask me for some) and correct the table where they
   differ.
2. The AI check's generator section: the name, the prompt (expandable, Copy prompt), negative
   prompt, model and hash, seed, sampler, steps, CFG scale, size, LoRAs and the rest; ComfyUI's
   Save workflow and node count. The verdict's generator row now uses these findings.
3. Check on SynthID: the worker's png request (SPEC.md section 7), the PNG made when the tool opens,
   and a copy-and-open helper with the clipboard rules in CLAUDE.md and the fallbacks in SPEC.md
   6.3. Forensics' Find it online reuses the helper in phase 10.

TDD throughout. By hand in Chrome and Firefox: each generator fixture shows its prompt and
settings; Check on SynthID copies and opens the site in both browsers (check whether synthid.com
accepts a paste, and tell me; if it doesn't, make the caption say to drop the saved copy instead).
Report what you checked. Tick phase 6 and commit.
```

**You check:** open a picture from your own Stable Diffusion or ComfyUI setup if you have one, and
try Check on SynthID on the Gemini picture from phase 5.

---

## Phase 7: Jobs and exports, Privacy

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 7 of PHASES.md; phases 1–6 are done.

1. The Plan type (src/lib/plans/plan.ts), src/media/run.ts for metadata plans, the run and cancel
   messages (cancel restarts the worker and reopens the file), src/hooks/useJob.ts (SPEC.md
   section 7), the progress component, the Lossless/Re-encodes badge, and the exports strip with
   Download, Copy and Open in Loupe. src/lib/names.ts (SPEC.md section 8). beforeunload and the
   update banner's wording, as Moviola's.
2. src/lib/privacy.ts and src/lib/plans/privacy.ts, and the Privacy tool (SPEC.md 6.4): findings,
   quick picks, what's always kept, the read-back after the job. Privacy waits for Content
   Credentials as the AI check does. Info's privacy finding.
3. Node tests end to end: for every fixture ExifTool can write, run Privacy's Everything and
   Location only, then read the result back: the right tags gone, Orientation and the ICC profile
   kept, and the image data byte-identical to the source's (compare JPEG scan data, PNG IDAT, and so
   on per format). Put the image data comparison in a test helper phase 8 reuses.

TDD throughout. By hand in Chrome and Firefox: clean a real phone photo and check it with
`exiftool`; Download, Copy and Open in Loupe from the exports strip; cancel a job. Check the leave
prompt in Playwright. Report what you checked. Tick phase 7 and commit.
```

**You check:** clean one of your own photos with Privacy's Everything, then run
`exiftool -a -G1 -s` on the result and read what's left.

---

## Phase 8: Edit metadata

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 8 of PHASES.md; phases 1–7 are done.

1. src/lib/plans/edit-metadata.ts and the Edit metadata tool (SPEC.md 6.7), with MWG writing, Set
   location on phase 4's map, and the Content Credentials warning.
2. Node tests end to end: for every fixture ExifTool can write, write each field and read it back,
   with the image data byte-identical to the source's (phase 7's helper).

TDD throughout. By hand in Chrome and Firefox: edit a real photo's date and caption; set a location
on the map and see it in Location after Open in Loupe; the warning shows on a C2PA sample. Report
what you checked. Tick phase 8 and commit.
```

**You check:** change the date and caption of one of your own photos, then check the result with
`exiftool` and in your usual photo app.

---

## Phase 9: Forensics: edit trail, compression, hidden data

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 9 of PHASES.md; phases 1–8 are done.

1. src/lib/forensics/history.ts (edit trail and crs: settings in plain words), quant.ts (quality
   estimate, IJG and Photoshop tables, room for known devices) and trailer.ts (known and unknown
   trailers, what unknown ones look like). Add photoshop.jpg to scripts/fixtures.ts. Exhaustive
   tests: quant.ts against JPEGs made at known qualities by MozJPEG; trailer.ts against
   trailer-zip.jpg, ultra-hdr.jpg and the maker-note samples.
2. The worker's extract request (SPEC.md section 7), used here for hidden data; Extract uses it for
   everything else in phase 11.
   Privacy's Hidden data finding (SPEC.md 6.4), left out of phase 7 for want of `ImageInfo.trailer`:
   list an unknown trailer and remove it, checked in Node against trailer-zip.jpg with phase 7's
   image data helper.
3. The Forensics tool (SPEC.md 6.5) with Edit trail, Compression and Hidden data, its "Save it"
   included. Info's edit trail finding. Phase 10 adds the other sections.

TDD throughout. By hand in Chrome and Firefox: photoshop.jpg's history reads right; the ZIP comes
out of trailer-zip.jpg and opens; a real phone JPEG's quality and tables are plausible. Report what
you checked. Tick phase 9 and commit.
```

**You check:** open a JPEG you've edited in Lightroom or Photoshop, if you have one, and read its
edit trail.

---

## Phase 10: Forensics: thumbnail, fingerprints, error levels, noise

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 10 of PHASES.md; phases 1–9 are done.

1. src/lib/forensics/phash.ts, ela.ts and noise.ts on plain pixels. Exhaustive tests: phash.ts
   distances for the same picture resized, recompressed and cropped; ela.ts and noise.ts on known
   pixels.
2. The worker's layer and fingerprint requests (SPEC.md section 7), and the Error levels and Noise
   stage views drawn over the picture at the same zoom and pan.
3. The rest of the Forensics tool (SPEC.md 6.5): Embedded thumbnail, Error levels and Noise with
   their sliders, Fingerprints with Compare with another image, and Find it online with phase 6's
   copy-and-open helper.

TDD throughout. By hand in Chrome and Firefox: cropped-thumb.jpg shows the mismatch; error levels on
a JPEG you edited and re-saved show the edit; the sliders redraw promptly on a 12 MP photo; Compare
with a resized copy says "Likely the same picture"; each Find it online button copies and opens its
site. Report what you checked. Tick phase 10 and commit.
```

**You check:** send yourself a photo through WhatsApp (or another chat app) and open both copies:
compare their compression findings and fingerprints. If the chat app's tables aren't recognised,
give Claude both files in a later session to add them to quant.ts.

---

## Phase 11: Extract and special kinds

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 11 of PHASES.md; phases 1–10 are done.

1. The Extract tool (SPEC.md 6.6) for every embedded kind, over phase 9's extract request, with Save,
   Open in Loupe for pictures, and the output names.
2. The special kinds: Motion Photo, depth map (the Depth view), Ultra HDR gain map, 360° panorama
   (the 360° view, one WebGL shader), with motion-photo.jpg, depth.jpg and pano-360.jpg in
   scripts/fixtures.ts.
3. Node tests: every item Extract saves is byte-identical to its bytes in the source.
4. Privacy's Location finding for a Motion Photo video's own location (SPEC.md 6.4), left out of
   phase 7: ExifTool reads it only with `-ee`. Say what removing it does to the video.

TDD throughout. By hand in Chrome and Firefox: every item of every fixture saves, and the pictures
open in Loupe; a real Motion Photo's video plays (ask me for one from a Pixel or Samsung); the Depth
view lines up with the picture; the 360° view turns with the mouse and the keyboard. Report what
you checked. Tick phase 11 and commit.
```

---

## Phase 12: jpegtran and pixel jobs

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 12 of PHASES.md; phases 1–11 are done.

The engine for Crop and rotate; its stage UI is phase 13.

1. tools/jpegtran/: build.sh building libjpeg-turbo's jpegtran (the latest release) to WebAssembly
   with Emscripten in Docker, exposing one function: bytes in, transform (rotate, flip, transpose,
   transverse, crop, perfect, trim, copy all) in, bytes out. Commit the output to src/vendor/jpegtran/
   and record the version and flags in tools/jpegtran/README.md. src/media/jpegtran.ts over it.
   Keep the build's output out of the context: write it to a log file and read only the errors.
2. src/lib/mcu.ts (the block grid in the source's orientation, snapping), src/lib/pixels.ts (exact
   turns, flips and crops; straightening with bicubic resampling and the largest inner rectangle),
   and src/lib/plans/crop-rotate.ts with every lossless rule in SPEC.md 6.8 and 6.0.
3. run.ts for pixel plans: decode, transform, encode (jSquash, from Bytesize's engine), then
   ExifTool copying metadata under SPEC.md 6.0, dropping what it lists.
4. Node tests end to end: every turn and flip of grid-444.jpg and grid-420.jpg is lossless (decode
   the result and compare with turning the decoded source); orient-6.jpg needs -trim and loses the
   promised pixels only; a grid-snapped crop is lossless and has the promised size; PNG turns are
   pixel-exact; Orientation is 1 and thumbnails are gone in every result.
5. Credit libjpeg-turbo in About, with its notices.

TDD throughout. In Chrome and Firefox, with the COEP headers on (pnpm preview), check that
jpegtran's wasm loads in the worker and a turn through the worker matches the Node result. Report
what you checked. Tick phase 12 and commit.
```

---

## Phase 13: The Crop and rotate tool

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 13 of PHASES.md; phases 1–12 are done.

1. The crop frame and handles on the stage (DESIGN.md), keyboard included, the grid chip, and
   `[` `]` and `\`.
2. The Crop and rotate tool view (SPEC.md 6.8) over phase 12's planner: turns, flips, straighten,
   aspect ratios, snapping, and the badge and its caption following the frame as it moves.

TDD for the tool view and the frame's keyboard. By hand in Chrome and Firefox: crop and turn a real
phone JPEG losslessly, open the result in Loupe and check the badge's promise held (Forensics'
compression section should show the original's tables); straighten a photo; crop a PNG. Report what
you checked. Tick phase 13 and commit.
```

**You check:** rotate a sideways photo of your own and open the result in your usual photo viewer
and in a browser: both should show it upright.

---

## Phase 14: Redact

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 14 of PHASES.md; phases 1–13 are done.

1. src/lib/redact.ts (black, blur and pixelate on plain pixels) and src/lib/plans/redact.ts with its
   metadata rules.
2. The redaction boxes on the stage (DESIGN.md), keyboard included, and the Redact tool (SPEC.md
   6.9).
3. Node tests end to end: a redacted PNG differs from its source only inside the boxes; a redacted
   JPEG has no thumbnail, no Content Credentials and, with the switch on, no identifying tags.

TDD throughout. By hand in Chrome and Firefox: redact text in a screenshot with each fill, and check
the result's thumbnail and metadata with `exiftool`. Report what you checked. Tick phase 14 and
commit.
```

---

## Phase 15: Adjust

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 15 of PHASES.md; phases 1–14 are done.

1. src/lib/adjust.ts (exposure in linear light, contrast, highlights, shadows, saturation, warmth),
   tested on known pixels, and src/lib/plans/adjust.ts.
2. The preview on a stage-sized copy, redrawn at most once a frame, and the Adjust tool (SPEC.md
   6.10) with reset and `\`.
3. Node tests end to end: an adjusted file's pixels match adjust.ts applied to the decoded source,
   and its metadata follows SPEC.md 6.0.

TDD throughout. By hand in Chrome and Firefox: adjust a real photo and compare preview and result
side by side; check the sliders' feel at the extremes and that dragging stays smooth on a 12 MP
photo. Report what you checked. Tick phase 15 and commit.
```

---

## Phase 16: Export

```
Read CLAUDE.md, SPEC.md, DESIGN.md. This is phase 16 of PHASES.md; phases 1–15 are done.

1. Bring over Bytesize's engine pieces Loupe doesn't have yet: the encoders and their settings,
   resize.ts, target.ts (fitQuality), the AVIF and JPEG XL threads, and the Compare component. Keep
   their tests.
2. src/lib/plans/export.ts and the Export tool (SPEC.md 6.11): formats, quality, lossless switch,
   resize, target size, Keep metadata, the badge rule, the Compare stage view, the size change, and
   remembered settings.
3. Node tests: the Lossless badge's cases; a target size lands under the target or says why not;
   Keep metadata off leaves only the colour profile.
4. Credit MozJPEG, libwebp, libavif, libjxl and oxipng in About.

TDD throughout. By hand in Chrome and Firefox: export a real photo to each format with and without
a resize and a target size; compare in each mode; check the threaded encoders run with the headers
on. Report sizes and timings and what you checked. Tick phase 16 and commit.
```

---

## Phase 17: Offline, accessibility, mobile

```
Read CLAUDE.md, SPEC.md, PRODUCT.md, DESIGN.md. This is phase 17 of PHASES.md; phases 1–16 are done.

1. PWA: precache everything (ExifTool, the C2PA SDK, the codecs, jpegtran, the places and map data,
   the trust lists) with maximumFileSizeToCacheInBytes set; confirm the whole app works offline
   after one visit, map included (the bundled one); the update banner; file_handlers launching
   straight into the file. Record the first visit's download size in About and CLAUDE.md.
2. Accessibility pass against PRODUCT.md: keyboard through every tool, the stage, the magnifier,
   the crop frame, redaction boxes, the map and the 360° view; visible focus in both themes; labels
   and live regions for findings, progress and errors; reduced motion.
3. Mobile pass at 375 px: layout from DESIGN.md, the primary action fixed at the bottom, tool chips,
   pinch zoom on the stage, the crop frame and boxes by touch.

Test what can be tested; check the rest by hand in Chrome, Firefox and, through the deployed site,
Safari on an iPhone if one is available (HEIC shows natively there). Report what you checked. Tick
phase 17 and commit.
```

**You check:** install the app from the deployed site, open a photo with it from the file manager,
and go through every tool once more, offline.

---

## Phase 18: Copy, README, spec review

```
Read CLAUDE.md, SPEC.md, PRODUCT.md, DESIGN.md. This is phase 18 of PHASES.md; phases 1–17 are done.

1. Copy pass against SPEC.md sections 10 and 11: every finding says what it rests on, every
   message is a full sentence naming the real format or number, British spelling.
2. README.md in the style of Moviola's: what it does tool by tool, the lossless promise, how sure
   each AI finding is, what leaves the device, browser notes, licence and credits, development and
   deploying.
3. Re-read SPEC.md against the app and fix any drift, in the code or the spec.

Test what changes behaviour; check the copy by hand in Chrome and Firefox. Report what you checked.
Tick phase 18 and commit.
```

**You check:** read the README as someone who's never seen Loupe.
