/** What the user reads when something fails (SPEC.md section 7). Loupe's own messages are `Said`; anything else is
 * a library's, kept after "Something went wrong:". */

/** An error whose message Loupe wrote for the user. */
export class Said extends Error {}

/** Browsers' words for a fetch that failed, and what a wasm file answered by the page instead (an old tab after a
 * deploy: the hashed file is gone and the host serves `index.html`) says when compiled. */
const NOT_LOADED =
  /failed to fetch|networkerror|load failed|mime type|magic word|fetching of the wasm failed|importing a module script failed/i

/** Whether `error` is a library's code or wasm that couldn't be fetched or compiled. */
export function notLoaded(error: unknown): boolean {
  if (error instanceof Said) return false
  if (error instanceof Error && error.name === 'CompileError') return true
  return NOT_LOADED.test(error instanceof Error ? error.message : String(error))
}

/** `task`, with a library that couldn't be loaded named: "The AVIF encoder couldn’t be loaded." Nothing is
 * remembered, so the next try loads it again. */
export async function loading<T>(what: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    if (!notLoaded(error)) throw error
    throw new Said(`${what} couldn’t be loaded. Check your connection, or reload the page if Loupe was updated.`)
  }
}

/** The sentence for an error: Loupe's own as it is, a library's after "Something went wrong:". */
export function worded(error: unknown): string {
  if (error instanceof Said) return error.message
  return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`
}
