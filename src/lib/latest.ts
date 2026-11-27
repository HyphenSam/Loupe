/** One request out at a time, the latest wanted value winning: Forensics' layer, Adjust's preview and the stage's colour
 * readout ask the worker for something that changes many times a second (a slider, the pointer), and never queue
 * requests up. Idle, asking, and asking with a newer value waiting.
 *
 * The key is what an answer belongs to (the open file); the value is what's asked for (settings, a point). An answer
 * for an older value of the same key is still worth showing while the next is worked out; one for an old key isn't.
 * A request isn't made twice in a row for the same key and value, so a failure waits for the next change instead of
 * asking again and again; wanting nothing in between (the pointer leaving, the view switching away) breaks the run. */

export type Asked<K, V> = { key: K; value: V }

export type Latest<K, V> = {
  key: K
  /** The latest value wanted, or null for none. */
  want: V | null
  /** The request that's out. */
  out: Asked<K, V> | null
  /** The last request that came back, answered or failed; forgotten while nothing is wanted. */
  last: Asked<K, V> | null
}

export type LatestEvent<K, V> = { type: 'want'; key: K; value: V | null } | { type: 'answer' } | { type: 'failure' }

export type Step<K, V> = {
  state: Latest<K, V>
  /** A request to make now, if any. */
  ask: Asked<K, V> | null
  /** For an answer or failure: whether it belongs to the current key, so is shown. */
  current: boolean
}

export const idle = <K, V>(key: K): Latest<K, V> => ({ key, want: null, out: null, last: null })

export function step<K, V>(state: Latest<K, V>, event: LatestEvent<K, V>, same: (a: V, b: V) => boolean): Step<K, V> {
  if (event.type === 'want') {
    const last = event.value === null ? null : state.last
    return next({ ...state, key: event.key, want: event.value, last }, false, same)
  }
  if (!state.out) return { state, ask: null, current: false }
  return next({ ...state, out: null, last: state.out }, state.out.key === state.key, same)
}

function next<K, V>(state: Latest<K, V>, current: boolean, same: (a: V, b: V) => boolean): Step<K, V> {
  const { key, want, out, last } = state
  if (out || want === null || (last && last.key === key && same(last.value, want))) return { state, ask: null, current }
  const ask = { key, value: want }
  return { state: { ...state, out: ask }, ask, current }
}
