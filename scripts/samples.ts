// The public samples in fixtures/ (SPEC.md section 12): where each comes from, pinned to a commit, and its
// licence. scripts/fixtures.ts fetches them and writes fixtures/SOURCES.md from this table.
//
// libultrahdr publishes no Ultra HDR image under 1 MB, so scripts/fixtures.ts makes one with it instead.

export type Sample = { path: string; url: string; licence: string; note: string }

const C2PA_RS = 'https://raw.githubusercontent.com/contentauth/c2pa-rs/7905e58f443b20d7e102dd9883b6600513a64771'
const C2PA_JS = 'https://raw.githubusercontent.com/contentauth/c2pa-js-legacy/c8c2912e2855c857277c0e1a6535a6db18e13c8e'
const SD_PARSERS = 'https://raw.githubusercontent.com/d3x-at/sd-parsers/0949676c24a5bbaf26ef0aa8c362132b7b27cb5b'
// ExifTool 13.64.
const EXIFTOOL = 'https://raw.githubusercontent.com/exiftool/exiftool/3d7a0538324e9b04aa8930201b007009491321d2'

const C2PA_RS_LICENCE = 'MIT OR Apache-2.0 (the c2pa-rs repository’s licence)'
const C2PA_JS_LICENCE = 'MIT (the c2pa-js repository’s licence)'
const SD_PARSERS_LICENCE = 'MIT (the sd-parsers repository’s licence)'
const EXIFTOOL_LICENCE = 'The same terms as Perl, Artistic or GPL (ExifTool’s distribution)'

const exiftool = (name: string, note: string): Sample => ({
  path: `exiftool/${name}`,
  url: `${EXIFTOOL}/t/images/${name}`,
  licence: EXIFTOOL_LICENCE,
  note,
})

/** sd-parsers' test images: real generators' output, cropped to a few pixels with the metadata kept. */
const sdParsers = (folder: string, name: string, note: string): Sample => ({
  path: `sd-parsers/${name}`,
  url: `${SD_PARSERS}/tests/resources/parsers/${folder}/${name}`,
  licence: SD_PARSERS_LICENCE,
  note,
})

export const SAMPLES: Sample[] = [
  {
    path: 'c2pa/CA.jpg',
    url: `${C2PA_RS}/sdk/tests/fixtures/CA.jpg`,
    licence: C2PA_RS_LICENCE,
    note: 'A valid manifest with actions and an ingredient, signed by a test certificate.',
  },
  {
    path: 'c2pa/XCA.jpg',
    url: `${C2PA_RS}/sdk/tests/fixtures/XCA.jpg`,
    licence: C2PA_RS_LICENCE,
    note: 'CA.jpg with the picture changed after signing: the data hash fails.',
  },
  {
    path: 'c2pa/genai-actions-v2.jpg',
    url: `${C2PA_JS}/tools/testing/fixtures/images/genai-actions-v2.jpg`,
    licence: C2PA_JS_LICENCE,
    note: 'Actions with the trainedAlgorithmicMedia and compositeWithTrainedAlgorithmicMedia source types.',
  },
  {
    path: 'c2pa/composite-dst.jpg',
    url: `${C2PA_JS}/tools/testing/fixtures/images/composite-dst.jpg`,
    licence: C2PA_JS_LICENCE,
    note: 'Edited with generative AI: compositeWithTrainedAlgorithmicMedia only.',
  },
  sdParsers('AUTOMATIC1111', 'automatic1111_cropped.png', 'AUTOMATIC1111: a `parameters` text chunk.'),
  sdParsers('AUTOMATIC1111', 'automatic1111_cropped.jpg', 'AUTOMATIC1111: EXIF UserComment.'),
  sdParsers('AUTOMATIC1111', 'automatic1111_stealth.png', 'The A1111 stealth extension: `stealth_pngcomp` in alpha.'),
  sdParsers('ComfyUI', 'img2img_cropped.png', 'ComfyUI: `prompt` and `workflow` text chunks, image to image.'),
  sdParsers('Fooocus', 'fooocus1_cropped.png', 'Fooocus 2.4: `parameters` JSON and a `fooocus_scheme` chunk.'),
  sdParsers('InvokeAI', 'invokeai_imeta1.png', 'InvokeAI 3: an `invokeai_metadata` chunk.'),
  sdParsers('InvokeAI', 'invokeai_sdmeta1.png', 'InvokeAI 2.3: `sd-metadata` and `Dream` chunks.'),
  sdParsers('InvokeAI', 'invokeai_dream1.png', 'Early InvokeAI: a `Dream` chunk only.'),
  sdParsers(
    'NovelAI',
    'novelai1_cropped.png',
    'NovelAI (2022): `Software`, `Source`, `Description` and `Comment` chunks.',
  ),
  exiftool('Apple.jpg', 'Apple maker notes.'),
  exiftool('Canon.jpg', 'Canon maker notes.'),
  exiftool('Canon1DmkIII.jpg', 'Canon EOS-1D Mark III maker notes.'),
  exiftool('Casio.jpg', 'Casio maker notes.'),
  exiftool('FujiFilm.jpg', 'Fujifilm maker notes.'),
  exiftool('GoPro.jpg', 'GoPro metadata.'),
  exiftool('Kodak.jpg', 'Kodak maker notes.'),
  exiftool('Minolta.jpg', 'Minolta maker notes.'),
  exiftool('Nikon.jpg', 'Nikon maker notes.'),
  exiftool('NikonD2Hs.jpg', 'Nikon D2Hs maker notes.'),
  exiftool('NikonD70.jpg', 'Nikon D70 maker notes.'),
  exiftool('Olympus.jpg', 'Olympus maker notes.'),
  exiftool('OlympusE1.jpg', 'Olympus E-1 maker notes.'),
  exiftool('Panasonic.jpg', 'Panasonic maker notes.'),
  exiftool('Pentax.jpg', 'Pentax maker notes.'),
  exiftool('Ricoh.jpg', 'Ricoh maker notes.'),
  exiftool('Sigma.jpg', 'Sigma maker notes.'),
  exiftool('Sony.jpg', 'Sony maker notes.'),
  exiftool('CanonRaw.cr2', 'Canon CR2 raw, metadata only.'),
  exiftool('CanonRaw.cr3', 'Canon CR3 raw, metadata only.'),
  exiftool('CanonRaw.crw', 'Canon CRW raw, metadata only.'),
  exiftool('DNG.dng', 'Adobe DNG raw, metadata only.'),
  exiftool('FujiFilm.raf', 'Fujifilm RAF raw, metadata only.'),
  exiftool('Nikon.nef', 'Nikon NEF raw, metadata only.'),
  exiftool('Panasonic.rw2', 'Panasonic RW2 raw, metadata only.'),
  exiftool('PhaseOne.iiq', 'Phase One IIQ raw, metadata only.'),
  exiftool('Sigma.x3f', 'Sigma X3F raw, metadata only.'),
]

/** fixtures/SOURCES.md. */
export function sourcesMarkdown(): string {
  const rows = SAMPLES.map((s) => `| \`${s.path}\` | ${s.note} | ${s.licence} | <${s.url}> |`)
  return [
    '# Fixture sources',
    '',
    'Made by `pnpm fixtures` (`scripts/fixtures.ts`) from `scripts/samples.ts`; don’t edit by hand.',
    '',
    'Every file at the top of `fixtures/` is generated by `scripts/fixtures.ts` and is covered by Loupe’s own',
    'licence. The public samples below are copied unmodified, each under its own licence.',
    '',
    '| File | What it is | Licence | Source |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}
