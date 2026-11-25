# Loupe: specification

What the app does, tool by tool. CLAUDE.md says how it's built; PRODUCT.md and DESIGN.md say how it
looks and speaks. When this file and the code disagree, fix one of them in the same change.

## 1. Scope

**In:** one image open at a time; eleven tools (section 6) in two groups, Inspect and Edit; results
downloaded, copied or opened again in Loupe; installable and offline.

**Out (for now):** batches (Bytesize does those); layers, painting, text, filters beyond Adjust;
showing TIFF pictures (their metadata is shown); decoding camera raw (their embedded preview is
shown); writing HEIC; signing new Content Credentials; any server work. Video files are Moviola's.

## 2. Platform

- Static site on Cloudflare Workers at `loupe.hyphensam.com`, set up exactly like Moviola
  (`wrangler.jsonc`, `public/_headers`, Workers Builds on push to `main`).
- Targets current Chrome, Edge, Firefox and Safari on desktop, and Chrome and Safari on mobile.
  Features are switched on by capability (section 9), never by browser name.
- Needs WebAssembly and Web Workers. Without them the empty stage says the browser is too old and
  nothing else is shown.

## 3. Opening a file

- Drag and drop onto the window, pasting an image or a file anywhere on the page, the "Choose file"
  button, the installed app's file handler (`launchQueue`, manifest `file_handlers`), or "Open in
  Loupe" on a result or an embedded picture.
- Accepted: JPEG, PNG, WebP, AVIF, HEIC/HEIF, JPEG XL, GIF, BMP, TIFF, and camera raw (DNG, CR2,
  CR3, CRW, NEF, NRW, ARW, SR2, RAF, ORF, RW2, PEF, SRW, 3FR, IIQ, X3F). The file input's `accept`
  lists these extensions and MIME types (one table in `src/lib/file-types.ts`, shared with the
  manifest); dropping anything else is still tried, because extensions lie.
- The format is sniffed from the bytes (`src/lib/formats.ts`, extending Bytesize's `sniff`); raw
  formats are recognised by ExifTool's `FileType`. If neither recognises an image: "Loupe can't open
  this file. It reads JPEG, PNG, WebP, AVIF, HEIC, JPEG XL, GIF, BMP, TIFF and camera raw files."
  The previous file, if any, stays open.
- Opening sends the `File` to the worker, which keeps it (and its decoded pixels) until the next
  open. Two answers come back separately so the picture shows first: the picture for the stage
  (section 5), then `ImageInfo` (section 4). Content Credentials are read in parallel by the C2PA
  SDK's own worker (section 6.3). The file card appears at once; findings that are still coming
  say "Reading metadata…".
- Opening a file while a job runs asks first: "Cancel the running job and open the new file?" The
  last thing asked for wins between two opens.
- Exports from the previous file stay in the exports strip until removed.
- A picture the browser runs out of memory decoding says: "This picture is too large for this
  browser to show. Its metadata is still listed." Inspect tools that need only metadata still work.

## 4. ImageInfo

The plain data the findings, planners and UI work from (`src/lib/info.ts`). Built in the worker
from ExifTool's JSON (`src/lib/tags.ts` turns it into the fields below; `src/media/exiftool.ts` is
the only place that runs ExifTool) and Loupe's own readers (JPEG tables, trailers, PNG chunks,
generator metadata, stealth metadata in pixels). Sketch:

```ts
type ImageInfo = {
  name: string
  size: number // bytes
  lastModified: number // the File's, ms
  format: Format // from the bytes: 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'jxl' | 'gif' | 'bmp' | 'tiff' | 'raw'
  formatName: string // ExifTool's FileType, for display: 'JPEG', 'HEIC', 'NEF'…
  extension: { given: string; expected: string } | null // only when the name's extension doesn't fit the bytes
  width: number; height: number // as stored
  orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 // EXIF, or HEIF's irot/imir as the equivalent
  displayWidth: number; displayHeight: number // upright
  bitDepth: number | null // per channel
  alpha: boolean
  colour: {
    profile: string | null // the ICC profile's description ('Display P3')
    space: 'srgb' | 'display-p3' | 'adobe-rgb' | 'prophoto' | 'rec2020' | 'grey' | 'cmyk' | 'other' | null
    hdr: 'gain-map' | 'pq' | 'hlg' | null
  }
  animation: { frames: number; duration: number; loops: number | 'forever' } | null
  tags: Tag[] // everything ExifTool reports, for the All tags sheet
  camera: Camera | null
  dates: Dates
  gps: Gps | null
  place: Place | null // nearest named place, worked out offline (section 6.2)
  kinds: Kind[]
  embedded: Embedded[]
  generators: GeneratorFinding[] // from metadata and stealth pixels (section 6.3)
  sourceType: string | null // IPTC Digital Source Type in XMP, as stated (a URI or a bare term)
  edits: EditTrail // software, XMP history, develop settings (section 6.5)
  jpeg: JpegInfo | null
  trailer: Trailer | null // data after the end of the picture that isn't a known trailer
  unknownChunks: string[] // PNG chunk types outside the spec and known extensions
}
type Tag = { family: string; group: string; name: string; label: string; value: string } // family 0 and 1 groups; value as ExifTool prints it
type Camera = {
  make: string | null; model: string | null; lens: string | null
  exposure: { time: string | null; aperture: number | null; iso: number | null; bias: number | null }
  focalLength: number | null; focal35: number | null // mm
  flash: string | null
  bodySerial: string | null; lensSerial: string | null; internalSerial: string | null
  owner: string | null // OwnerName, CameraOwnerName
  shutterCount: number | null // from maker notes (ShutterCount, ImageCount where it means shutter actuations)
  software: string | null
}
type LocalTime = { local: string; offset: string | null } // '2025-03-12T14:32:05', '+13:00'
type Dates = { taken: LocalTime | null; digitised: LocalTime | null; modified: LocalTime | null; gpsUtc: string | null }
type Gps = {
  lat: number; lon: number
  altitude: number | null // metres above sea level
  direction: { degrees: number; ref: 'true' | 'magnetic' } | null
  speed: number | null // km/h
  accuracy: number | null // metres (GPSHPositioningError)
}
type Kind = 'screenshot' | 'motion-photo' | 'live-photo' | 'ultra-hdr' | 'portrait-depth' | 'panorama-360' | 'burst' | 'animated' | 'raw'
type Embedded = {
  id: string
  kind: 'thumbnail' | 'preview' | 'mpf-image' | 'motion-video' | 'depth-map' | 'gain-map' | 'icc-profile'
    | 'xmp' | 'comfyui-workflow' | 'generation-parameters' | 'c2pa-manifest' | 'trailer'
  label: string // 'EXIF thumbnail, 160 × 120'
  size: number | null
  extension: string // what it's saved as
  isImage: boolean // can be opened in Loupe
}
type JpegInfo = {
  quality: number | null // estimated from the luminance table, 1–100
  tables: 'ijg' | 'photoshop' | 'known' | 'custom'
  tablesName: string | null // 'libjpeg', 'Photoshop "Save As" 10', or a known device's name
  subsampling: '4:4:4' | '4:2:2' | '4:2:0' | '4:4:0' | '4:1:1' | 'grey' | 'other'
  progressive: boolean
  mcu: { width: number; height: number } // 8 or 16
}
type Trailer = { offset: number; length: number; looksLike: 'zip' | 'rar' | '7z' | 'pdf' | 'jpeg' | 'png' | 'text' | 'unknown' }
```

