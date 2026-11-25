import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'

/** A button that copies text and says "Copied" for a moment (DESIGN.md's Key-value list). */
export function CopyButton({
  text,
  label,
  variant = 'ghost',
  size = 'sm',
}: {
  text: () => string
  label: string
  variant?: 'ghost' | 'secondary'
  size?: 'sm' | 'md'
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Button
      variant={variant}
      size={size}
      onClick={() =>
        navigator.clipboard.writeText(text()).then(() => {
          setCopied(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 1500)
        })
      }
    >
      {copied ? <Check aria-hidden="true" strokeWidth={2} /> : <Copy aria-hidden="true" strokeWidth={1.75} />}
      {copied ? 'Copied' : label}
    </Button>
  )
}
