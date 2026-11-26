# Text recognition files

Made by `pnpm ocr` (`scripts/ocr.ts`), which also writes `src/lib/ocr/models.json`. Each file's name carries the
start of its SHA-256. None of them is precached: the Text tool downloads them when the user asks (SPEC.md 6.12).

## PaddleOCR's models

PaddleOCR (https://github.com/PaddlePaddle/PaddleOCR) by the PaddlePaddle authors, Apache-2.0. PaddlePaddle
publishes the models as ONNX on Hugging Face, so they're used as published. Each recogniser's character list and
the detector's thresholds are taken from its `inference.yml`.

| File | Repository (huggingface.co/PaddlePaddle/…) | Commit | Reads |
|---|---|---|---|
| `ppocrv6-tiny-det.*.onnx` | `PP-OCRv6_tiny_det_onnx` | `2ba1506c0380b8f0b03dd142459aac66d4421f6c` | finds the lines, for every script |
| `ppocrv6-small-rec.*` | `PP-OCRv6_small_rec_onnx` | `b8f84f0b80c529de40b4fbb3544b84fa7233a513` | English and other languages in Latin letters, simplified and traditional Chinese, Japanese, pinyin |
| `ppocrv5-mobile-rec-korean.*` | `korean_PP-OCRv5_mobile_rec_onnx` | `5c6f574b8e2230adf4287b33e736d71b9fabd28e` | Korean, English |
| `ppocrv5-mobile-rec-cyrillic.*` | `cyrillic_PP-OCRv5_mobile_rec_onnx` | `2cef88145434beb8afa9dd82d77d799eb1ad7b29` | Russian, Ukrainian, Belarusian, Bulgarian, Serbian, Macedonian, Kazakh and 26 more, English |

PP-OCRv6 (June 2026) has no Korean or Cyrillic recogniser: its small recogniser's 18,708 characters hold Han,
kana, about 400 accented Latin letters and Greek, but no Hangul or Cyrillic. Its accented letters cover French,
German, Spanish, Portuguese, Polish, Czech, Turkish, Romanian, Hungarian, the Nordic and Baltic languages and
Croatian, as PP-OCRv5's Latin recogniser does; neither has Vietnamese's stacked marks. The Korean and Cyrillic
languages are those PaddleOCR's documentation lists for each model
(`docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md`, November 2026).

## ONNX Runtime

`ort-wasm-simd-threaded.*.wasm` is ONNX Runtime Web's plain WebAssembly build (SIMD and threads, no WebGPU),
copied from the installed `onnxruntime-web` (1.31.1), MIT, © Microsoft Corporation. It must match the package's
JavaScript, so `pnpm ocr` runs again after every update of `onnxruntime-web`; `scripts/ocr.test.ts` fails until it
has.
