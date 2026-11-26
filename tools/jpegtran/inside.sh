#!/bin/sh
# Runs inside the emsdk container (build.sh): fetches libjpeg-turbo, checks it, builds the static library
# without SIMD, and links loupe-jpegtran.c with transupp.c into an ES module and its wasm in /out.
set -eu
VERSION="$1"
SHA256="$2"

cd /tmp
wget -q "https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/$VERSION/libjpeg-turbo-$VERSION.tar.gz"
echo "$SHA256  libjpeg-turbo-$VERSION.tar.gz" | sha256sum -c -
tar xzf "libjpeg-turbo-$VERSION.tar.gz"
cd "libjpeg-turbo-$VERSION"

emcmake cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release -DWITH_SIMD=0 -DENABLE_SHARED=0 \
  -DWITH_TURBOJPEG=0 -DWITH_TOOLS=0 -DWITH_TESTS=0
cmake --build build -j"$(nproc)" --target jpeg-static

emcc -O3 -flto -Isrc -Ibuild /tool/loupe-jpegtran.c src/transupp.c build/libjpeg.a \
  -o /out/jpegtran.js \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createJpegtran -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sINCOMING_MODULE_JS_API=wasmBinary,instantiateWasm \
  -sEXPORTED_FUNCTIONS=_jpegtran,_malloc,_free -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU32,UTF8ToString,stringToUTF8,lengthBytesUTF8

cp LICENSE.md /out/LICENSE.md
cp README.ijg /out/README.ijg
