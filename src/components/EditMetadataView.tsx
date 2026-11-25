import { BadgeAlert } from 'lucide-react'
import type { JobOptions, JobState } from '@/hooks/useJob'
import type { ImageInfo } from '@/lib/info'
import {
  changedFields,
  destinations,
  fieldsOf,
  notWritten,
  OFFSETS,
  planEditMetadata,
  type MetadataFields,
} from '@/lib/plans/edit-metadata'
import type { Plan } from '@/lib/plans/plan'
import { JobAction } from './JobAction'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'
import { FIELD, TextField } from './ui/TextField'

const LOCATIONS = [
  { value: 'keep' as const, label: 'Keep' },
  { value: 'remove' as const, label: 'Remove' },
  { value: 'set' as const, label: 'Set' },
]

/** Edit metadata (SPEC.md 6.7): the common fields, starting with the file's values, and Save changes, which
 * writes only those changed. The form is held by the App, so it outlasts a visit to another tool and the map can
 * place the pin. `signed`: the file has Content Credentials, which any change breaks. */
export function EditMetadataView({
  info,
  fields,
  onFields,
  signed,
  job,
  onRun,
  onCancel,
  onPrivacy,
}: {
  info: ImageInfo
  fields: MetadataFields
  onFields: (fields: MetadataFields) => void
  signed: boolean
  job: JobState
  onRun: (plan: Plan, options: JobOptions) => void
  onCancel: () => void
  onPrivacy: () => void
}) {
  const where = destinations(info)
  const planned = planEditMetadata(info, fields)
  const changed = changedFields(info, fields).length > 0
  const set = (patch: Partial<MetadataFields>) => onFields({ ...fields, ...patch })
  const offsets = fields.offset && !OFFSETS.includes(fields.offset) ? [...OFFSETS, fields.offset].sort() : OFFSETS

  return (
    <div className="flex flex-col gap-7">
      {signed && (
        <div className="flex gap-2.5 rounded-control bg-panel p-3 text-[13px] shadow-[0_0_0_1px_var(--color-line)]">
          <BadgeAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-ink-soft" strokeWidth={1.75} />
          <p>
            Changing metadata breaks this file’s Content Credentials: they’ll show as changed after signing.{' '}
            <button
              type="button"
              onClick={onPrivacy}
              className="font-medium text-accent-text underline-offset-2 hover:underline"
            >
              Privacy
            </button>{' '}
            can remove them.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-date" className="text-[13px] font-medium">
            Date taken
          </label>
          <div className="flex items-center gap-2">
            <div className={`${FIELD} flex h-8 min-w-0 flex-1 items-center`}>
              <input
                id="edit-date"
                type="datetime-local"
                step={1}
                // An incomplete entry is held as 'incomplete' (a problem); the field keeps what's typed.
                value={fields.date === 'incomplete' ? '' : fields.date}
                aria-describedby="edit-date-hint"
                onChange={(e) => set({ date: e.target.value || (e.target.validity?.badInput ? 'incomplete' : '') })}
                className="w-full min-w-0 bg-transparent tabular-nums outline-none focus-visible:outline-none"
              />
            </div>
            {fields.date && (
              <Button variant="ghost" size="sm" aria-label="Clear the date taken" onClick={() => set({ date: '' })}>
                Clear
              </Button>
            )}
          </div>
          <label className="sr-only" htmlFor="edit-offset">
            Time zone
          </label>
          <select
            id="edit-offset"
            value={fields.offset}
            onChange={(e) => set({ offset: e.target.value })}
            disabled={!fields.date}
            className={`${FIELD} h-8 disabled:text-ink-faint`}
          >
            <option value="">Time zone not known</option>
            {offsets.map((offset) => (
              <option key={offset} value={offset}>
                UTC{offset}
              </option>
            ))}
          </select>
          <p id="edit-date-hint" className="text-xs text-ink-soft">
            {fields.date ? where.date : `Not set. ${where.date}`}
          </p>
        </div>
        <TextField label="Title" value={fields.title} onChange={(title) => set({ title })} hint={where.title} />
        <TextField
          label="Caption"
          lines={3}
          value={fields.caption}
          onChange={(caption) => set({ caption })}
          hint={where.caption}
        />
        <TextField
          label="Creator"
          value={fields.creator}
          onChange={(creator) => set({ creator })}
          hint={where.creator}
        />
        <TextField
          label="Copyright"
          value={fields.copyright}
          onChange={(copyright) => set({ copyright })}
          hint={where.copyright}
        />
        <TextField
          label="Keywords"
          value={fields.keywords}
          onChange={(keywords) => set({ keywords })}
          hint={`Separate them with commas. ${where.keywords}`}
        />
      </div>

      <section aria-labelledby="edit-location" className="flex flex-col gap-2.5">
        <h3 id="edit-location" className="text-[13px] font-medium">
          Location
        </h3>
        <Segmented
          label="Location"
          value={fields.location}
          options={LOCATIONS}
          onChange={(location) => set({ location })}
        />
        {fields.location === 'remove' && (
          <p className="text-xs text-ink-soft">The position and any place names are removed, as Privacy does.</p>
        )}
        {fields.location === 'set' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Latitude" inputMode="decimal" value={fields.lat} onChange={(lat) => set({ lat })} />
              <TextField label="Longitude" inputMode="decimal" value={fields.lon} onChange={(lon) => set({ lon })} />
            </div>
            <p className="text-xs text-ink-soft">
              Click the map to place the pin, then drag it or move it with the arrow keys. Place names from the old
              location are removed. {where.location}
            </p>
          </>
        )}
      </section>

      {changed && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onFields(fieldsOf(info))}>
          Undo changes
        </Button>
      )}

      <JobAction
        planned={planned}
        verb="Save changes"
        state={job}
        onCancel={onCancel}
        onStart={() =>
          planned.plan &&
          onRun(planned.plan, {
            doing: 'Saving',
            size: info.size,
            // What the result doesn't hold of what was asked, read from its own tags.
            notes: (result) =>
              result.info
                ? notWritten(info, fields, result.info)
                : ['Loupe couldn’t read the result back to check it.'],
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
