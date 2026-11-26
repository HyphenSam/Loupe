import { Info, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { dayWords } from '@/lib/ai/c2pa'
import { APP_NAME, SOURCE_URL } from '@/lib/brand'
import { ICON_BUTTON } from './ui/Button'

/** A library or data set Loupe uses, as CLAUDE.md's Licences section credits it. */
type Credit = { name: string; by?: string; url: string; licence: string; use: string }

// Filled in as each library and data set arrives; still to come: jSquash's encoders.
const CREDITS: Credit[] = [
  {
    name: 'ExifTool',
    by: 'Phil Harvey',
    url: 'https://exiftool.org/',
    licence: 'the same terms as Perl: Artistic or GPL',
    use: 'reads every tag',
  },
  {
    name: '@uswriting/exiftool',
    url: 'https://github.com/uswriting/exiftool',
    licence: 'Apache-2.0',
    use: 'runs ExifTool in the browser',
  },
  {
    name: 'zeroperl',
    by: '6over3',
    url: 'https://github.com/6over3/zeroperl-ts',
    licence: 'Apache-2.0, patched to load in a Web Worker',
    use: 'Perl compiled to WebAssembly, which ExifTool runs on',
  },
  { name: 'Perl', url: 'https://www.perl.org/', licence: 'Artistic or GPL', use: 'inside zeroperl' },
  {
    name: 'jSquash',
    url: 'https://github.com/jamsinclair/jSquash',
    licence: 'Apache-2.0',
    use: 'Squoosh’s codecs as WebAssembly, for decoding pictures',
  },
  {
    name: 'MozJPEG',
    url: 'https://github.com/mozilla/mozjpeg',
    licence: 'IJG, BSD-3-Clause and zlib',
    use: 'decodes JPEG',
  },
  {
    name: 'libwebp',
    url: 'https://chromium.googlesource.com/webm/libwebp',
    licence: 'BSD-3-Clause',
    use: 'decodes WebP',
  },
  { name: 'libjxl', url: 'https://github.com/libjxl/libjxl', licence: 'BSD-3-Clause', use: 'decodes JPEG XL' },
  {
    name: 'png',
    by: 'the image-rs project',
    url: 'https://github.com/image-rs/image-png',
    licence: 'MIT or Apache-2.0',
    use: 'decodes PNG',
  },
  {
    name: 'libheif',
    by: 'struktur AG',
    url: 'https://github.com/strukturag/libheif',
    licence: 'LGPL-3.0, its WebAssembly served as a separate file so it can be replaced',
    use: 'decodes HEIC and HEIF, built for the web by libheif-js',
  },
  {
    name: 'libde265',
    by: 'struktur AG',
    url: 'https://github.com/strukturag/libde265',
    licence: 'LGPL-3.0',
    use: 'the HEVC decoder inside libheif',
  },
  {
    name: 'libjpeg-turbo',
    by: 'the libjpeg-turbo Project',
    url: 'https://libjpeg-turbo.org/',
    licence: 'the IJG licence, with BSD-3-Clause and zlib parts',
    use: 'jpegtran, which turns, flips and crops JPEGs without re-encoding them',
  },
  {
    name: 'GeoNames',
    url: 'https://www.geonames.org/',
    licence: 'CC BY 4.0',
    use: 'places of 1,000 people or more and their regions, for naming where a picture was taken',
  },
  {
    name: 'Natural Earth',
    url: 'https://www.naturalearthdata.com/',
    licence: 'public domain',
    use: 'the country outlines at 1:50m',
  },
  {
    name: 'world-atlas',
    by: 'Mike Bostock',
    url: 'https://github.com/topojson/world-atlas',
    licence: 'ISC',
    use: 'Natural Earth’s outlines as TopoJSON',
  },
  {
    name: 'TopoJSON Client',
    by: 'Mike Bostock',
    url: 'https://github.com/topojson/topojson-client',
    licence: 'ISC',
    use: 'reads the outlines',
  },
  {
    name: 'Leaflet',
    by: 'Volodymyr Agafonkin',
    url: 'https://leafletjs.com/',
    licence: 'BSD-2-Clause',
    use: 'draws the Location map',
  },
  {
    name: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org/copyright',
    licence: '© OpenStreetMap contributors, its data under the ODbL',
    use: 'the map tiles, fetched while the Location map shows and you’re online, and never kept',
  },
  {
    name: 'C2PA SDK',
    by: 'the Content Authenticity Initiative',
    url: 'https://github.com/contentauth/c2pa-js',
    licence: 'MIT; its core, c2pa-rs, MIT or Apache-2.0',
    use: 'reads and verifies Content Credentials, as @contentauth/c2pa-web',
  },
  {
    name: 'C2PA trust list',
    by: 'the C2PA',
    url: 'https://github.com/c2pa-org/conformance-public/tree/main/trust-list',
    licence: 'published for validators',
    use: 'the certificate authorities whose signatures Content Credentials are checked against',
  },
  {
    name: 'Interim trust list',
    by: 'the Content Authenticity Initiative',
    url: 'https://opensource.contentauthenticity.org/docs/conformance/trust-lists',
    licence: 'published for validators',
    use: 'the signers of Content Credentials made before the C2PA trust list, frozen in January 2026',
  },
  {
    name: 'SunCalc',
    by: 'Volodymyr Agafonkin',
    url: 'https://github.com/mourner/suncalc',
    licence: 'BSD-2-Clause',
    use: 'works out where the sun was',
  },
]

const link = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
)

