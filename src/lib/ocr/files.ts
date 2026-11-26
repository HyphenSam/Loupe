/** Which text recognition files the Text tool needs and holds (SPEC.md 6.12): a script's files, the size of what
 * isn't held yet, the script to start on, and the wording for what's kept. Files are named by their paths under
 * public/, which is how the cache's keys end. */
import { MODELS, type Models, type OcrFile } from './models'
import { SCRIPTS, type Script } from './scripts'

/** ONNX Runtime's wasm, the shared detector, and the script's recogniser and character list. */
export function filesFor(script: Script, models: Models = MODELS): OcrFile[] {
  const { recogniser, characters } = models.scripts[script]
  return [models.runtime, models.detector, recogniser, characters]
}

/** The bytes still to download for `script`, given the paths held. */
export function downloadSize(script: Script, held: readonly string[], models: Models = MODELS): number {
  return filesFor(script, models)
    .filter((file) => !held.includes(file.path))
    .reduce((sum, file) => sum + file.size, 0)
}

const CYRILLIC = ['ru', 'uk', 'be', 'bg', 'sr', 'mk', 'kk']

/** The script for the user's first language: Korean, Cyrillic, or Latin, Chinese and Japanese for anything else. */
export function defaultScript(languages: readonly string[]): Script {
  const first = (languages[0] ?? '').toLowerCase().split('-')[0]
  if (first === 'ko') return 'korean'
  if (CYRILLIC.includes(first)) return 'cyrillic'
  return 'latin-cjk'
}

const pathOf = (key: string) => new URL(key).pathname.replace(/^\//, '')

/** Every path the manifest names. */
const known = (models: Models) => new Set(SCRIPTS.flatMap((s) => filesFor(s.id, models).map((f) => f.path)))

/** Cache keys (URLs) of files no script in this manifest uses: an older manifest's, deleted when the tool loads. */
export function staleKeys(keys: readonly string[], origin: string, models: Models = MODELS): string[] {
  const paths = known(models)
  return keys.filter((key) => new URL(key, origin).origin !== origin || !paths.has(pathOf(key)))
}

/** The paths a set of cache keys holds. */
export const heldPaths = (keys: readonly string[]) => keys.map(pathOf)

/** The scripts whose files are all held, in the select's order. */
export function heldScripts(held: readonly string[], models: Models = MODELS): Script[] {
  return SCRIPTS.filter((s) => filesFor(s.id, models).every((f) => held.includes(f.path))).map((s) => s.id)
}

/** 37,863,756 → "38 MB": sizes to download and keep, to the nearest megabyte. */
export const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`

/** "9.6 of 38 MB" while downloading. */
export const progressWords = (done: number, total: number) => `${(done / 1e6).toFixed(1)} of ${megabytes(total)}`

/** "Kept on this device: Latin, Chinese and Japanese; Korean (51 MB).", or null when no script is held. The size is
 * every held file the manifest names. */
export function keptWords(held: readonly string[], models: Models = MODELS): string | null {
  const scripts = heldScripts(held, models)
  if (!scripts.length) return null
  const files = [
    models.runtime,
    models.detector,
    ...Object.values(models.scripts).flatMap((s) => [s.recogniser, s.characters]),
  ]
  const size = files.filter((f) => held.includes(f.path)).reduce((sum, f) => sum + f.size, 0)
  const labels = scripts.map((id) => SCRIPTS.find((s) => s.id === id)!.label)
  return `Kept on this device: ${labels.join('; ')} (${megabytes(size)}).`
}

/** A read whose files were gone or wouldn't load; the Text tool looks again at what's held. */
export const MODEL_NOT_LOADED = 'The text recognition model couldn’t be loaded. Download it again from the Text tool.'
export const DOWNLOAD_FAILED = 'The text recognition files couldn’t be downloaded. Check your connection and try again.'
export const DOWNLOAD_CORRUPT = 'The text recognition files didn’t download correctly. Try again.'
/** Storage full: `bytes` is what was being downloaded. */
export const noRoomWords = (bytes: number) =>
  `There isn’t room on this device to keep text recognition (${megabytes(bytes)}).`
