import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A control's outline, as NumberInput's: a hairline that turns the focus colour while it has focus. */
export const FIELD =
  'rounded-control bg-panel px-2.5 text-[13px] shadow-[0_0_0_1px_var(--color-line-strong)] focus-within:shadow-[0_0_0_1.5px_var(--color-focus)]'

/** A labelled text field (or several lines of it), with a caption under it that also describes it. `after`
 * sits beside the field (a small button). */
export function TextField({
  label,
  value,
  onChange,
  hint,
  lines = 1,
  inputMode,
  placeholder,
  after,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  /** More than one makes it a textarea of that many rows. */
  lines?: number
  inputMode?: 'text' | 'decimal'
  placeholder?: string
  after?: ReactNode
}) {
  const id = useId()
  const props = {
    id,
    value,
    placeholder,
    'aria-describedby': hint ? `${id}-hint` : undefined,
    className: 'w-full min-w-0 bg-transparent outline-none placeholder:text-ink-faint focus-visible:outline-none',
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <div className="flex items-start gap-2">
        <div className={cn(FIELD, 'flex min-w-0 flex-1', lines > 1 ? 'py-1.5' : 'h-8 items-center')}>
          {lines > 1 ? (
            <textarea
              {...props}
              rows={lines}
              onChange={(e) => onChange(e.target.value)}
              className={cn(props.className, 'resize-y')}
            />
          ) : (
            <input {...props} type="text" inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
        {after}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  )
}
