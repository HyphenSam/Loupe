import { Info, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { APP_NAME, SOURCE_URL } from '@/lib/brand'
import { ICON_BUTTON } from './ui/Button'

/** A library or data set Loupe uses, as CLAUDE.md's Licences section credits it. */
type Credit = { name: string; by?: string; url: string; licence: string; use: string }

// Filled in as each library and data set arrives: ExifTool and zeroperl, jSquash and its codecs,
// libheif, the C2PA SDK, libjpeg-turbo, Leaflet, SunCalc, Natural Earth, GeoNames, OpenStreetMap.
const CREDITS: Credit[] = []

const link = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
)

export function AboutDialog() {
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
          <p className="mt-2 text-[13px] text-ink-soft">
            {APP_NAME}’s own code is available under the MIT or Apache-2.0 licence.
          </p>
          <p className="mt-3 text-[13px]">{link(SOURCE_URL, 'Source code on GitHub')}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
