# jpegtran

`build.sh` builds libjpeg-turbo's lossless transforms (the code behind jpegtran) to WebAssembly with
Emscripten in Docker, and writes `jpegtran.js`, `jpegtran.wasm`, `LICENSE.md` and `README.ijg` to
`src/vendor/jpegtran/`, which is committed. `src/media/jpegtran.ts` is the only code that loads it. Run it
only to change the version or the flags below, from Git Bash or any POSIX shell with Docker running:

```sh
sh tools/jpegtran/build.sh
```

- **libjpeg-turbo 3.2.1**, the release tarball from GitHub, checked against its SHA-256 (in `build.sh`).
- **Emscripten**: the `emscripten/emsdk:7.0.1` image.
- **Library**: `emcmake cmake -DCMAKE_BUILD_TYPE=Release -DWITH_SIMD=0 -DENABLE_SHARED=0 -DWITH_TURBOJPEG=0
  -DWITH_TOOLS=0 -DWITH_TESTS=0`, target `jpeg-static`. No SIMD (libjpeg-turbo's SIMD is x86 and Arm
  assembly), and only the libjpeg API: no TurboJPEG, cjpeg or djpeg.
- **Module**: `emcc -O3 -flto` of `loupe-jpegtran.c` and libjpeg-turbo's `src/transupp.c` against
  `libjpeg.a`, with `-sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createJpegtran
  -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0`, exporting `_jpegtran`, `_malloc`
  and `_free` and the heap views. The page passes the wasm's bytes in (`wasmBinary`), so it's fetched as a
  Vite asset and precached.

`loupe-jpegtran.c` is one function, `jpegtran(bytes, size, transform, options, crop, &out, &outSize)`,
following `jpegtran.c`'s `main()` over memory: `transform` is transupp.h's `JXFORM_CODE` (none, flips,
transpose, transverse, the three turns), `options` are bits for `-perfect` (1), `-trim` (2) and
`-copy all` (4; otherwise `-copy none`), and `crop` is jpegtran's `-crop` spec (`WxH+X+Y`, in the turned
picture) or empty. It returns NULL, or libjpeg's error message instead of exiting. Two choices differ from
jpegtran's defaults, neither changing a coefficient: a progressive source stays progressive, and Huffman
tables are optimised (`-optimize`).

libjpeg-turbo is under the IJG licence, with BSD-3-Clause and zlib parts (`LICENSE.md`); a build of the
libjpeg API must say "This software is based in part on the work of the Independent JPEG Group." in its
documentation, which About does.
