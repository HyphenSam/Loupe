# ImageMagick with the Noto fonts, for `pnpm fixtures` (scripts/fixtures.ts): it renders the Text tool's fixtures,
# whose Chinese, Japanese and Korean need Noto Sans CJK, which this machine doesn't have. Alpine pinned to a release.
FROM alpine:3.24
RUN apk add --no-cache imagemagick font-noto font-noto-cjk
WORKDIR /w
ENTRYPOINT ["magick"]
