import { useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './ui/Button'
import { CopyButton } from './ui/CopyButton'

/** Prompts longer than this, or with more lines, show four lines until expanded. */
const LONG = 240

/** A generator's prompt (SPEC.md 6.3): its label and a copy button, the text with its line breaks, and
 * "Show all" when it's long. */
export function PromptText({
  label,
  text,
  copyLabel,
  copyName,
}: {
  label: string
  text: string
  copyLabel: string
  copyName?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const long = text.length > LONG || text.split('\n').length > 4
  return (
    <section aria-labelledby={`${id}-label`} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <h4 id={`${id}-label`} className="text-[13px] text-ink-soft">
          {label}
        </h4>
        <CopyButton text={() => text} label={copyLabel} name={copyName} />
      </div>
      <p
        id={`${id}-text`}
        className={cn('text-[13px] break-words whitespace-pre-wrap', long && !open && 'line-clamp-4')}
      >
        {text}
      </p>
      {long && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 self-start"
          aria-expanded={open}
          aria-controls={`${id}-text`}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : 'Show all'}
        </Button>
      )}
    </section>
  )
}
