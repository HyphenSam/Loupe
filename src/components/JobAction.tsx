import { useEffect, useId, useRef } from 'react'
import type { JobState, Running } from '@/hooks/useJob'
import { isLossless, type Planned } from '@/lib/plans/plan'
import { LosslessBadge } from './LosslessBadge'
import { Button } from './ui/Button'

// On narrow screens the action (or the progress in its place) is fixed to the foot of the screen
// (DESIGN.md); what explains it stays in the settings, above where the bar sits once scrolled down.
const BAR =
  'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:border-t max-lg:border-line max-lg:bg-panel max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]'

/** The foot of an edit tool's settings (Moviola's): what stops the job, the primary action with its badge
 * and caption, or the running job's progress in its place. */
export function JobAction({
  planned,
  verb,
  state,
  onStart,
  onCancel,
}: {
  planned: Planned
  verb: string
  /** Where the job slot stands: the action is there only while it's idle (`useJob`). */
  state: JobState
  onStart: () => void
  onCancel: () => void
}) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const { phase } = state
  const busy = phase === 'running' || phase === 'cancelling'
  const was = useRef(phase)
  // The action and Cancel replace each other as a job starts and ends. Focus on a button that went falls to
  // the page; put it on the one that came instead, so the keyboard doesn't lose its place (SPEC.md section 7).
  useEffect(() => {
    if (was.current === phase) return
    was.current = phase
    if (document.activeElement && document.activeElement !== document.body) return
    box.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [phase])

  const problems = !busy && planned.problems.length > 0 && planned.problems
  return (
    <div ref={box} className="flex flex-col gap-2.5">
      {/* There before any problem is, so a problem that a change of settings brings is announced. */}
      <div id={`${id}-problems`} aria-live="polite" className="empty:hidden">
        {problems && (
          <ul className="flex flex-col gap-1 text-[13px] text-danger">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      {phase === 'running' ? (
        <div className={BAR}>
          <JobProgress job={state} onCancel={onCancel} />
        </div>
      ) : phase === 'cancelling' ? (
        // Until the new worker holds the file again.
        <div className={BAR}>
          <p role="status" className="py-1.5 text-[13px] text-ink-soft">
            Cancelling…
          </p>
        </div>
      ) : (
        <>
          <div className={`flex items-center gap-3 ${BAR}`}>
            <Button
              variant="primary"
              disabled={!planned.plan || phase !== 'idle'}
              aria-describedby={problems ? `${id}-problems` : undefined}
              onClick={onStart}
            >
              {verb}
            </Button>
            {planned.plan && <LosslessBadge lossless={isLossless(planned.plan)} />}
          </div>
          {planned.caption && <p className="text-xs text-ink-soft">{planned.caption}</p>}
        </>
      )}
    </div>
  )
}

/** Replaces the primary action while a job runs: a magenta bar filling left to right (pulsing while the job
 * can't say how far it is), the percentage, and Cancel. */
function JobProgress({ job, onCancel }: { job: Running; onCancel: () => void }) {
  const { fraction } = job
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div
          role="progressbar"
          aria-label={`${job.doing} ${job.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fraction === null ? undefined : Math.floor(fraction * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-sunken"
        >
          <div
            className={
              fraction === null ? 'h-full w-full animate-pulse bg-accent' : 'h-full bg-accent transition-[width]'
            }
            style={fraction === null ? undefined : { width: `${fraction * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">
          {fraction === null ? `${job.doing}…` : `${Math.floor(fraction * 100)}%`}
        </p>
      </div>
      <Button onClick={onCancel}>Cancel</Button>
    </div>
  )
}
