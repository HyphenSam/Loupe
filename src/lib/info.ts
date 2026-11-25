/** ImageInfo: the plain data the findings, planners and UI work from (SPEC.md section 4). Built in the
 * worker from ExifTool's JSON (`tags.ts`), the decoded picture and the places data. Later phases add generators,
 * edit trail, JPEG tables and trailer. */
import type { Format } from './formats'
import type { Place } from './places'

export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** One tag as ExifTool reports it: its family 0 group (EXIF, XMP, MakerNotes…), its family 1 group (IFD0,
 * XMP-dc, Canon…), its name, its description and its value as ExifTool prints it. */
export type Tag = { family: string; group: string; name: string; label: string; value: string }

export type Camera = {
  make: string | null
  model: string | null
  lens: string | null
  exposure: { time: string | null; aperture: number | null; iso: number | null; bias: number | null }
  focalLength: number | null // mm
  focal35: number | null // mm
  flash: string | null
  bodySerial: string | null
  lensSerial: string | null
  internalSerial: string | null
  owner: string | null
  shutterCount: number | null
  software: string | null
}

/** A date and time as the file records it: local time, and its offset from UTC when known. */
export type LocalTime = { local: string; offset: string | null } // '2025-03-12T14:32:05', '+13:00'

export type Dates = {
  taken: LocalTime | null
  digitised: LocalTime | null
  modified: LocalTime | null
  gpsUtc: string | null // '2025-03-12T01:32:05Z'
}

export type Gps = {
  lat: number
  lon: number
  altitude: number | null // metres above sea level
  direction: { degrees: number; ref: 'true' | 'magnetic' } | null
  speed: number | null // km/h
  accuracy: number | null // metres
}

export type Kind =
  | 'screenshot'
  | 'motion-photo'
  | 'live-photo'
  | 'ultra-hdr'
  | 'portrait-depth'
  | 'panorama-360'
  | 'burst'
  | 'animated'
  | 'raw'

export type EmbeddedKind =
  | 'thumbnail'
  | 'preview'
  | 'mpf-image'
  | 'motion-video'
  | 'depth-map'
  | 'gain-map'
  | 'icc-profile'
  | 'xmp'
  | 'comfyui-workflow'
  | 'generation-parameters'
  | 'c2pa-manifest'
  | 'trailer'

export type Embedded = {
  id: string // the ExifTool tag that holds it ('IFD1:ThumbnailImage'), or the kind for whole blocks
  kind: EmbeddedKind
  label: string
  size: number | null
  extension: string
  isImage: boolean
}

export type ColourSpace = 'srgb' | 'display-p3' | 'adobe-rgb' | 'prophoto' | 'rec2020' | 'grey' | 'cmyk' | 'other'

export type Colour = {
  profile: string | null // the ICC profile's description
  space: ColourSpace | null
  hdr: 'gain-map' | 'pq' | 'hlg' | null
}

export type Animation = { frames: number; duration: number; loops: number | 'forever' }

export type ImageInfo = {
  name: string
  size: number
  lastModified: number
  format: Format
  formatName: string
  extension: { given: string; expected: string } | null
  width: number
  height: number
  orientation: Orientation
  displayWidth: number
  displayHeight: number
  bitDepth: number | null
  alpha: boolean
  colour: Colour
  animation: Animation | null
  tags: Tag[]
  /** ExifTool's JSON as it came, for "Copy as JSON". */
  json: string
  camera: Camera | null
  dates: Dates
  gps: Gps | null
  /** The nearest named place, worked out offline in the worker (SPEC.md 6.2); null without GPS, or when the
   * places data couldn't be read. */
  place: Place | null
  kinds: Kind[]
  embedded: Embedded[]
  /** IPTC Digital Source Type in XMP (`Iptc4xmpExt:DigitalSourceType`), as stated: a URI or a bare term. */
  sourceType: string | null
}

/** Whether Orientation turns the picture on its side, so its upright width is its stored height. */
export const turnsSideways = (orientation: Orientation) => orientation >= 5