ExifTool runs once per file with `-json -l -G0:1 -a -u --System:all`: every tag, unknown ones too,
keyed by family 0 and 1 groups, each with its description, printed value and number (`-l`), so no
`#`-suffixed tags are needed. The System group (ExifTool's in-memory file system) is left out. Without
`-b`, binary values are listed by size only; the few Loupe needs (a raw file's preview, say) are read
by name with `-json -b -G0:1 -TAG` and come back as `base64:` strings. There's no `-struct`, so the
All tags sheet gets flat tags. Reading must finish in under two seconds for a 12 MP phone JPEG or HEIC
on a normal machine, after ExifTool's first start; CLAUDE.md records the measurements.

## 5. The stage

### Showing the picture
- Where the browser can decode the format itself (checked once at start-up, section 9), the stage
  shows an `<img>` of an object URL of the `File`: colour-managed, HDR gain maps shown on HDR
  displays, animations playing, EXIF orientation applied by the browser.
- Otherwise (HEIC outside Safari, JPEG XL where unsupported, raw files' previews, TIFF never), the
  worker decodes it (section 7) and the stage draws the upright pixels on a canvas, tagged
  `colorSpace: 'display-p3'` when the source is Display P3, sRGB otherwise. On canvases the browser
  caps (iOS: about 16.7 MP), the drawn copy is scaled to fit and a chip says "Preview scaled to fit
  this browser". Raw files show their largest embedded preview with the chip "Embedded preview".
  TIFF shows the empty frame with "Loupe can't show TIFF pictures yet. Its metadata is listed."
- Animated images play on the stage; tools that edit take the first frame and say so.

### Zoom and pan
As Bytesize's `useZoomPan`: Fit (default), 100%, zoom in and out about the pointer with the wheel or
pinch, drag to pan. Keyboard when the stage has focus: `0` fits, `1` is 100%, `+` and `-` zoom, arrow
keys pan when zoomed. Past 100% pixels are drawn sharp (`image-rendering: pixelated`).

### Stage views
The toolbar's view chips switch what the stage shows. Picture is always there; the others appear
when they apply:
- **Map**: the Location tool's map (section 6.2). Opening Location switches to it; leaving the tool
  switches back to Picture.
- **Error levels** and **Noise**: the Forensics layers (section 6.5), greyscale, drawn over the
  picture at the same zoom and pan. Opening a layer's section in Forensics switches to it.
- **Depth**: the portrait depth map, greyscale, when the file has one.
- **360°**: an interactive view of an equirectangular panorama (`GPano:ProjectionType` is
  `equirectangular`), drawn with one WebGL shader: drag or arrow keys to look around, wheel or `+`/`-`
  to change the field of view (30°–100°). Without WebGL 2 the chip is absent.
- **Compare**: Export's before and after (section 6.11).

### Background, magnifier and readout
- Background menu: Dark (default), Light, Checkerboard. Remembered (`localStorage`).
- Magnifier (DESIGN.md): toggled with `L` or the toolbar button, 8× by default (wheel over it
  changes 2×–32×), remembered.
- While the pointer is over the picture, the status line shows the pixel position in the upright
  picture's coordinates and its stored colour: `x 1203, y 884 · #A3B2C1 · 163 178 193` (plus alpha
  when the picture has it). Values come from the decoded pixels, which the worker hands to the page
  once, downscaled no further than the stage needs; the readout at zooms past that asks the worker
  for the exact pixel.

### Keyboard summary
`0` fit, `1` 100%, `+` `-` zoom, arrows pan (or move the magnifier, the selected box or handle),
`L` magnifier, `\` hold for before (Crop and rotate, Redact, Adjust), `Esc` closes the sheet or
deselects. Shortcuts never fire while focus is in a text field.

## 6. Tools

Every tool has a view in the settings column. Edit tools also have a planner in `src/lib/plans/`,
a primary action with a verb ("Remove", "Save changes", "Crop", "Redact", "Save", "Export") and a
Lossless or Re-encodes badge, and an output name (section 8). Planners return problems instead of a
plan when the job can't run; problems are shown above the action, which is disabled.

The default tool on opening a file is **Info**. A tool that can't apply is dimmed with a reason in
its tooltip: Location without GPS ("This picture has no location."), Extract with nothing embedded
("Nothing is embedded in this file."), and the pixel edit tools for TIFF and raw files ("Loupe can't
edit TIFF or raw pictures. Extract the preview to edit that instead.").

### 6.0 Rules for every edit

- **Lossless** means every pixel outside the edit survives exactly and the metadata is kept or
  changed only as the tool says. Metadata-only jobs copy the picture's bytes as they are; tests
  check that the image data in the output is byte-identical to the source's.
- A pixel edit (Crop and rotate, Redact, Adjust, Export) writes the result's pixels upright, sets
  Orientation to 1, updates the stored dimensions, and drops what would no longer match the
  picture. The badge's caption names each that was present:
  - embedded thumbnails and previews ("The embedded thumbnail is removed; it would show the picture
    before this edit.");
  - Content Credentials ("Content Credentials are removed; they'd no longer match the picture.");
  - an Ultra HDR gain map ("The HDR gain map is removed, so the result is standard range.");
  - a Motion Photo's video ("The Motion Photo's video is removed.").
- Everything else is copied from the source with ExifTool (`-tagsFromFile`), the colour profile
  included, unless the tool removes it.
- Output format for pixel edits: the source's format, written losslessly when the source was
  lossless (PNG, lossless WebP, lossless JPEG XL). GIF and BMP become PNG; HEIC/HEIF becomes JPEG
  ("Browsers can't write HEIC, so the result is a JPEG."). Lossy sources are re-encoded: JPEG at the
  source's estimated quality (90 if unknown, never above 95), WebP at 90, AVIF at 70, JPEG XL at 90. An
  "Output" disclosure under the settings lets the user change format and quality for this edit; the
  choice isn't remembered.
- Results go through memory (they're small) and join the exports strip (section 7).

### 6.1 Info

Read-only, no primary action. From top to bottom:

- **Summary**: up to five findings (DESIGN.md), each linking to its tool:
  - "Taken on 12 March 2025 at 14:32" with the time zone when known ("UTC+13:00"), or "No date
    taken recorded." with the file's own date in the caption.
  - "Location recorded: Arrowtown, Otago, New Zealand" (Location), or "No location recorded."
  - The AI check's verdict line (6.3).
  - "7 things in this file could identify you." (Privacy), or "Nothing identifying found."
  - "Edited in Adobe Lightroom Classic" (Forensics), when the edit trail names software.
- **Picture**: format (and "Its extension says PNG, but it's a JPEG." when they disagree), dimensions
  ("4032 × 3024, 12.2 MP, 4:3"), upright size when Orientation turns it, bit depth, transparency,
  colour profile ("Display P3, wide gamut"), HDR ("Ultra HDR: has a gain map"), animation ("24 frames,
  2.4 s, loops forever"), file size.
- **Kinds**: a sentence per kind: "A Motion Photo: a 2.1 s video is stored inside." (Extract), "Part of
  a Live Photo. Its video is a separate .MOV file, linked by an ID.", "Portrait mode: has a depth map."
  (Depth view), "A 360° panorama." (360° view), "Part of a burst.", "A screenshot.", "A camera raw
  file: Loupe shows its embedded preview.".
- **Camera**: make and model, lens, exposure in one line ("1/250 s · f/2.8 · ISO 400 · 35 mm (52 mm
  equivalent)"), flash, shutter count ("Shutter count: 18,402, from the camera's maker notes"),
  serial numbers (marked "identifies this camera"), owner name, software.
- **Dates**: taken, digitised, modified, GPS time (UTC) and the file's own date, each with its zone
  when known. When modified is later than taken: "Modified 3 days after it was taken."
- **Histogram**: red, green, blue and luminance over the decoded pixels, 288 × 80 px, with the share
  of clipped shadows and highlights in the caption.
- "All tags" opens the sheet (DESIGN.md): every tag ExifTool reported, grouped, searchable. "Copy as
  text" copies `Group: Tag: value` lines; "Copy as JSON" copies ExifTool's JSON as it came.
- A secondary button "Copy summary" copies the sections above as plain text, one `Key: value` per
  line, for a report.

Plain words for tag values (exposure programs, metering, flash, white balance, scene types), colour
spaces and kinds live in one table in `src/lib/words.ts`.

### 6.2 Location

Read-only, no primary action (adding or changing a location is Edit metadata's). Opening it
switches the stage to Map.

- **Place**: worked out offline from GeoNames' places of 1,000 people or more, their first-level
  regions, and country names from `Intl.DisplayNames` (`src/lib/places.ts`; data in section 12's
  `public/places.bin`):
  - within 3 km of a place: "Arrowtown, Otago, New Zealand" (a region or country that repeats the
    name is left out: "Singapore");
  - within 50 km: "12 km north-east of Arrowtown, Otago, New Zealand" (eight compass words, from the
    place to the point);
  - further: the country the point falls in, from the bundled country outlines ("In New Zealand, far
    from any town"), or "At sea".
  - When the point falls in a country's outline, only that country's places count, so a town over a
    border isn't named. An outline can hold several GeoNames country codes (Natural Earth's France
    holds French Guiana and Réunion); "far from any town" names the one its nearest place has.
  - If the places data can't be loaded: "Loupe couldn’t load its places data, so the place isn’t
    named." The next picture tries again.
- **Coordinates**: decimal (6 places) and degrees-minutes-seconds, each with a copy button; altitude
  ("312 m above sea level"); accuracy ("Within 5 m"); speed when non-zero.
- **Direction**: "Facing north-west (312°, true north)". With a 35 mm-equivalent focal length the map
  draws the field of view as a cone (horizontal angle `2·atan(36 / (2·f35))` for a landscape
  picture, `24` for portrait), 300 m long at street zoom and scaled with the map.
- **Sun**: with the location and a UTC time (GPS time, or the time taken with its offset), SunCalc
  gives the sun's position: "The sun was 23° above the horizon, to the north-west (305°).", "The sun
  was on the horizon, to the west (271°).", "The sun was 3° below the horizon: it was twilight." (down
  to 6°, civil twilight) or "The sun was 12° below the horizon: it was night." A line on the map points
  towards the sun. Without a UTC time: "The time zone isn't recorded, so the sun's position can't be
  worked out.", or with no time taken at all, "No time taken is recorded, so the sun’s position can’t
  be worked out." The caption says which time it used ("Worked out for the GPS time, 12 March 2025 at
  01:32 (UTC).").
- **Open elsewhere**: links to OpenStreetMap and Google Maps at the point, opening in a new tab; the
  caption says the site opened sees the location.
- **The map** (DESIGN.md), Leaflet:
  - The bundled world map (Natural Earth countries at 1:50m, from `world-atlas`) is drawn at once,
    with the pin, zoom 1–7.
  - If `navigator.onLine`, OpenStreetMap's standard tiles are requested too; when the first tile
    loads, the map switches to them (zoom up to 19) and the offline outlines are hidden. If no tile
    loads within 5 s or tiles fail, the offline map stays and nothing is said. Going online later
    (`online` event) tries again; going offline keeps whatever is showing.
  - With tiles showing, the caption under the place says: "Map tiles come from OpenStreetMap, which
    sees the area shown." The attribution "© OpenStreetMap contributors" stays on the map.
  - Tiles are never precached or kept by the service worker (OpenStreetMap's tile policy).
- Other location fields in the metadata (IPTC/XMP city, region, country, location names) are listed
  under "Also in the metadata", since they can disagree with the GPS.

### 6.3 AI check

Read-only, no primary action. What the file says about how the picture was made, and a way to check
for an invisible watermark.

**Sources, strongest first** (`src/lib/ai/`):

1. **Content Credentials (C2PA)**, read and validated by `@contentauth/c2pa-web` against the bundled
   C2PA trust list (section 12) with trust checking on. From the active manifest: who signed it
   (certificate subject and issuer), when, the claim generator ("ChatGPT", "Adobe Firefly"), the
   actions in plain words ("Created", "Edited", "Opened", "Placed", with their
   `digitalSourceType`), ingredients (the pictures it was made from, with their thumbnails when the
   manifest carries them), and the validation result. Offline, nothing is fetched: the trust list
   is bundled and revocation isn't checked; the caption says "Checked against the trust list
   bundled on <date>."
2. **IPTC Digital Source Type** in XMP (`Iptc4xmpExt:DigitalSourceType`), in plain words: "trained
   algorithmic media" is "Made with generative AI", "composite with trained algorithmic media" is
   "Edited with generative AI", "algorithmic media" is "Made by software without training data",
   "digital capture" is "Captured by a camera", and so on for the vocabulary
   (`src/lib/ai/source-type.ts`, every term tested).
3. **Generator metadata**, each parser a pure function over the tags, PNG text chunks or pixels,
   each with at least one fixture:

   | Generator | Marker |
   |---|---|
   | AUTOMATIC1111, Forge, SD.Next | a `parameters` PNG text chunk, or EXIF UserComment in JPEG/WebP, in the `<prompt>\nNegative prompt: …\nSteps: …, Sampler: …` form; the `Version:` field names the front end (`v1.10.1` A1111, `f2.0.1v1.10.1-…` or `neo` Forge; older A1111 writes none), `App: SD.Next` SD.Next; LoRAs are `<lora:name:weight>` in the prompt |
   | ComfyUI | `prompt` (API graph) and `workflow` (the editor's) PNG text chunks, JSON; in WebP, EXIF Model holds `prompt:{…}` and Make `workflow:{…}`, in lower case (ComfyUI's `_create_webp_metadata`); A1111-style `parameters` beside them (saver nodes) are read for the settings. Real graphs use subgraph node ids (`60:19`) and may run several samplers |
   | Tensor.Art | a `generation_data` PNG text chunk (JSON, the model as the site names it; `seed` "-1" when random) beside the ComfyUI `prompt` graph it ran, which holds the seed used |
   | NovelAI | PNG text chunks `Software` "NovelAI", `Source` (model and an 8-digit hash, "NovelAI Diffusion V5 0ADF9AB7"), `Description` (the prompt), `Comment` (JSON: `uc` the negative prompt, `scale`, `v4_prompt` with character captions, `request_type`), `Generation_time`, `Title` |
   | Stealth metadata (NovelAI, the A1111 stealth extension, SwarmUI's `StealthMetadata`) | the alpha channel's (or RGB's) least significant bits, read in column order, most significant bit first: `stealth_pnginfo`, `stealth_pngcomp` (gzip), `stealth_rgbinfo` or `stealth_rgbcomp`, a 32-bit length in bits, then the text. NovelAI's is JSON of its text chunks (`"Generation time"` with a space); A1111's the `parameters` text. PNG only |
   | InvokeAI | an `invokeai_metadata` PNG text chunk (JSON, beside `invokeai_graph`); 2.x `sd-metadata` (JSON); earlier `Dream` (a command line) |
   | SwarmUI | JSON with `sui_image_params` (and `sui_models` with hashes, `sui_extra_data`) in an iTXt `parameters` chunk, or EXIF UserComment in JPEG |
   | Fooocus | `parameters` (JSON, or A1111's text) beside a separate `fooocus_scheme` text chunk ("fooocus" or "a1111"); in JPEG/WebP, EXIF UserComment with `Software` "Fooocus v…" |
   | Draw Things | XMP `exif:UserComment` JSON (`c`, `uc`, `scale`, `size`…) and `xmp:CreatorTool` naming Draw Things. Not yet checked against a real file: the keys are SD Prompt Reader's |
   | Midjourney | a PNG `Description` text chunk with the prompt, its `--` parameters and `Job ID: <uuid>`; `Author` the account; XMP `DigImageGUID` (the Job ID) and the Digital Source Type |
   | Others | `Software`/`CreatorTool` naming a known generator (`src/lib/ai/generators.ts` keeps the list) |

   Each marker was checked against a real file in phase 6 (Draw Things excepted, and ComfyUI's WebP
   against its source code): sd-parsers' samples for A1111, ComfyUI, Fooocus, InvokeAI and NovelAI
   (in `fixtures/sd-parsers/`), SwarmUI's documented example, and pictures from ComfyUI, NovelAI,
   Midjourney and Tensor.Art. Where a real file disagrees with this table, the file wins and the table
   is corrected. The first parser that recognises the file wins; stealth metadata adds where it was
   found to the same generator, or a generator of its own.

For each generator found: its name, the prompt (expandable, copy button), negative prompt, model
(and hash), seed, sampler, steps, CFG scale, size, LoRAs, and the rest as a key-value list, then where
it was found ("Found in the PNG text chunk “parameters”. Stated in the file’s metadata; anyone can add
or remove it.", or for stealth metadata "…, which removing metadata doesn’t clear."). ComfyUI (and
Tensor.Art) adds "Save workflow" (the JSON, as Extract offers it, `<stem> workflow.json`; the API graph
when there's no workflow) and a count of its nodes, counting those inside subgraphs. A graph's settings
are its first pass (full denoise, then most steps); other samplers are listed as "Another pass".

**Verdict** (`src/lib/ai/verdict.ts`), one finding at the top, from the strongest source present:

| Found | Verdict | Rests on |
|---|---|---|
| Valid, trusted C2PA saying generative AI made it | Made with AI | "Signed by OpenAI and verified." |
| Valid, trusted C2PA saying AI edited it | Edited with AI | as above |
| Valid, trusted C2PA from a camera's capture | Signed by the camera | "Signed by Leica and verified." |
| Valid C2PA, signer not on the trust list | the claim, as above | "Signed by a signer Loupe doesn't recognise." |
| C2PA that doesn't validate | Content Credentials don't verify | "The file was changed after signing, or the signature is broken. What they claim is listed below." |
| Digital Source Type or generator metadata only | Says it was made with AI (with the generator's name when known) | "Stated in the file's metadata; anyone can add or remove this." |
| Nothing | No AI markers found | "Most sites remove metadata, so this doesn't mean it wasn't made with AI." |

Patterns in the pixels or the size are never used.

**Check for a watermark**: a secondary button "Check on SynthID" and its caption: "Opens synthid.com
in a new tab with the picture copied, ready to paste. Google sees the picture there; it asks you to
sign in and limits checks a day." When the tool opens, the worker makes a PNG of the upright picture
(section 7, `png`) so the click can copy it at once: the click writes a `ClipboardItem` holding the
PNG, then opens `https://synthid.com/` with `noopener`. If the copy fails, the tab still opens and
the caption becomes "Copying didn't work here. Save a PNG copy and upload it there instead." with a
"Save a PNG copy" button. Where `ClipboardItem` is missing, the button saves the PNG and then opens
the site, and the caption says "Saves a PNG copy and opens synthid.com in a new tab, to upload it
there." A picture Loupe can't show (TIFF) disables the button and says why. The same rules serve
Forensics' reverse image search (`src/hooks/useCopyAndOpen.ts`). synthid.com takes a pasted picture:
in November 2026 a paste starts its detection, asking to sign in first.

### 6.4 Privacy

Lists what in the file could identify the person who made it or where they were, and removes what
the user ticks.

- **Findings**, grouped, each a row with what it is, its value (shortened, the full value in a
  tooltip) and a checkbox:
  - Location: GPS, the place fields in IPTC/XMP, and a Motion Photo video's own location.
  - Device: body, lens and internal serial numbers, unique image IDs.
  - People: artist, creator, copyright, owner name, named face regions (MWG and Microsoft), person
    shown fields.
  - Software and history: software and versions, document IDs that link edited copies, file paths
    in XMP (a Windows path with a user name is quoted: "Contains the path C:\Users\sam\…").
  - Dates and times: taken, digitised, modified, GPS time.
  - Embedded pictures: thumbnails and previews ("may show the picture before it was cropped").
  - Generation settings: AI prompts and workflows.
  - Content Credentials: the manifest, which can name a person or an account.
  - Hidden data: an unknown trailer after the picture.
- Every finding is ticked by default. Quick picks above the list: "Everything" and "Location only".
  Unticking keeps it.
- **Always kept**: the colour profile, and the picture's upright orientation (Orientation stays, or
  is applied if the planner must remove the block that holds it). An Ultra HDR gain map is kept
  unless "Everything" is chosen, which says "The HDR gain map is removed too."
- With every finding ticked, ExifTool removes everything (`-all=`) and copies the colour profile and
  Orientation back. Raw and TIFF files are never wiped that way: their maker notes and structure are
  needed to develop them, so only the ticked findings' tags go and maker notes stay ("What's ticked is
  in the camera's maker notes, which a CRW file needs to be developed." when that's all there is).
  Embedded previews in raw and TIFF files aren't offered. Stealth metadata isn't a finding: it's in
  the pixels, and the tool says it stays.
