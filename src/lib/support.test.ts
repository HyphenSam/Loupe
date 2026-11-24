import { describe, expect, it } from 'vitest'
import { isSupported } from './support'

const wasm = { instantiate: () => {}, compile: () => {} }
class FakeWorker {}

describe('isSupported', () => {
  it('needs WebAssembly and Web Workers (SPEC.md section 2)', () => {
    expect(isSupported({ WebAssembly: wasm, Worker: FakeWorker })).toBe(true)
  })

  it('is false without WebAssembly', () => {
    expect(isSupported({ Worker: FakeWorker })).toBe(false)
    expect(isSupported({ WebAssembly: {}, Worker: FakeWorker })).toBe(false)
  })

  it('is false without Web Workers', () => {
    expect(isSupported({ WebAssembly: wasm })).toBe(false)
  })

  it('reads the real globals by default', () => {
    expect(isSupported()).toBe(typeof WebAssembly === 'object' && typeof Worker === 'function')
  })
})
