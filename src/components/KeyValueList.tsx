import type { Row } from '@/lib/summary'

/** DESIGN.md's Key-value list: a label beside its value, with an optional note under the value. */
export function KeyValueList({ rows }: { rows: Row[] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={`${row.label}\n${row.value}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
          <dt className="text-[13px] text-ink-soft">{row.label}</dt>
          <dd className="text-[13px] break-words">
            {row.value}
            {row.note && <span className="mt-0.5 block text-xs text-ink-soft">{row.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
