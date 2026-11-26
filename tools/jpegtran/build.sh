#!/bin/sh
# Builds libjpeg-turbo's jpegtran to WebAssembly with Emscripten in Docker, into src/vendor/jpegtran/
# (committed). Run it only to change libjpeg-turbo's version or flags; README.md records both.
set -eu
VERSION=3.2.1
SHA256=c27ad72a68da151177929aa969ae773a2da5ac2af9ce946079314fdac8cece7f
EMSDK=emscripten/emsdk:7.0.1

here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../src/vendor/jpegtran"
mkdir -p "$out"
# MSYS_NO_PATHCONV: Git Bash on Windows would otherwise rewrite the container's paths.
MSYS_NO_PATHCONV=1 docker run --rm -v "$here:/tool:ro" -v "$out:/out" "$EMSDK" sh /tool/inside.sh "$VERSION" "$SHA256"
