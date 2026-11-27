import { describe, expect, it } from 'vitest'
import { changeEdit, deleteBox, editFor, freshEdit, placePin, type FileEdit } from './file-edit'
import { DEFAULT_ADJUST } from './plans/adjust'
import { fieldsOf } from './plans/edit-metadata'
import { DEFAULT_REDACT } from './plans/redact'
import type { StagePicture } from './protocol'
import { fakeInfo } from './testing'

const info = fakeInfo({ name: 'holiday.jpg' })
const picture: StagePicture = { type: 'file' }
/** A file the page shows: asked for, its picture arrived, or opened. */
const asked = (id: number) => ({ id, picture: null, info: null })
const showing = (id: number) => ({ id, picture, info: null })
const opened = (id: number) => ({ id, picture, info })

/** File 1, open on Redact with a box drawn. */
const worked: FileEdit = {
  ...freshEdit(1),
  tool: 'redact',
  redact: { ...DEFAULT_REDACT, boxes: [{ x: 1, y: 2, width: 3, height: 4 }] },
  selectedBox: 0,
}

describe('freshEdit', () => {
  it('starts on Info and the picture with nothing changed', () => {
    expect(freshEdit(7)).toEqual({
      fileId: 7,
      tool: 'info',
      view: 'picture',
      edits: null,
      crop: null,
      redact: DEFAULT_REDACT,
      selectedBox: null,
      adjust: DEFAULT_ADJUST,
      selectedLine: null,
    })
  })
})

describe('editFor', () => {
  it('keeps the open file’s state', () => {
    expect(editFor(worked, opened(1))).toBe(worked)
  })

  it('keeps it while another file is asked for and nothing of it has arrived', () => {
    expect(editFor(worked, asked(2))).toBe(worked)
  })

  it('starts afresh once the new file’s picture or info arrives', () => {
    expect(editFor(worked, showing(2))).toEqual(freshEdit(2))
    expect(editFor(worked, { id: 2, picture: null, info })).toEqual(freshEdit(2))
  })

  it('gives the state back when the new file fails after showing and the previous one comes back', () => {
    expect(editFor(worked, showing(2))).toEqual(freshEdit(2))
    expect(editFor(worked, opened(1))).toBe(worked)
  })

  it('starts afresh for the first file', () => {
    expect(editFor(freshEdit(null), null)).toEqual(freshEdit(null))
    expect(editFor(freshEdit(null), showing(1))).toEqual(freshEdit(1))
  })
})

describe('changeEdit', () => {
  it('changes the open file’s state', () => {
    expect(changeEdit(worked, opened(1), { tool: 'crop' })).toEqual({ ...worked, tool: 'crop' })
  })

  it('gives a change made once the new file shows to that file, so a later failure doesn’t bring the old one back', () => {
    const changed = changeEdit(worked, showing(2), { tool: 'adjust' })
    expect(changed).toEqual({ ...freshEdit(2), tool: 'adjust' })
    expect(editFor(changed, opened(1))).toEqual(freshEdit(1))
  })

  it('gives a change made before the new file shows to the file still shown', () => {
    const changed = changeEdit(worked, asked(2), { tool: 'crop' })
    expect(changed).toEqual({ ...worked, tool: 'crop' })
    expect(editFor(changed, opened(1))).toBe(changed)
  })

  it('works a change out from the state that applies', () => {
    const changed = changeEdit(worked, showing(2), (current) => ({ selectedBox: current.redact.boxes.length }))
    expect(changed.selectedBox).toBe(0)
  })
})

describe('placePin', () => {
  it('places the pin when the form hasn’t been changed', () => {
    const at = { lat: -45.0312346, lon: 168.6626789 }
    expect(placePin(freshEdit(1), info, at)).toEqual({
      edits: { ...fieldsOf(info), location: 'set', lat: '-45.031235', lon: '168.662679' },
    })
  })

  it('keeps the form’s other changes', () => {
    const edits = { ...fieldsOf(info), title: 'Dawn', location: 'set' as const, lat: '', lon: '' }
    expect(placePin({ ...freshEdit(1), edits }, info, { lat: 1, lon: 2 }).edits).toEqual({
      ...edits,
      lat: '1.000000',
      lon: '2.000000',
    })
  })
})

describe('deleteBox', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 }
  const b = { x: 20, y: 0, width: 10, height: 10 }
  const c = { x: 40, y: 0, width: 10, height: 10 }
  const three = (selectedBox: number | null): FileEdit => ({
    ...freshEdit(1),
    redact: { ...DEFAULT_REDACT, fill: 'blur', boxes: [a, b, c] },
    selectedBox,
  })

  it('keeps the selection on its box when one before it goes', () => {
    expect(deleteBox(three(2), 0)).toEqual({
      redact: { ...DEFAULT_REDACT, fill: 'blur', boxes: [b, c] },
      selectedBox: 1,
    })
  })

  it('keeps it when one after it goes', () => {
    expect(deleteBox(three(0), 1)).toMatchObject({ redact: { boxes: [a, c] }, selectedBox: 0 })
  })

  it('selects nothing when the selected box goes', () => {
    expect(deleteBox(three(1), 1)).toMatchObject({ redact: { boxes: [a, c] }, selectedBox: null })
    expect(deleteBox(three(2), 2)).toMatchObject({ redact: { boxes: [a, b] }, selectedBox: null })
  })

  it('leaves no selection as none', () => {
    expect(deleteBox(three(null), 0)).toMatchObject({ redact: { boxes: [b, c] }, selectedBox: null })
  })
})