- Action "Remove", badge Lossless, caption "Only metadata is removed; the picture's bytes are copied
  as they are." ExifTool does the removal (`src/lib/plans/privacy.ts` turns the ticks into
  arguments; Node tests run each against the fixtures and read the result back).
- After the job, the result is read again: its export says "Nothing identifying is left." or lists
  what couldn't be removed and why (a format ExifTool can't fully write, say).
- Nothing found: "Nothing in this file identifies you or a place." and no action.
- Problem: a format ExifTool can't write ("Loupe can't change metadata in a BMP file."); nothing
  ticked ("Tick what to remove.").
- Output name: `<stem> (cleaned).<ext>`.

### 6.5 Forensics

Read-only apart from its online buttons, no primary action. Sections:

- **Edit trail**: the software that wrote the file, Photoshop's XMP history (each step's action,
  time and software), Lightroom and Camera Raw settings in plain words ("Exposure +0.70, Crop,
  Highlights −45"; `crs:` tags, only those away from their defaults), the count of ancestor
  documents, and date mismatches. Finding: "Edited in Adobe Lightroom Classic 13.1 on 3 April 2025",
  or "No editing software recorded. That doesn't mean it wasn't edited."
- **Embedded thumbnail**: the largest embedded thumbnail or preview beside the picture at the same
  height. If their aspect ratios differ by more than 1% or their perceptual hashes by more than 10
  bits: "The embedded thumbnail doesn't match the picture. It may show it before it was cropped or
  edited." Otherwise "The embedded thumbnail matches the picture." Absent: the section is hidden.
- **Compression** (JPEG only): estimated quality ("About quality 92"), which tables
  ("Standard libjpeg tables", "Photoshop's 'Save As' quality 10", or a known device), chroma
  subsampling, progressive or baseline (`src/lib/forensics/quant.ts`; the estimate scales the IJG
  luminance table and takes the closest match; known tables live in one table, starting with IJG and
  Photoshop and growing from real samples).
- **Hidden data**: data after the end of the picture that isn't a known trailer (a Motion Photo's
  video, Samsung's trailer, MPF images and gain maps are known): "4.2 MB of data after the end of the
  picture. It starts like a ZIP archive." with "Save it" (Extract's). PNG chunks that aren't
  standard or a known extension are listed by type.
- **Error levels**: switches the stage to the Error levels view. The picture is re-encoded as JPEG
  at a quality (slider 70–95, default 90) with MozJPEG, and each pixel shows the difference
  amplified (brightness slider, default ×20), greyscale. Caption: "Parts saved a different number of
  times can stand out. Edges, text and smooth areas differ naturally, so treat this as a reason to
  look closer, not proof."
- **Noise**: switches to the Noise view: each pixel minus the median of its 3 × 3 neighbourhood,
  amplified, greyscale. Same caution.
- **Fingerprints**: SHA-256 of the file and a 64-bit perceptual hash of the picture (DCT of a
  32 × 32 grey copy), each in mono with a copy button. "Compare with another image…" picks a second
  file (any format Loupe shows; it doesn't replace the open one) and says "Likely the same picture
  (4 of 64 bits differ).", "Possibly similar (18 of 64 bits differ)." or "Different pictures."
  (thresholds 10 and 20).
- **Find it online**: "Google Lens", "TinEye" and "Bing" buttons, each copying the picture and
  opening the site as in 6.3, with the caption "Sends the picture to the site you choose."

### 6.6 Extract

Saves what's embedded in the file, copied out as it is. No primary action; each item has Save and,
for pictures, "Open in Loupe".

- Items (from `ImageInfo.embedded`): EXIF thumbnail, previews (`PreviewImage`, `JpgFromRaw`, MPF
  images), a Motion Photo's video (`.mp4`, caption "Moviola can trim it or take its sound."), the
  portrait depth map, the Ultra HDR gain map, the ICC profile (`.icc`), the XMP packet (`.xmp`), a
  ComfyUI workflow (`.json`), generation parameters (`.txt`), the Content Credentials manifest
  (`.json`, as the C2PA SDK reads it), and unknown trailer data (`.bin`, or the extension it looks
  like).
- Each row: a 40 × 30 thumbnail or an icon for the kind, the label, the size, and its buttons.
- Badge: Lossless, caption "Copied out as they are."
- Output names: `<stem> thumbnail.jpg`, `<stem> preview.jpg`, `<stem> video.mp4`, `<stem> depth.png`,
  `<stem> gain map.jpg`, `<stem> profile.icc`, `<stem>.xmp`, `<stem> workflow.json`,
  `<stem> parameters.txt`, `<stem> credentials.json`, `<stem> hidden.<ext>`.

### 6.7 Edit metadata

Changes the common fields without touching the picture.

- **Fields**: Date taken (date and time, with a time zone offset select, "Not set" allowed), Title,
  Caption, Creator, Copyright, Keywords (comma-separated), and Location: Keep (default), Remove, or
  Set. Set takes latitude and longitude fields, or a click on the map (the stage switches to Map
  while Set is chosen; the pin can be dragged or moved with arrow keys).
- Fields start with the file's values. Only fields the user changed are written.
- Written with ExifTool's MWG composite tags (`-use MWG`), so EXIF, IPTC and XMP agree; the caption
  under each field says where it goes ("Written to EXIF, IPTC and XMP.").
- If the file has Content Credentials: "Changing metadata breaks this file's Content Credentials:
  they'll show as changed after signing. Privacy can remove them."
- Action "Save changes", badge Lossless, caption "Only the metadata changes; the picture's bytes are
  copied as they are."
- Problems: nothing changed ("Change a field to save."); a date that isn't one; latitude outside
  −90 to 90 or longitude outside −180 to 180; a format ExifTool can't write.
- Output name: `<stem> (edited).<ext>`.

### 6.8 Crop and rotate

- **Aspect** (segmented): Free (default), Original, 1:1, 4:3, 3:2, 16:9, 4:5, with a swap button
  for portrait. The crop frame on the stage (DESIGN.md) and X, Y, width and height fields under
  "More options".
- **Rotate** left and right by 90°, **Flip** horizontal and vertical: buttons, applied to the frame
  and the picture together. `[` and `]` rotate while the tool is open.
- **Straighten**: a slider from −45° to 45° in 0.1° steps, with a number field. The picture turns
  about its centre and the crop shrinks to the largest rectangle of the chosen aspect inside it, so
  no blank corners appear.
- **Lossless grid** switch (JPEG only, on by default): snaps the crop's left and top edges to the
  JPEG's block grid (8 or 16 px, from `JpegInfo.mcu`, in the source's orientation), so the crop is
  lossless. A chip on the stage says "On the 16 px grid: lossless".
- **Lossless rules** (`src/lib/plans/crop-rotate.ts`, every case tested):
  - JPEG with no straightening: jpegtran does the turn, the flip and the crop together, with the
    source's Orientation folded in. A turn or flip needs the moving edges to be whole blocks; when
    they aren't, a choice appears: "Trim 7 px from the right edge" (jpegtran `-trim`, Lossless,
    default) or "Re-encode the whole picture". A crop whose left and top edges are on the grid is
    lossless; off the grid, the planner says "Off the 16 px grid, so the picture is re-encoded." and
    the badge says Re-encodes.
  - PNG, lossless WebP and lossless JPEG XL: the pixels are moved exactly and written losslessly in
    the same format. GIF and BMP the same, written as PNG. Badge Lossless.
  - Anything else, or any straightening: Re-encodes (6.0's output rules). Straightening resamples
    with a bicubic filter.
- `\` held shows the uncropped, unturned picture.
- Action "Crop" (or "Rotate" when only turned or flipped).
- Problems: a crop smaller than 1 × 1 px; a crop outside the picture.
- Output name: `<stem> (cropped).<ext>`, or `<stem> (rotated).<ext>` when nothing was cropped.

### 6.9 Redact

- Drag on the picture to draw boxes; each box can be moved, resized and deleted (DESIGN.md). The
  settings list the boxes ("Box 1, 240 × 60 at 120, 880") with delete buttons.
- **Fill** (segmented, for all boxes): Black (default), Blur, Pixelate. With Blur or Pixelate:
  "Blurred and pixelated text can sometimes be read back. Black is safest." Blur is a box blur three
  times with a radius of a tenth of the box's shorter side (at least 8 px); Pixelate uses blocks of
  the same size.
- **Remove metadata** switch, on by default: everything Privacy's "Everything" removes. Thumbnails,
  previews, Content Credentials, gain maps and Motion Photo videos go whatever the switch says,
  because they'd show what was hidden ("The embedded thumbnail is removed; it would show what you
  hid.").
- Badge: Lossless for formats written losslessly (6.0), caption "Only the boxes change."; otherwise
  Re-encodes.
- `\` held shows the picture without the boxes.
- Action "Redact". Problem: no boxes ("Draw a box over what to hide.").
- Output name: `<stem> (redacted).<ext>`.

### 6.10 Adjust

- Sliders, each centred on zero (DESIGN.md): Exposure (−2 to +2 EV, in linear light), Contrast,
  Highlights, Shadows, Saturation, Warmth (−100 to 100). Double-click resets one; "Reset all" resets
  them all.
- The stage previews the adjustment on a copy scaled to the stage (at most 2048 px on the long
  side), redrawn at most once a frame while a slider moves; the export applies the same maths
  (`src/lib/adjust.ts`, pure, tested on known pixels) to the full picture.
- `\` held shows the picture before.
- Badge: Lossless for formats written losslessly (6.0), caption "Only the adjustment changes the
  pixels."; otherwise Re-encodes.
- Action "Save". Problem: every slider at zero ("Move a slider to adjust the picture.").
- Output name: `<stem> (adjusted).<ext>`.

### 6.11 Export

Compress, convert and resize: Bytesize's engine for one picture, with Loupe's metadata rules.

- **Format** (segmented): Same (default; GIF and BMP become PNG, HEIC becomes JPEG), JPEG, WebP, AVIF,
  JPEG XL, PNG. A **Lossless** switch for WebP and JPEG XL.
- **Quality**: a slider per lossy format, defaulting as Bytesize (JPEG, WebP, JPEG XL 75; AVIF 50).
- **Resize**: optional maximum width and height, Lanczos3 in linear light, never up (Bytesize's).
- **Target size**: optional, in kB or MB; bisects the quality as Bytesize's `fitQuality` does and says
  when even the lowest quality is too large.
- **Metadata** (switch, "Keep metadata", off by default, remembered): off removes everything but the
  colour profile; on copies it under 6.0's rules. Either way the colour profile is kept, or the
  colours converted to sRGB where the format can't carry it (Bytesize's rule).
- Settings carry over to the next file.
- After a run, the stage offers the Compare view (Bytesize's toggle, slider and side by side, sharing
  zoom and pan) between the source and the newest export.
- Badge: Lossless when the output is lossless, nothing is resized and every pixel survives (an 8-bit
  source; a 16-bit PNG written as PNG keeps its depth); otherwise Re-encodes with the caption
  "Re-encoded as AVIF at quality 50."
- The export shows the size and the change; when it grew: "4% larger than the original. Try a lower
  quality."
- Action "Export". Output name: `<stem>.<ext>` when the format changed, `<stem> (compressed).<ext>`
  when it didn't.

## 7. Running a job

### Worker protocol (`src/lib/protocol.ts`)
Like Moviola's: a promise-based client on the page, a dispatcher in the worker. The worker holds the
open image (the `File`, its bytes and its decoded pixels) between requests.

```ts
type Request =
  | { type: 'open'; id: number; file: File; shows: Capabilities['shows'] } // replies twice: 'picture', then 'done' with ImageInfo
  | { type: 'pixels'; id: number; maxSide: number } // upright RGBA for previews and the readout
  | { type: 'pixel'; id: number; x: number; y: number } // one exact pixel
  | { type: 'layer'; id: number; layer: 'ela' | 'noise'; quality?: number } // a greyscale ImageBitmap
  | { type: 'png'; id: number; source?: { blob: Blob; format: Format; orientation: Orientation } } // the upright picture, or a result for Copy, as a PNG Blob
  | { type: 'extract'; id: number; item: string } // an Embedded item's bytes
  | { type: 'fingerprint'; id: number; file?: File } // SHA-256 and perceptual hash, of the open image or another
  | { type: 'run'; id: number; plan: Plan }
  | { type: 'cancel'; id: number }
type Reply =
  | { type: 'picture'; id: number; picture: StagePicture }
  | { type: 'progress'; id: number; fraction: number | null } // null = indeterminate
  | { type: 'done'; id: number; value: unknown }
  | { type: 'failed'; id: number; message: string }
type StagePicture =
  | { type: 'file' } // the page shows the file itself in an <img> (the browser decodes it: `shows`)
  | { type: 'pixels'; pixels: Pixels; scaled: boolean; preview: boolean } // upright; `preview`: a raw file's embedded one
  | { type: 'none'; message: string } // nothing to show (TIFF, a raw file with no usable preview), and why
```

One job runs at a time. Requests other than `run` may run alongside a job but never block the UI.
Content Credentials are read on the page through `@contentauth/c2pa-web`, which runs its own worker.

Cancelling a job terminates the worker and starts a new one (as Bytesize's `EngineClient.restart`:
encoders can't be interrupted), which then reopens the current file.

If the worker fails (its script doesn't load, it dies, or a message can't be read), the client
rejects everything pending and every later request with: "Loupe's background worker stopped.
Reload the page to carry on."

### The job slot (`src/hooks/useJob.ts`)
As Moviola's, without the save dialog: `idle → running → idle`, `idle → copying → idle`,
`running → cancelling → idle`. Anything but `idle` disables the primary action and Copy buttons.

### Results
- Results are Blobs in memory. Each export has Download (an object URL, revoked when removed), Copy
  (as PNG where the clipboard takes images; the worker decodes the result, so HEIC and JPEG XL copy
  too; none for raw and TIFF results) and "Open in Loupe".
- "Open in Loupe" opens the result as the source (the previous source's exports stay in the strip).
- Cancel: the export isn't added; "Cancelling…" shows until the new worker is ready.
- Errors become an export card in danger style with the message in plain words; unknown errors keep
  the library's message after "Something went wrong:".
- A codec or ExifTool that can't be loaded (offline before the precache finished, or an old tab
  after a deploy) fails the job with "The AVIF encoder couldn't be loaded. Check your connection, or
  reload the page if Loupe was updated." Nothing is remembered: the next job tries again.
- Each finished job is announced to screen readers ("photo (cleaned).jpg is ready to download.").
  Keyboard focus moves from the action to Cancel when a job starts and back when it ends.

### Leaving the page
As Moviola: `beforeunload` asks while a job runs and while any result hasn't been downloaded, copied
or opened; the update banner says what reloading would lose (`src/lib/leaving.ts`), and only the tab
that pressed Reload, or a tab with nothing to lose, reloads.

## 8. Naming (`src/lib/names.ts`)

- The stem is the source name without its last extension.
- Suffixes as listed per tool. Repeats in the exports strip are numbered `name (2).ext`, ignoring
  case, as Bytesize does.
- Characters invalid on Windows (`<>:"/\|?*`) never appear in generated parts.
- Extensions: `.jpg`, `.png`, `.webp`, `.avif`, `.jxl`.

## 9. Capabilities (`src/lib/capabilities.ts`)

Probed once at start-up and kept as plain data:

```ts
type Capabilities = {
  shows: Record<'avif' | 'heic' | 'jxl', boolean> // an <img> decodes a tiny bundled sample
  clipboardImage: boolean // ClipboardItem exists and takes image/png
  webgl2: boolean // the 360° view
}
```

Planners and views take `Capabilities` as an argument, so tests cover "no clipboard" and "no HEIC"
without a browser.

## 10. What leaves the device

Only these, and the app says so where each happens:

- **Map tiles** from `tile.openstreetmap.org` while the Location map shows and the browser is online
  (6.2).
- **A picture the user copies** to SynthID or a reverse image search, after pressing that site's
  button (6.3, 6.5). Loupe itself sends nothing; the user pastes it there.
- **The sister sites' list** for the app launcher (`apps.hyphensam.com/apps.json`), as on every
  sister site.
- Links the user follows (OpenStreetMap, Google Maps, the credits).

No analytics, fonts or CDNs. About says this in two sentences.

## 11. Copy and tone

Plain, short, British spelling. Say what happened and what to do next. No exclamation marks, no
"Oops". Findings say what they rest on (DESIGN.md's Finding) and never overstate: "Says it was made
with AI", not "AI-generated", when the only evidence is metadata; "No AI markers found", never "Not
AI" or "Real". Every problem a planner returns is a full sentence naming the actual format, size or
field involved.

## 12. Data and fixtures

### Bundled data (made by scripts, committed)
- `public/places.bin` and `public/regions.json` (`pnpm places`, `scripts/places.ts`): GeoNames'
  `cities1000` (less historical, abandoned and destroyed places) and `admin1CodesASCII`, reduced to
  name, coordinates (to 1e-5°) and a region index; `regions.json` holds each index's country code and
  region name, and which country codes go with each world-atlas outline. The script's header gives the
  byte layout. Keep the file under 5 MB (172,036 places, 3.5 MB, 2 MB gzipped in November 2026).
- The world map: `world-atlas`'s `countries-50m.json`, imported as an asset and turned into GeoJSON
  with `topojson-client`. Its outlines also answer "which country" for points far from any place.
- `public/trust/` (`pnpm trust`, `scripts/trust.ts`): the C2PA trust list's anchors (and the Content
  Authenticity Initiative's interim list, which older signed files chain to), as PEM, with the date
  they were fetched recorded for About and the AI check's caption.
- `src/vendor/jpegtran/`: libjpeg-turbo's jpegtran built to WebAssembly by `tools/jpegtran/build.sh`
  (Emscripten in Docker); the build's version and flags are recorded in `tools/jpegtran/README.md`.

### Fixtures (`fixtures/`, made by `pnpm fixtures`, committed)
`scripts/fixtures.ts` runs in Node: it makes small base pictures with jSquash's encoders (and
ImageMagick for GIF, BMP and TIFF, libheif in Docker for HEIC, libultrahdr in Docker for Ultra HDR,
ffmpeg for the Motion Photo's video), writes metadata with the same
ExifTool WebAssembly the app uses or with its own chunk writers (`camera.jpg` and `cropped-thumb.jpg`
are written by ExifTool in Docker, because embedding a thumbnail needs a second input file), and copies a few public samples
whose source and licence it records in `fixtures/SOURCES.md`. Generated files stay under 300 kB,
samples under 1 MB. At least:

| File | Contents | Used for |
|---|---|---|
| `camera.jpg` | 64 × 48 JPEG, 4:2:0; make, model, lens, exposure, serials, owner, dates with offset, GPS with altitude, direction and accuracy; a matching EXIF thumbnail | Info, Location, Privacy, Extract |
| `cropped-thumb.jpg` | `camera.jpg` cropped, keeping the thumbnail of the whole | Forensics thumbnail mismatch |
| `orient-6.jpg` | Orientation 6, 40 × 24, 4:2:0 | upright display, lossless turn needing `-trim` |
| `grid-444.jpg`, `grid-420.jpg` | 8 and 16 px blocks, sizes multiples of 16 | lossless crop grid |
| `photoshop.jpg` | Photoshop software, XMP history, `crs:` settings, DocumentAncestors with a Windows path | edit trail, privacy paths |
| `trailer-zip.jpg` | a JPEG with a small ZIP appended | hidden data |
| `motion-photo.jpg` | JPEG + XMP container directory + a 1 s MP4 appended | Motion Photo kind and extraction |
| `depth.jpg` | GDepth XMP with a depth PNG | depth view and extraction |
| `pano-360.jpg` | 128 × 64 with GPano equirectangular XMP | 360° view |
| `screenshot.png` | XMP UserComment "Screenshot" | screenshot kind |
| `a1111.png`, `a1111.jpg`, `comfyui.png`, `comfyui.webp`, `novelai.png`, `stealth.png`, `invokeai.png`, `swarmui.png`, `midjourney.png`, `drawthings.png`, `tensorart.png` | each generator's markers as section 6.3 lists, laid out as the real files are | AI check parsers |
| `sd-parsers/` (from sd-parsers' tests) | real A1111 (PNG, JPEG, stealth), ComfyUI, Fooocus, InvokeAI (three forms) and NovelAI pictures, cropped | AI check parsers against real files |
| `iptc-ai.jpg` | Digital Source Type trainedAlgorithmicMedia only | IPTC source |
| C2PA samples (from the C2PA SDK's public test files) | a valid signed manifest, one with generative AI actions, one tampered | C2PA validation and verdicts |
| `ultra-hdr.jpg` | 64 × 48, encoded by libultrahdr from a 10-bit HLG picture: a single-channel gain map in MPF, described in hdrgm XMP and ISO 21496-1 | HDR kind, gain map extraction, dropped on edit |
| ExifTool's maker-note test images (from its distribution's `t/images`) | Nikon, Canon, Sony, Pentax and others | shutter count, serials, lenses |
| `png-16-alpha.png`, `lossy.webp`, `lossless.webp`, `photo.avif`, `photo.jxl`, `lossless.jxl`, `anim.gif`, `picture.bmp`, `photo.heic`, `scan.tif` | each format | opening, lossless rules, output formats |
| `misnamed.png` | a JPEG named `.png` | extension mismatch |
| `notimage.txt` | text | the "can't open" message |

Node tests open these, run planners and jobs, and check outputs by reading them back: tags written
or gone, image data byte-identical for lossless jobs, dimensions and orientation right.

## 13. Later

- Lossless JPEG redaction: black boxes on the block grid written in the DCT domain.
- Showing TIFF pictures.
- Signing a new Content Credentials manifest that records Loupe's edits.
- Opening a Live Photo's .MOV beside its picture.
