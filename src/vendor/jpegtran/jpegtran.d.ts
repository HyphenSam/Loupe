// Types for the Emscripten module tools/jpegtran/build.sh writes beside this file.
export type JpegtranModule = {
  /** Returns 0, with the result's pointer and length at `out` and `outSize`, or a pointer to the error. */
  _jpegtran(
    input: number,
    size: number,
    transform: number,
    options: number,
    crop: number,
    out: number,
    outSize: number,
  ): number
  _malloc(size: number): number
  _free(pointer: number): void
  HEAPU8: Uint8Array
  HEAPU32: Uint32Array
  UTF8ToString(pointer: number): string
  stringToUTF8(text: string, pointer: number, max: number): void
  lengthBytesUTF8(text: string): number
}

export default function createJpegtran(options: { wasmBinary?: ArrayBuffer }): Promise<JpegtranModule>
