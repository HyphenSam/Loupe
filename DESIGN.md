---
name: Loupe
description: A quiet inspection bench where the picture is the only colour on screen, every finding says how sure it is, and every action says whether it loses quality.
colors:
  accent: "oklch(0.52 0.19 293)"
  accent-hover: "oklch(0.47 0.19 293)"
  accent-ink: "oklch(1 0 0)"
  accent-soft: "oklch(0.95 0.03 293)"
  accent-text: "oklch(0.5 0.19 293)"
  focus: "oklch(0.5 0.19 293)"
  canvas: "oklch(0.975 0.002 286)"
  panel: "oklch(1 0 0)"
  stage: "oklch(0.18 0.003 286)"
  sunken: "oklch(0.955 0.003 286)"
  line: "oklch(0.905 0.005 286)"
  line-strong: "oklch(0.83 0.008 286)"
  ink: "oklch(0.21 0.006 286)"
  ink-soft: "oklch(0.45 0.012 286)"
  danger: "oklch(0.55 0.2 25)"
  ok: "oklch(0.55 0.13 155)"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  heading:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  caption:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  control: "8px"
  panel: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-ghost:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 10px"
  segmented:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    height: "32px"
  segmented-selected:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  switch-on:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    width: "36px"
    height: "20px"
---

# Design System: Loupe

## Overview

**Creative North Star: "The Light Table"**

A light table with a loupe on it: neutral surfaces, a rail of tools, a settings column of short
labelled findings and controls, and a dark stage where the picture sits to be examined up close.
Nothing on screen competes with the picture; the one violet accent marks the next thing to press,
the current selection, the crop frame and whatever is in progress. The system is Moviola's (itself
Bytesize's and Art Cleaner's), with its own accent so the sister sites are told apart at a glance,
and three additions for inspection: findings that say how sure they are, a sheet for long tables of
tags, and stage views (the picture, the map, forensic layers) that a tool can switch to.

Density is moderate: compact 13–14 px labels, tight groups, generous separation between groups.
Light and dark are equal citizens and follow the system setting unless one is chosen from the
header's theme menu. Motion is limited to 150–200 ms state changes.

**Key Characteristics:**
- Zinc neutrals in OKLCH (hue 286), one violet accent (hue 293), the tint of coated lens glass.
- System UI type with tabular figures everywhere; a monospace face only for raw values (tag values
  in the sheet, hashes, coordinates, hex colours).
- Hairline borders and tonal layers instead of shadows; one floating shadow for overlays.
- State carried by form as well as colour (dashed, filling, ticked, warned, dimmed).

## Colors

Neutral zinc greys with a single violet; the picture supplies every other colour.

### Primary
- **Lens Violet** (accent): the primary action (Save, Remove, Crop…), switches that are on, slider
  ranges, the crop frame and its handles, redaction box outlines, the map pin and progress bars. In
  the light theme it's deep enough (0.52 L) to carry white text at 6:1 and still hold 3:1 on the dark
  stage, so crop handles read on the picture. The dark theme's is lighter (0.72 L) with dark ink text
  on it (6.8:1). accent-ink is white in light, dark ink in dark. Hover deepens it in light and
  lightens it in dark. accent-text is the readable version for links; accent-soft is the
  text-selection and drop-overlay tint.
- **Focus** (focus): focus rings and the selected tool's indicator. accent-text in both themes. On the
  dark stage, focus rings use stage-focus, the dark theme's focus in both themes, because the light
  theme's can't hold 3:1 there.

### Neutral
- **Canvas** (canvas): the page behind everything.
- **Panel** (panel): the tool rail, settings column, toolbars, sheet and exports strip.
- **Stage** (stage): where the picture sits. Near-black in both themes (0.18 L light, 0.13 L dark) by
  default; the stage's background menu also offers light grey (0.93 L) and a checkerboard for
  judging transparency. The background is the user's choice and is remembered.
- **Sunken** (sunken): segmented-control tracks, hover fills, the offline map's land.
- **Hairline** (line, line-strong): dividers and control outlines; the offline map's borders.
- **Ink** (ink, ink-soft): text and secondary text, both at least 4.5:1 on panel and canvas.
- **Danger / OK** (danger, ok): failures and problems; finished exports and the "Lossless" badge.

Dark mode redefines every token under `:root[data-theme='dark']` in `src/index.css` (`data-theme`
is always the theme in use, set before the first paint by a script in `index.html` from the shared
`theme` cookie or the system, then kept by `useTheme`; nothing in the CSS reads
`prefers-color-scheme` itself): neutrals as Moviola (canvas 0.165 L, panel 0.2 L, ink 0.965 L), stage
0.13 L, accent `oklch(0.72 0.14 293)`, accent-hover `oklch(0.76 0.13 293)`, accent-ink
`oklch(0.21 0.006 286)`, accent-soft `oklch(0.3 0.06 293)`, accent-text and focus
`oklch(0.8 0.1 295)`, danger `oklch(0.68 0.18 25)`, ok `oklch(0.72 0.14 155)`. Check every pair's
contrast when changing a token (`src/contrast.test.ts`).

