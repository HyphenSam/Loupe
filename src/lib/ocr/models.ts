/** The text recognition files (SPEC.md 6.12, written by `pnpm ocr` into models.json): ONNX Runtime's wasm, the
 * detector and each script's recogniser and character list, with their sizes and SHA-256. */
import type { DetectorSettings } from './detect'
import manifest from './models.json'
import type { Script } from './scripts'

/** A file under public/: its path there, size in bytes and SHA-256 in hexadecimal. */
export type OcrFile = { path: string; size: number; sha256: string }

export type Models = {
  runtime: OcrFile
  detector: OcrFile & DetectorSettings
  scripts: Record<Script, { recogniser: OcrFile; characters: OcrFile }>
}

export const MODELS: Models = manifest

/** The Cache Storage the downloaded files are kept in, outside the service worker's precache. */
export const TEXT_CACHE = 'loupe-text'

/** The URL a file is fetched from and kept under in the cache. */
export const textCacheUrl = (file: OcrFile, origin: string) => new URL(`/${file.path}`, origin).href
