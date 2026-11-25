// @vitest-environment jsdom
// Forensics (SPEC.md 6.5): the edit trail, compression and hidden data, and Info's edit trail finding.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { EditTrail, ImageInfo } from './lib/info'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo } from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const section = (name: string) => screen.getByRole('region', { name })

const PHOTOSHOP: EditTrail = {
  software: 'Adobe Photoshop 25.0 (Windows)',
  history: [
    {
      action: 'Created',
      when: { local: '2025-04-02T16:10:21', offset: '+13:00' },
      software: 'Adobe Photoshop 25.0 (Windows)',
      detail: null,
    },
    { action: 'Converted', when: null, software: null, detail: 'From PSD to JPEG' },
    {
      action: 'Saved',
      when: { local: '2025-04-03T09:12:44', offset: '+13:00' },
      software: 'Adobe Photoshop 25.0 (Windows)',
      detail: null,
    },
  ],
  settings: ['Exposure +0.70', 'Highlights −45', 'Crop'],
  settingsBy: 'Camera Raw 16.0',
  ancestors: 3,
  mismatches: ['The date taken differs: 12 March 2025 at 14:32 in EXIF, 12 March 2025 at 15:32 in XMP.'],
}

let saved: { name: string; type: string }[] = []
afterEach(() => vi.restoreAllMocks())

function saving() {
  saved = []
  const blobs = new Map<string, Blob>()
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:saved/${blobs.size + 1}`
    blobs.set(url, blob as Blob)
    return url
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, type: blobs.get(this.href)!.type })
  })
}

async function openWith(info: Partial<ImageInfo>, name = 'holiday.jpg') {
  const client = new FakeClient()
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], name))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(fakeInfo({ name, ...info }))
    provenance.last.resolve(null)
  })
  return client
}

describe('Info’s edit trail finding', () => {
  it('says what edited the picture and when, and opens Forensics', async () => {
    await openWith({ edits: PHOTOSHOP })
    const finding = within(screen.getByRole('list', { name: 'Summary' })).getByRole('button', {
      name: /Edited in Adobe Photoshop 25.0 on 3 April 2025/,
    })
    await userEvent.click(finding)
    expect(tool('Forensics')).toBeChecked()
  })

  it('is left out when no editing software is recorded', async () => {
    await openWith({})
    expect(screen.queryByText(/Edited in/)).toBeNull()
  })
})

describe('Forensics', () => {
  it('shows the edit trail: the finding, its rows and each step of the history', async () => {
    await openWith({ edits: PHOTOSHOP })
    await userEvent.click(tool('Forensics'))
    const trail = section('Edit trail')
    expect(trail).toHaveTextContent('Edited in Adobe Photoshop 25.0 on 3 April 2025')
    expect(trail).toHaveTextContent('Stated in the file’s metadata; anyone can add or remove this.')
    expect(trail).toHaveTextContent('Develop settingsExposure +0.70, Highlights −45, CropSet in Camera Raw 16.0.')
    expect(trail).toHaveTextContent('Made from3 other documents')
    expect(trail).toHaveTextContent('The date taken differs')
    const steps = within(within(trail).getByRole('list', { name: 'History' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual([
      'Created2 April 2025 at 16:10 (UTC+13:00) · Adobe Photoshop 25.0 (Windows)',
      'ConvertedFrom PSD to JPEG',
      'Saved3 April 2025 at 09:12 (UTC+13:00) · Adobe Photoshop 25.0 (Windows)',
    ])
  })

  it('says when no editing software is recorded, and still names what wrote the file', async () => {
    await openWith({})
    await userEvent.click(tool('Forensics'))
    const trail = section('Edit trail')
    expect(trail).toHaveTextContent('No editing software recorded.')
    expect(trail).toHaveTextContent('That doesn’t mean it wasn’t edited.')
    expect(trail).toHaveTextContent('Written by17.4')
    expect(within(trail).queryByRole('list', { name: 'History' })).toBeNull()
  })

  it('shows a JPEG’s compression, and no such section for other formats', async () => {
    await openWith({})
    await userEvent.click(tool('Forensics'))
    const compression = section('Compression')
    expect(compression).toHaveTextContent('QualityAbout quality 92')
    expect(compression).toHaveTextContent('TablesCustom tables')
    expect(compression).toHaveTextContent('Chroma4:2:0')
    expect(compression).toHaveTextContent('EncodingBaseline')
    expect(compression).toHaveTextContent('Estimated from the file’s quantisation tables.')
  })

  it('has no Compression section for a PNG, and lists its unknown chunks', async () => {
    await openWith({ format: 'png', formatName: 'PNG', jpeg: null, unknownChunks: ['zzZz', 'miNE'] }, 'drawing.png')
    await userEvent.click(tool('Forensics'))
    expect(screen.queryByRole('region', { name: 'Compression' })).toBeNull()
    const hidden = section('Hidden data')
    expect(hidden).toHaveTextContent('Nothing found after the end of the picture.')
    expect(hidden).toHaveTextContent('PNG chunks Loupe doesn’t know: zzZz, miNE.')
  })

  it('says what’s after the end of the picture and saves it as the file’s stem and “hidden”', async () => {
    saving()
    const client = await openWith({ trailer: { offset: 709, length: 149, looksLike: 'zip' } })
    await userEvent.click(tool('Forensics'))
    const hidden = section('Hidden data')
    expect(hidden).toHaveTextContent('149 B of data after the end of the picture. It starts like a ZIP archive.')
    await userEvent.click(within(hidden).getByRole('button', { name: 'Save it' }))
    await waitFor(() => expect(saved).toEqual([{ name: 'holiday hidden.zip', type: 'application/zip' }]))
    expect(client.extracts).toEqual(['trailer'])
  })

  it('says why when saving it fails', async () => {
    const client = await openWith({ trailer: { offset: 709, length: 149, looksLike: 'unknown' } })
    client.extractResult = 'Loupe’s background worker stopped. Reload the page to carry on.'
    await userEvent.click(tool('Forensics'))
    await userEvent.click(within(section('Hidden data')).getByRole('button', { name: 'Save it' }))
    expect(await within(section('Hidden data')).findByRole('alert')).toHaveTextContent(
      'Loupe’s background worker stopped. Reload the page to carry on.',
    )
  })

  it('says nothing was found after a JPEG with nothing hidden, offering nothing to save', async () => {
    await openWith({})
    await userEvent.click(tool('Forensics'))
    expect(section('Hidden data')).toHaveTextContent('Nothing found after the end of the picture.')
    expect(within(section('Hidden data')).queryByRole('button', { name: 'Save it' })).toBeNull()
  })
})
