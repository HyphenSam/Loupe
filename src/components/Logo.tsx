import { useId } from 'react'

/** The mark: a lens ring over the corner of a print. Same drawing and colours as public/icon.svg, so it
 * matches the installed icon in both themes. The clip ids are made unique, as the page may hold two. */
export function Logo({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <defs>
        <clipPath id={`${id}-tile`}>
          <rect width="32" height="32" rx="8" />
        </clipPath>
        <clipPath id={`${id}-glass`}>
          <circle cx="19" cy="13" r="6" />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="8" fill="#1c1c1f" />
      <g fill="#a892f4" clipPath={`url(#${id}-tile)`}>
        <rect x="-3" y="13" width="22" height="22" rx="2" opacity="0.4" />
        <rect x="-3" y="13" width="22" height="22" rx="2" opacity="0.5" clipPath={`url(#${id}-glass)`} />
      </g>
      <circle cx="19" cy="13" r="7.25" fill="none" stroke="#a892f4" strokeWidth="2.5" />
    </svg>
  )
}
