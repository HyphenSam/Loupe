import {
  BadgeCheck,
  BadgeQuestionMark,
  BadgeX,
  CalendarClock,
  ChevronRight,
  CircleDashed,
  MapPin,
  Shield,
  Sparkles,
  Tag,
  type LucideIcon,
} from 'lucide-react'
import type { Finding as FindingData, Rests } from '@/lib/summary'

const ICONS: Record<string, LucideIcon> = { taken: CalendarClock, location: MapPin, ai: Sparkles, privacy: Shield }

// A seal for a signature (ticked when verified, questioned when the signer isn't recognised, crossed when it
// doesn't verify), a tag for what the file states, a dashed circle for nothing found.
const RESTS: Record<Rests, { icon: LucideIcon; words: string }> = {
  signed: { icon: BadgeCheck, words: 'Signed and verified.' },
  unrecognised: { icon: BadgeQuestionMark, words: 'Signed by a signer Loupe doesn’t recognise.' },
  broken: { icon: BadgeX, words: 'The signature doesn’t verify.' },
  stated: { icon: Tag, words: 'Stated in the file’s metadata; anyone can add or remove this.' },
  nothing: { icon: CircleDashed, words: 'Nothing found in the file’s metadata.' },
}

/** How a tool says what it found (DESIGN.md's Finding): an icon, the verdict, a sentence of detail, and
 * what it rests on, in words and an icon of its own. A finding with a tool opens it. */
export function Finding({ finding, onOpen }: { finding: FindingData; onOpen?: () => void }) {
  const Icon = ICONS[finding.id] ?? Tag
  const rests = RESTS[finding.rests]
  const body = (
    <>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-soft" strokeWidth={1.75} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="text-sm font-semibold">{finding.verdict}</span>
        {finding.detail && <span className="text-sm text-ink">{finding.detail}</span>}
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
          <rests.icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
          {finding.restsWords ?? rests.words}
        </span>
      </span>
    </>
  )
  const frame = 'flex w-full gap-2.5 rounded-control bg-panel p-3 shadow-[0_0_0_1px_var(--color-line)]'
  return (
    <li>
      {onOpen ? (
        <button type="button" onClick={onOpen} className={`${frame} transition-colors duration-150 hover:bg-sunken`}>
          {body}
          <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-soft" strokeWidth={1.75} />
        </button>
      ) : (
        <div className={frame}>{body}</div>
      )}
    </li>
  )
}
