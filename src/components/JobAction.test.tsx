// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { JobState } from '@/hooks/useJob'
import { planAdjust } from '@/lib/plans/adjust'
import { NEUTRAL } from '@/lib/adjust'
import { fakeInfo } from '@/lib/testing'
import { JobAction } from './JobAction'

const planned = planAdjust(fakeInfo({ name: 'photo.jpg' }), { adjustments: { ...NEUTRAL, exposure: 1 }, output: null })

describe('JobAction', () => {
  it('offers the action while the job slot is idle', async () => {
    const onStart = vi.fn()
    render(<JobAction planned={planned} verb="Save" state={{ phase: 'idle' }} onStart={onStart} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  // `useJob`'s `start` refuses while a Copy runs, so the action mustn't look as if it would work.
  it('disables the action while a Copy runs', () => {
    const copying: JobState = { phase: 'copying' }
    render(<JobAction planned={planned} verb="Save" state={copying} onStart={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