### Named Rules
**The Picture Owns Colour Rule.** Nothing but the violet accent and the two status colours carries
chroma. The stage stays neutral so colour and compression artefacts can be judged. Forensic layers
(error levels, noise) are greyscale.

**The Accent Means Act Rule.** Violet appears only on the next action, the current selection, the
crop frame, redaction outlines, the map pin, focus and progress; never as decoration.

**The Honest Label Rule.** Every primary action shows, next to it, whether it is lossless or
re-encodes. Never leave the user to guess.

**The How Sure Rule.** Every finding about where a picture came from says what it rests on:
signed, stated in the file, or a pattern. Findings never use danger red; "Made with AI" isn't an
error.

## Typography

**Body Font:** the platform UI face (system-ui stack), no web fonts, so the app works offline and
feels native. Raw values use the platform monospace (`ui-monospace` stack) at 12 px.

**Character:** plain and quiet; weight and size do the ranking, never case or tracking.

### Hierarchy
- **Title** (600, 18px): the empty stage's "Drop an image here"; the About dialog's title is 16px.
- **Heading** (600, 14px): the app name (15px), the tool's name at the top of the settings column,
  the verdict line of a finding.
- **Body** (400, 14px, 1.45): dialog prose, finding sentences and button text.
- **Label** (500, 13px): section headings (sentence case, ink-soft), field labels, segmented options,
  file names, tag names.
- **Caption** (400, 12px): hints under controls, status lines, file sizes, tool-rail labels, the
  source line under a finding.
- **Mono** (400, 12px): tag values in the sheet, hashes, coordinates, pixel readouts.

### Named Rules
**The Sentence Case Rule.** Headings and labels are sentence case at normal tracking. No uppercase
tracked labels or eyebrows.

## Layout

Desktop (1024 px and up): three columns. A 72 px **tool rail** (icon above a 12 px caption, one per
tool, in two groups, Inspect and Edit, split by a hairline), a 320 px **settings column** (the open
file's card, the tool's findings or settings scrolling, the primary action and its Lossless/Re-encodes
badge pinned at the foot when the tool has one), and the **stage** filling the rest: the picture with
its toolbar, and the exports strip at the bottom. The header (name, theme, About, the app launcher)
sits over the rail and the settings column only, as on the sister sites, so the stage runs the full
height of the window. The page itself never scrolls; the rail scrolls if the window is too short for
eleven tools.

Mobile: one column in reading order: header, stage (at least 50% of the viewport height), a
horizontally scrolling row of tool chips, settings, exports. The primary action with its badge (or
the progress in its place) is fixed to the bottom of the screen; its caption, hints and problems stay
at the end of the settings, just above it. The update notice sits above the fixed action.

Spacing: 4 px base; 8–12 px inside groups, 16–20 px panel padding, 28 px between settings sections.

## Elevation & Depth

Flat by default: depth comes from tonal layers (canvas, panel, stage, sunken) and 1 px hairlines.
One shadow, `--shadow-float`, is reserved for things that float above the page: dialogs, the sheet,
the update notice, tooltips, the magnifier. Labels over the picture use a translucent black chip with
a small backdrop blur.

### Named Rules
**The Flat-By-Default Rule.** Surfaces don't cast shadows at rest; only overlays float.

## Shapes

Gently rounded: 8 px for controls and thumbnails, 6 px for a segmented option inside its 8 px track,
12 px for panels, dialogs, the sheet and the drop area, full pills for switches, badges and chips.
The empty stage uses a 2 px dashed outline as the drop target. The magnifier is a circle.

## Components

### Buttons
As Moviola: 8 px radius; heights 28 / 36 / 44 px. Primary is violet with accent-ink text; secondary
is panel with a line-strong ring; ghost is ink-soft text with a sunken hover. Icons are lucide at
16 px, 1.75–2 stroke, before the label.

### Tool rail
One button per tool: a 20 px lucide icon above its name in caption type. Selected: sunken fill, ink
text and a 3 px focus-colour bar on the rail's inner edge. A tool that can't apply to the open file
(Location for a picture with no GPS, say) is dimmed, stays focusable and shows why in a tooltip.
Arrow keys move between tools, across the group divider.

### File card
Top of the settings column: a 64 × 48 px thumbnail (object-fit contain on sunken), the file name
(label, truncates in the middle so the extension stays visible), and a caption line of size,
dimensions and format ("2.4 MB · 4032 × 3024 · HEIC"). Chips for special kinds go under it
("Motion Photo", "Ultra HDR", "360°", "Screenshot") in caption type on sunken. A ghost "Replace"
button.

