/** Whether this browser can run Loupe at all: ExifTool, the codecs and the C2PA SDK are WebAssembly, and
 * they run in Web Workers (SPEC.md section 2). `scope` is for tests. */
export function isSupported(scope: { WebAssembly?: unknown; Worker?: unknown } = globalThis): boolean {
  const wasm = scope.WebAssembly as { instantiate?: unknown } | undefined
  return typeof wasm === 'object' && typeof wasm?.instantiate === 'function' && typeof scope.Worker === 'function'
}
