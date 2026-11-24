# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite, React 19, TypeScript, Tailwind v4, Radix primitives, Vitest; pnpm. Static site on Cloudflare
Workers (static assets only) at loupe.hyphensam.com. Metadata is read and written by ExifTool
running as WebAssembly (zeroperl); Content Credentials are read and verified by the C2PA SDK's
WebAssembly build (`@contentauth/c2pa-web`). Pictures are decoded and encoded with jSquash's codecs
(as in Bytesize) and libheif for HEIC; lossless JPEG rotation and cropping use libjpeg-turbo's
jpegtran built to WebAssembly. Maps use Leaflet, with OpenStreetMap tiles when online and a bundled
world map otherwise. Installable PWA that works offline.

## Users

People with one picture and a question about it, or a small job to do on it: where and when was this
taken, on what; was it made with AI; what does this file give away about me before I post it; has
it been edited; can I crop, straighten, redact or shrink it without an upload site. Journalists and
fact-checkers checking a picture's story, people selling a camera and checking its shutter count,
people sharing photos who want the location gone, people who make pictures with Stable Diffusion
and want the prompt back. Comfortable with files and folders; not necessarily with EXIF.

## Product Purpose

Inspect a single image in depth and do everyday edits to it, entirely on the user's own device,
losslessly wherever that's possible and plainly labelled when it isn't. Success: open a picture, see
in plain words what its file says (and what it doesn't), and get an edited copy out knowing whether
any quality was lost.

## Positioning

ExifTool's depth with a GUI and no install, plus the questions people now ask of every picture:
where, when, edited, AI. No uploads, no account, no server, and it keeps working offline once
installed. The only things that leave the device are ones the user asks for by name: map tiles when
online, and a picture copied to SynthID or a reverse image search when the user presses that button.
Bytesize is the batch compressor; Loupe is one picture at a time, examined closely. Free and open
source (MIT OR Apache-2.0).

## Operating Context

- One image open at a time, added by drag and drop, file picker, paste, or opening it with the
  installed app. A result can be opened in Loupe to keep editing it.
- Eleven tools in two groups. Inspect: Info, Location, AI check, Privacy, Forensics, Extract. Edit:
  Edit metadata, Crop and rotate, Redact, Adjust, Export.
- Reading metadata takes under a second or two for most files; the picture shows first.
- Results are small enough to hold in memory and download, copy, or open again.

## Capabilities and Constraints

- Opens JPEG, PNG, WebP, AVIF, HEIC/HEIF, JPEG XL, GIF and BMP pictures. Camera raw files (DNG, CR2,
  CR3, NEF, ARW, RAF, ORF, RW2 and others) open for their metadata and embedded preview only. TIFF
  opens for its metadata; its picture isn't shown yet.
- AI detection reads Content Credentials (C2PA), the IPTC Digital Source Type, and the metadata
  Stable Diffusion front ends and other generators write. It can't see invisible watermarks: a
  button copies the picture and opens SynthID's own site for that.
- No metadata isn't proof of anything: most sites strip it. The app says so wherever it matters.
- Writes JPEG, PNG, WebP, AVIF, JPEG XL. Not HEIC: an edited HEIC comes out as JPEG.
- Animated images are inspected whole; edits keep only the first frame.

## Brand Commitments

- Name: Loupe, after the magnifier photographers hold to a negative or a print.
- Voice: plain and quiet. Short, factual labels; explains only when asked; a tool that gets out of
  the way. British spelling. Says what the file claims and how sure that claim is; never overstates.
- Credit ExifTool (Phil Harvey), zeroperl, the C2PA SDK, jSquash and its codecs, libheif,
  libjpeg-turbo, Leaflet, OpenStreetMap contributors, Natural Earth, GeoNames and SunCalc in About.

## Evidence on Hand

No testimonials or benchmarks are provided; don't invent them.

## Product Principles

1. Lossless by default. Change metadata without touching pixels; rotate and crop JPEGs losslessly
   where the grid allows; re-encode only when the job needs it.
2. Never re-encode quietly. Every action is labelled "Lossless" or "Re-encodes" before it runs.
3. Nothing leaves the device unless the user presses a button that says where it's going.
4. Say how sure a finding is. Signed beats stated; stated beats absent; absent proves nothing.
5. The picture is the hero; the interface recedes around it.
6. Sensible defaults; options stay out of sight until wanted.

## Accessibility & Inclusion

Keyboard operable throughout (zoom, pan, crop handles, redaction boxes and the map included),
visible focus, WCAG AA contrast in light and dark themes, reduced motion respected. Findings are
written as sentences a screen reader can read, not as colour or icons alone.
