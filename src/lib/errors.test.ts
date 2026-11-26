import { describe, expect, it } from 'vitest'
import { loading, notLoaded, Said, worded } from './errors'

const AGAIN = 'Check your connection, or reload the page if Loupe was updated.'

describe('notLoaded', () => {
  it.each([
    new TypeError('Failed to fetch'), // Chrome
    new TypeError('NetworkError when attempting to fetch resource.'), // Firefox
    new TypeError('Load failed'), // Safari
    // An old tab after a deploy: the hashed file is gone and the host answers with the page.
    new TypeError("Failed to execute 'compile' on 'WebAssembly': Incorrect response MIME type. Expected 'application/wasm'."),
    Object.assign(new Error('WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f'), {
      name: 'CompileError',
    }),
    new Error('Aborted(both async and sync fetching of the wasm failed)'), // Emscripten's abort
  ])('says $message is a library that couldn’t be loaded', (error) => {
    expect(notLoaded(error)).toBe(true)
  })

  it.each([new Error('unreachable'), new RangeError('Array buffer allocation failed'), new Said('No picture is open.')])(
    'leaves $message alone',
    (error) => {
      expect(notLoaded(error)).toBe(false)
    },
  )
})

describe('loading', () => {
  it('names what couldn’t be loaded', async () => {
    const failing = loading('The AVIF encoder', () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(failing).rejects.toThrow(`The AVIF encoder couldn’t be loaded. ${AGAIN}`)
    await expect(failing).rejects.toBeInstanceOf(Said)
  })

  it('passes other failures and results through', async () => {
    const broken = new Error('unreachable')
    await expect(loading('ExifTool', () => Promise.reject(broken))).rejects.toBe(broken)
    await expect(loading('ExifTool', () => Promise.resolve(7))).resolves.toBe(7)
  })
})

describe('worded', () => {
  it('keeps what Loupe said', () => {
    expect(worded(new Said('No picture is open.'))).toBe('No picture is open.')
  })

  it('puts a library’s message after “Something went wrong:”', () => {
    expect(worded(new Error('memory access out of bounds'))).toBe('Something went wrong: memory access out of bounds')
    expect(worded('a string')).toBe('Something went wrong: a string')
  })
})
