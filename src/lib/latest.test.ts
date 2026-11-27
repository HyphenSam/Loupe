import { describe, expect, it } from 'vitest'
import { idle, step, type Latest } from './latest'

type Want = { amount: number }
const same = (a: Want, b: Want) => a.amount === b.amount

/** Runs events in order, returning the state and what each asked for. */
function run(state: Latest<string, Want>, ...events: Parameters<typeof step<string, Want>>[1][]) {
  const steps = events.map((event) => {
    const next = step(state, event, same)
    state = next.state
    return next
  })
  return { state, steps, asked: steps.map((s) => s.ask && `${s.ask.key}:${s.ask.value.amount}`) }
}

const want = (key: string, amount: number | null) =>
  ({ type: 'want', key, value: amount === null ? null : { amount } }) as const

describe('latest', () => {
  it('keeps one request out and asks for the latest value when it comes back, skipping those between', () => {
    const { asked, steps, state } = run(
      idle('a'),
      want('a', 1),
      want('a', 2),
      want('a', 3),
      { type: 'answer' },
      { type: 'answer' },
    )
    expect(asked).toEqual(['a:1', null, null, 'a:3', null])
    // An answer for older settings of the same file is still drawn.
    expect(steps[3].current).toBe(true)
    expect(state.out).toBeNull()
  })

  it("doesn't ask again for what it last asked for", () => {
    const { asked } = run(idle('a'), want('a', 1), { type: 'answer' }, want('a', 1))
    expect(asked).toEqual(['a:1', null, null])
  })

  it('asks again when the key changes and the value stays the same', () => {
    expect(run(idle('a'), want('a', 1), { type: 'answer' }, want('b', 1)).asked).toEqual(['a:1', null, 'b:1'])
  })

  it('drops an answer for an old key and asks for the new one', () => {
    const { asked, steps } = run(idle('a'), want('a', 1), want('b', 1), { type: 'answer' }, { type: 'answer' })
    expect(asked).toEqual(['a:1', null, 'b:1', null])
    expect(steps.slice(2).map((s) => s.current)).toEqual([false, true])
  })

  it("after a failure with nothing newer, waits for the next change and doesn't ask again on its own", () => {
    const { asked, steps } = run(idle('a'), want('a', 1), { type: 'failure' }, want('a', 1), want('a', 2))
    expect(asked).toEqual(['a:1', null, null, 'a:2'])
    expect(steps[1].current).toBe(true)
  })

  it('after a failure, asks for a newer value that came in meanwhile', () => {
    expect(run(idle('a'), want('a', 1), want('a', 2), { type: 'failure' }).asked).toEqual(['a:1', null, 'a:2'])
  })

  it('says a failure for an old key is not current', () => {
    const { steps } = run(idle('a'), want('a', 1), want('b', null), { type: 'failure' })
    expect(steps[2].current).toBe(false)
  })

  it('asks for nothing while nothing is wanted, and keeps an answer that comes back meanwhile', () => {
    const { asked, steps } = run(idle('a'), want('a', null), want('a', 1), want('a', null), { type: 'answer' })
    expect(asked).toEqual([null, 'a:1', null, null])
    expect(steps[3].current).toBe(true)
  })

  it('asks again for the same value after a spell of wanting nothing', () => {
    const { asked } = run(idle('a'), want('a', 1), { type: 'failure' }, want('a', null), want('a', 1))
    expect(asked).toEqual(['a:1', null, null, 'a:1'])
  })

  it('ignores an answer or failure when nothing is out', () => {
    const { asked, steps } = run(idle('a'), { type: 'answer' }, { type: 'failure' })
    expect(asked).toEqual([null, null])
    expect(steps.map((s) => s.current)).toEqual([false, false])
  })
})