### Finding
How Info, AI check, Privacy and Forensics say what they found. A 16 px lucide icon, a one-line verdict
in heading type ("Made with AI"), a body-type sentence of detail ("Content Credentials signed by
OpenAI say this was generated by ChatGPT."), and a caption line saying what it rests on, with its
own icon: a seal for "Signed and verified", a tag for "Stated in the file's metadata; anyone can add
or remove this", a dashed circle for "Nothing found". Icon and words carry the meaning; colour
never does alone. Findings sit on panel with a hairline, 12 px padding, 8 px radius.

### Key-value list
The settings column's summaries: a label (ink-soft) above or beside its value (ink), two columns
when both fit in 288 px, one otherwise. Long values wrap; values meant to be copied (coordinates,
hashes, prompts) have a ghost copy button that says "Copied" for a moment.

### Sheet
"All tags" opens as a sheet over the stage: panel colour, 12 px radius, the stage's full size less
16 px, floating shadow. A search field at the top (filters tag names and values as you type), then
one section per group (EXIF, XMP, IPTC, ICC, maker notes, file), each a two-column table of tag name
(label) and value (mono, wraps). "Copy as text" and "Copy as JSON" sit in the header with the
close button. Esc closes it and returns focus to the button that opened it.

### Stage and its toolbar
The picture sits centred on the stage, fitted. A toolbar in translucent chips floats at the stage's
top edge: the stage view (Picture, plus Map, Error levels, Noise, Depth, 360° or Compare when the
tool or file offers them), zoom (Fit, 100%, − and +, and the zoom level as text), the background menu,
and the magnifier toggle. Controls on the stage use light ink at 0.9 L for contrast on the dark stage
in both themes, and dark ink when the light background is chosen. The status line at the stage's
bottom-left shows the pointer's pixel position and its colour (hex and RGB, mono) while it's over
the picture.

### Magnifier
The loupe the app is named after: a 160 px circle following the pointer that shows the picture at
8× with a hairline pixel grid past 6×, a crosshair on the centre pixel and its colour beneath in a
chip. Toggled with `L` or the toolbar button. Keyboard users move it with the arrow keys (one pixel,
ten with Shift) once the stage has focus.

### Map
The Location tool's stage view. Leaflet, fitted to the stage, with a violet pin at the picture's
location, a translucent violet cone for the camera's field of view when the direction is known, and a
thin ink line towards the sun when its position is known. Offline it draws the bundled world map:
sunken land, canvas sea, line borders. Online it switches to OpenStreetMap's tiles once the first
tile loads, with the attribution in caption type at the bottom-right. Zoom buttons follow the stage
toolbar's style; the map's own keyboard support stays on.

### Lossless badge
A pill beside the primary action. "Lossless": ok-coloured text and a check icon on a transparent
fill with an ok hairline. "Re-encodes": ink-soft text and a refresh icon with a line-strong hairline.
Form (icon) and words carry the meaning, not colour alone. A short caption under it can say what
re-encoding touches ("The picture is re-encoded at quality 90; metadata is copied.").

### Crop frame and redaction boxes
The crop frame is a 2 px violet rectangle with eight square handles (12 px, 24 px hit area) and a
rule-of-thirds grid while dragging; outside it the picture is dimmed to 40%. When a JPEG crop is
snapped to the lossless grid, a caption chip says "On the 16 px grid: lossless". Redaction boxes are
drawn with a 2 px violet outline and show their fill (black, blur or pixelate) inside; the selected
box has handles. Handles and boxes are focusable: arrow keys move by a pixel (ten with Shift),
Alt+arrow resizes, Delete removes a box.

### Segmented control, switch row, number field, slider
As Moviola. Number fields gain units: px, %, °, kB, MB. Adjustment sliders are centred on zero with
a tick at zero, and double-clicking one resets it.

### Progress
Replaces the primary action while a job runs: a violet bar filling left to right, the percentage in
caption type, and a secondary "Cancel" button. Indeterminate phases (reading metadata, loading a
codec) use a pulsing bar.

### Exports strip
Bottom of the stage on panel: one card per result, newest first. A 40 × 30 thumbnail, the file
name, the size and the change against the source (−83%, or "+4%" in ink when it grew), and Download,
Copy and "Open in Loupe" buttons. A remove button frees the memory. Failed jobs show a danger ring and
the reason.

## Do's and Don'ts

### Do:
- **Do** keep the stage neutral and let the picture be the only colour.
- **Do** use the violet accent only for the next action, selection, the crop frame, redaction
  outlines, the map pin, focus and progress.
- **Do** label every action Lossless or Re-encodes, with an icon as well as words.
- **Do** say what every finding rests on, with an icon as well as words.
- **Do** show state by form as well as colour (dashed, bar, tick, warning, dimmed).
- **Do** use sentence-case headings at 13–14 px, ranked by weight.
- **Do** keep colour transitions to 150–200 ms.

### Don't:
- **Don't** put white text on the dark theme's violet, or dark text on the light theme's.
- **Don't** use danger red, warning triangles or alarm language for AI or privacy findings.
- **Don't** use gradients, glass, glows, lens flares, magnifying-glass clip art or detective kitsch
  in the interface. The app icon (a lens ring over the corner of a print) is the one place a lens
  appears.
- **Don't** add uppercase tracked labels, eyebrows or numbered sections.
- **Don't** tint the stage or put colour behind the picture.
- **Don't** load web fonts; the app must work offline with the system faces.
