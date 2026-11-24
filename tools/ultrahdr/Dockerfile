# libultrahdr's ultrahdr_app, for `pnpm fixtures` (scripts/fixtures.ts): it encodes the small Ultra HDR
# fixture, since libultrahdr publishes no sample under 1 MB. Built with UHDR_WRITE_XMP so the gain map is
# described in hdrgm XMP as well as ISO 21496-1, as phones write it. Pinned to a commit; Docker caches
# the build, so only the first run compiles.
FROM alpine:3.24
RUN apk add --no-cache build-base cmake git libjpeg-turbo-dev
ARG COMMIT=c6fd15cdb2d05d3aaed84b817e4c4a274a4ce600
RUN git init -q /src && cd /src \
  && git fetch -q --depth 1 https://github.com/google/libultrahdr "$COMMIT" && git checkout -q FETCH_HEAD \
  && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DUHDR_BUILD_TESTS=OFF -DUHDR_BUILD_DEPS=OFF \
    -DUHDR_WRITE_XMP=ON \
  && cmake --build build -j"$(nproc)" --target ultrahdr_app \
  && cp build/ultrahdr_app /usr/local/bin/
WORKDIR /w
ENTRYPOINT ["ultrahdr_app"]
