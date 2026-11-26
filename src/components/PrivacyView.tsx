import { useState } from 'react'
import type { JobOptions, JobState } from '@/hooks/useJob'
import type { ImageInfo } from '@/lib/info'
import type { Plan } from '@/lib/plans/plan'
import { planPrivacy, quickPick, type QuickPick } from '@/lib/plans/privacy'
import { leftAfter, PRIVACY_GROUPS, type PrivacyFinding } from '@/lib/privacy'
import { JobAction } from './JobAction'
import { Button } from './ui/Button'
import { Checkbox } from './ui/Checkbox'

const PICKS: { id: QuickPick; label: string }[] = [
  { id: 'everything', label: 'Everything' },
  { id: 'location', label: 'Location only' },
]

/** Privacy (SPEC.md 6.4): what in the file could identify someone, grouped, each ticked to be removed, and
 * Remove. `findings` is null while the Content Credentials are read, since they're one of them. */
export function PrivacyView({
  info,
  findings,
  job,
  onRun,
  onCancel,
}: {
  info: ImageInfo
  findings: PrivacyFinding[] | null
  job: JobState
  onRun: (plan: Plan, options: JobOptions) => void
  onCancel: () => void
}) {
  if (!findings) return <p className="text-[13px] text-ink-soft">Reading Content Credentials…</p>
  return <Findings info={info} findings={findings} job={job} onRun={onRun} onCancel={onCancel} />
}

function Findings({
  info,
  findings,
  job,
  onRun,
  onCancel,
}: {
  info: ImageInfo
  findings: PrivacyFinding[]
  job: JobState
  onRun: (plan: Plan, options: JobOptions) => void
  onCancel: () => void
}) {
  // Every finding is ticked to begin with.
  const [ticked, setTicked] = useState(() => findings.map((f) => f.id))
  const stealth = info.generators.filter((g) => g.where.some((w) => w.startsWith('the lowest bits')))
  const stealthNote = stealth.map(
    (g) =>
      `${g.name}’s settings are also hidden in the picture’s pixels. They stay: removing them would change the picture.`,
  )

  if (!findings.length)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px]">Nothing in this file identifies a person or a place.</p>
        {stealthNote.map((n) => (
          <p key={n} className="text-xs text-ink-soft">
            {n}
          </p>
        ))}
      </div>
    )

  const planned = planPrivacy(info, findings, ticked)
  const toggle = (id: string, on: boolean) =>
    setTicked((list) =>
      on ? findings.map((f) => f.id).filter((f) => f === id || list.includes(f)) : list.filter((f) => f !== id),
    )
  const same = (ids: string[]) => ids.length === ticked.length && ids.every((id) => ticked.includes(id))
  const hdrKept = info.kinds.includes('ultra-hdr') && !same(quickPick(findings, 'everything'))

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap gap-2">
        {PICKS.map((pick) => {
          const ids = quickPick(findings, pick.id)
          return (
            <Button
              key={pick.id}
              size="sm"
              aria-pressed={same(ids)}
              disabled={!ids.length}
              className="aria-pressed:bg-sunken"
              onClick={() => setTicked(ids)}
            >
              {pick.label}
            </Button>
          )
        })}
      </div>

      {PRIVACY_GROUPS.map((group) => {
        const rows = findings.filter((f) => f.group === group.id)
        if (!rows.length) return null
        return (
          <section key={group.id} role="group" aria-labelledby={`privacy-${group.id}`} className="flex flex-col gap-1">
            <h3 id={`privacy-${group.id}`} className="text-[13px] font-medium text-ink-soft">
              {group.title}
            </h3>
            {rows.map((f) => (
              <Checkbox
                key={f.id}
                checked={ticked.includes(f.id)}
                onChange={(on) => toggle(f.id, on)}
                label={
                  <>
                    {f.label}{' '}
                    <span title={f.full} className="break-words text-ink-soft">
                      {f.value}
                    </span>
                  </>
                }
                hint={f.note}
              />
            ))}
          </section>
        )
      })}

      <div className="flex flex-col gap-1 text-xs text-ink-soft">
        <p>
          Always kept: the colour profile and the picture’s orientation.
          {hdrKept && ' The HDR gain map is kept.'}
        </p>
        {stealthNote.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </div>

      <JobAction
        planned={planned}
        verb="Remove"
        state={job}
        onCancel={onCancel}
        onStart={() =>
          planned.plan &&
          onRun(planned.plan, {
            doing: 'Removing',
            size: info.size,
            // What the result still holds of what was ticked, read from its own tags.
            notes: (result) => {
              if (!result.info) return ['Loupe couldn’t read the result back to check it.']
              const left = leftAfter(ticked, info, result.info)
              return left.length ? left : ['Nothing identifying is left.']
            },
            png: (blob, result) =>
              result.info && result.info.format !== 'raw' && result.info.format !== 'tiff'
                ? { blob, format: result.info.format, orientation: result.info.orientation }
                : null,
          })
        }
      />
    </div>
  )
}