/** `trustBundledOn`: the day the bundled trust lists were fetched ('2026-11-25'), once known. */
export function AboutDialog({ trustBundledOn }: { trustBundledOn: string | null }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger aria-label="About" className={ICON_BUTTON}>
        <Info strokeWidth={1.75} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel bg-panel p-6 shadow-float outline-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-base font-semibold">{APP_NAME}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-m-1 rounded-control p-1 text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm text-ink-soft">
            Shows what a picture’s file says about it: the camera, where and when it was taken, whether it says it was
            made with AI, and what it gives away about you. Crops, redacts, adjusts and converts it too. Everything runs
            in your browser on your own device, every action says whether it is lossless or re-encodes, and once
            installed it works without a connection.
          </Dialog.Description>

          <h3 className="mt-6 text-[13px] font-semibold">What leaves your device</h3>
          {/* SPEC.md section 10, in two sentences. */}
          <p className="mt-2 text-[13px] text-ink-soft">
            {APP_NAME} never sends your pictures anywhere: it has no server, analytics, web fonts or CDNs. It fetches
            only OpenStreetMap’s map tiles while the Location map shows and the list of sister sites for the app
            launcher, and a picture reaches SynthID or a reverse image search only if you press that site’s button and
            paste it there yourself.
          </p>

          <h3 className="mt-6 text-[13px] font-semibold">Software and data</h3>
          {CREDITS.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-soft">
              {CREDITS.map((credit) => (
                <li key={credit.name}>
                  {link(credit.url, credit.name)}
                  {credit.by && ` by ${credit.by}`} ({credit.licence}): {credit.use}
                </li>
              ))}
            </ul>
          )}
          {/* libjpeg-turbo's LICENSE.md: binaries built on the libjpeg API must say this in their documentation. */}
          <p className="mt-2 text-[13px] text-ink-soft">
            This software is based in part on the work of the Independent JPEG Group.
          </p>
          {trustBundledOn && (
            <p className="mt-2 text-[13px] text-ink-soft">
              Content Credentials are checked against the trust lists bundled on {dayWords(trustBundledOn)}, without
              going online.
            </p>
          )}
          <p className="mt-2 text-[13px] text-ink-soft">
            {APP_NAME}’s own code is available under the MIT or Apache-2.0 licence.
          </p>
          <p className="mt-3 text-[13px]">{link(SOURCE_URL, 'Source code on GitHub')}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
