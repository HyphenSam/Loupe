import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ImageInfo } from '@/lib/info'
import { locationView } from '@/lib/location'
import { KeyValueList } from './KeyValueList'
import { CopyButton } from './ui/CopyButton'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`location-${id}`} className="flex flex-col gap-2.5">
      <h3 id={`location-${id}`} className="text-[13px] font-medium text-ink-soft">
        {title}
      </h3>
      {children}
    </section>
  )
}

const Caption = ({ children }: { children: ReactNode }) => <p className="text-xs text-ink-soft">{children}</p>

function Coordinate({ value, name }: { value: string; name: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-xs break-all">{value}</span>
      <CopyButton label="Copy" name={name} text={() => value} />
    </div>
  )
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text hover:underline"
    >
      <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      {children}
    </a>
  )
}

/** Location (SPEC.md 6.2): the place, coordinates, direction, sun, links elsewhere and the other location
 * fields in the metadata. Read-only. The map joins the stage in phase 4. */
export function LocationView({ info }: { info: ImageInfo }) {
  const view = locationView(info)
  if (!view) return null
  return (
    <div className="flex flex-col gap-7">
      <Section id="place" title="Place">
        {view.place ? (
          <p className="text-sm font-semibold">{view.place}</p>
        ) : (
          <p className="text-[13px]">Loupe couldn’t load its places data, so the place isn’t named.</p>
        )}
        <Caption>Worked out on this device from GeoNames’ places of 1,000 people or more.</Caption>
      </Section>

      <Section id="coordinates" title="Coordinates">
        <div className="flex flex-col gap-1">
          <Coordinate value={view.decimal} name="Copy decimal coordinates" />
          <Coordinate value={view.dms} name="Copy degrees, minutes and seconds" />
        </div>
        {view.rows.length > 0 && <KeyValueList rows={view.rows} />}
      </Section>

      {view.direction && (
        <Section id="direction" title="Direction">
          <p className="text-[13px]">{view.direction}</p>
          {view.fieldOfView !== null && (
            <Caption>About {Math.round(view.fieldOfView)}° across, from the 35 mm-equivalent focal length.</Caption>
          )}
        </Section>
      )}

      <Section id="sun" title="Sun">
        <p className="text-[13px]">{view.sun.words}</p>
        {view.sun.caption && <Caption>{view.sun.caption}</Caption>}
      </Section>

      <Section id="elsewhere" title="Open elsewhere">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href={view.links.osm}>OpenStreetMap</Link>
          <Link href={view.links.google}>Google Maps</Link>
        </div>
        <Caption>Opens in a new tab. The site you open sees this location.</Caption>
      </Section>

      {view.also.length > 0 && (
        <Section id="also" title="Also in the metadata">
          <KeyValueList rows={view.also} />
          <Caption>Written into the file by a person or an app, so it can disagree with the GPS.</Caption>
        </Section>
      )}
    </div>
  )
}
