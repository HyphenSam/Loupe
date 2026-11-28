// @vitest-environment jsdom
// Forensics (SPEC.md 6.5): the edit trail, compression, hidden data, the embedded thumbnail, the error levels
// and noise layers, fingerprints and Find it online, and Info's edit trail finding.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { EditTrail, Embedded, ImageInfo } from './lib/info'
import type { StagePicture, ThumbnailMatch } from './lib/protocol'
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
  samsung: null,
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

async function openWith(
  info: Partial<ImageInfo>,
  name = 'holiday.jpg',
  picture: StagePicture = { type: 'file' },
  client = new FakeClient(),
) {
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], name))
  await act(async () => {
    client.last.picture(picture)
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

const viewChip = (name: string) =>
  within(screen.getByRole('radiogroup', { name: 'View' })).queryByRole('radio', { name })

async function openForensics(info: Partial<ImageInfo> = {}, client = new FakeClient(), picture?: StagePicture) {
  await openWith(info, 'holiday.jpg', picture, client)
  await userEvent.click(tool('Forensics'))
  return client
}

describe('Error levels and Noise', () => {
  const CAUTION =
    'Parts saved a different number of times can stand out. Edges, text and smooth areas differ naturally, so treat this as a reason to look closer, not proof.'

  it('offers both views on the stage while Forensics is open, and not before', async () => {
    await openWith({})
    expect(viewChip('Error levels')).toBeNull()
    await userEvent.click(tool('Forensics'))
    expect(viewChip('Error levels')).not.toBeNull()
    expect(viewChip('Noise')).not.toBeNull()
  })

  it('opening Error levels switches the stage to it, drawn at quality 90 and ×20', async () => {
    const client = await openForensics()
    const button = screen.getByRole('button', { name: 'Error levels' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(viewChip('Error levels')).toBeChecked()
    expect(screen.getByRole('img', { name: /error levels/ })).toBeInTheDocument()
    await waitFor(() => expect(client.layers).toEqual([{ layer: 'ela', quality: 90, amount: 20 }]))
    const layer = section('Error levels')
    expect(within(layer).getByRole('slider', { name: 'Quality' })).toHaveAttribute('aria-valuenow', '90')
    expect(within(layer).getByRole('slider', { name: 'Brightness' })).toHaveAttribute('aria-valuenow', '20')
    expect(layer).toHaveTextContent(CAUTION)
  })

  it('draws again as a slider moves', async () => {
    const client = await openForensics()
    await userEvent.click(screen.getByRole('button', { name: 'Error levels' }))
    await waitFor(() => expect(client.layers).toHaveLength(1))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Brightness' }), { key: 'ArrowRight' })
    await waitFor(() => expect(client.layers.at(-1)).toEqual({ layer: 'ela', quality: 90, amount: 21 }))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Quality' }), { key: 'ArrowLeft' })
    await waitFor(() => expect(client.layers.at(-1)).toEqual({ layer: 'ela', quality: 89, amount: 21 }))
  })

  it('choosing Noise on the stage opens its section in place of Error levels', async () => {
    const client = await openForensics()
    await userEvent.click(screen.getByRole('button', { name: 'Error levels' }))
    await userEvent.click(viewChip('Noise')!)
    expect(screen.getByRole('button', { name: 'Noise' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Error levels' })).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(client.layers.at(-1)).toEqual({ layer: 'noise', quality: 90, amount: 10 }))
    const layer = section('Noise')
    expect(within(layer).getByRole('slider', { name: 'Amplification' })).toHaveAttribute('aria-valuenow', '10')
    expect(layer).toHaveTextContent('Each pixel minus the median of the pixels around it, amplified.')
  })

  it('goes back to the picture on closing the section, or on leaving Forensics', async () => {
    await openForensics()
    await userEvent.click(screen.getByRole('button', { name: 'Noise' }))
    expect(viewChip('Noise')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Noise' }))
    expect(viewChip('Picture')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Error levels' }))
    await userEvent.click(tool('Info'))
    expect(viewChip('Picture')).toBeChecked()
    expect(viewChip('Error levels')).toBeNull()
  })

  it('says why on the stage when the layer can’t be made', async () => {
    const client = new FakeClient()
    client.layerResult = 'Loupe’s background worker stopped. Reload the page to carry on.'
    await openForensics({}, client)
    await userEvent.click(screen.getByRole('button', { name: 'Error levels' }))
    expect(
      await screen.findByText('Loupe’s background worker stopped. Reload the page to carry on.'),
    ).toBeInTheDocument()
  })

  it('leaves both out for a picture Loupe can’t show', async () => {
    await openForensics({ format: 'tiff', formatName: 'TIFF', jpeg: null }, new FakeClient(), {
      type: 'none',
      message: 'Loupe can’t show TIFF pictures yet. Its metadata is listed.',
    })
    expect(screen.queryByRole('button', { name: 'Error levels' })).toBeNull()
    expect(screen.getByText('Error levels and noise need a picture Loupe can show.')).toBeInTheDocument()
    expect(viewChip('Error levels')).toBeNull()
  })
})

describe('Embedded thumbnail', () => {
  const THUMB: Embedded = {
    id: 'EXIF:IFD1:ThumbnailImage',
    kind: 'thumbnail',
    label: 'EXIF thumbnail',
    size: 5120,
    extension: 'jpg',
    isImage: true,
    tag: { family: 'EXIF', group: 'IFD1', name: 'ThumbnailImage' },
  }
  const match = (over: Partial<ThumbnailMatch> = {}): ThumbnailMatch => ({
    label: 'EXIF thumbnail',
    thumbnail: new Blob(['t'], { type: 'image/png' }),
    picture: new Blob(['p'], { type: 'image/png' }),
    matches: true,
    distance: 3,
    aspectDiffers: false,
    ...over,
  })

  it('shows the thumbnail beside the picture and says they match', async () => {
    const client = new FakeClient()
    client.thumbnailResult = match()
    await openForensics({ embedded: [THUMB] }, client)
    const thumbnail = section('Embedded thumbnail')
    expect(await within(thumbnail).findByRole('img', { name: 'EXIF thumbnail' })).toBeInTheDocument()
    expect(within(thumbnail).getByRole('img', { name: 'The picture' })).toBeInTheDocument()
    expect(thumbnail).toHaveTextContent('The embedded thumbnail matches the picture.')
    expect(thumbnail).toHaveTextContent('Compared by perceptual hash: 3 of 64 bits differ.')
  })

  it('says when the thumbnail doesn’t match, as after a crop', async () => {
    const client = new FakeClient()
    client.thumbnailResult = match({ matches: false, aspectDiffers: true })
    await openForensics({ embedded: [THUMB] }, client)
    const thumbnail = section('Embedded thumbnail')
    expect(await within(thumbnail).findByText('The embedded thumbnail doesn’t match the picture.')).toBeInTheDocument()
    expect(thumbnail).toHaveTextContent('It may show it before it was cropped or edited.')
    expect(thumbnail).toHaveTextContent('Compared by shape: the thumbnail’s is different.')
  })

  it('is left out without a thumbnail', async () => {
    const client = await openForensics()
    expect(screen.queryByRole('region', { name: 'Embedded thumbnail' })).toBeNull()
    expect(client.thumbnailRequests).toBe(0)
  })

  it('is left out when none could be read', async () => {
    const client = await openForensics({ embedded: [THUMB] })
    expect(client.thumbnailRequests).toBe(1)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Embedded thumbnail' })).toBeNull())
  })
})

describe('Fingerprints', () => {
  it('lists the file’s SHA-256 and the picture’s perceptual hash, each to copy', async () => {
    await openForensics()
    const prints = section('Fingerprints')
    expect(await within(prints).findByText('a'.repeat(64))).toBeInTheDocument()
    expect(within(prints).getByText('0000000000000000')).toBeInTheDocument()
    expect(within(prints).getByRole('button', { name: 'Copy SHA-256' })).toBeInTheDocument()
    expect(within(prints).getByRole('button', { name: 'Copy perceptual hash' })).toBeInTheDocument()
  })

  it('compares with another image without opening it', async () => {
    const client = await openForensics()
    const other = new File(['x'], 'holiday small.jpg')
    await userEvent.upload(screen.getByLabelText('Compare with another image'), other)
    const prints = section('Fingerprints')
    expect(await within(prints).findByText('Likely the same picture (4 of 64 bits differ).')).toBeInTheDocument()
    expect(prints).toHaveTextContent('Compared with holiday small.jpg')
    expect(client.fingerprints).toEqual([undefined, other])
    expect(client.opens).toHaveLength(1)
  })

  it('says why when the other file can’t be read', async () => {
    const client = new FakeClient()
    client.fingerprintResult = (file) =>
      file ? 'Loupe can’t open this file.' : { sha256: 'a'.repeat(64), phash: '0000000000000000' }
    await openForensics({}, client)
    await userEvent.upload(screen.getByLabelText('Compare with another image'), new File(['x'], 'broken.jpg'))
    expect(await within(section('Fingerprints')).findByRole('alert')).toHaveTextContent('Loupe can’t open this file.')
  })
})

describe('Find it online', () => {
  let written: ClipboardItem[][]
  let opened: unknown[][]
  beforeEach(() => {
    written = []
    opened = []
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob | Promise<Blob>>) {}
      },
    )
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: async (items: ClipboardItem[]) => void written.push(items) },
      configurable: true,
      writable: true,
    })
    vi.spyOn(window, 'open').mockImplementation((...args: unknown[]) => {
      opened.push(args)
      return null
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('copies the picture and opens the site chosen, making the PNG once', async () => {
    const client = await openForensics()
    const online = section('Find it online')
    expect(online).toHaveTextContent(
      'Copies the picture and opens the site in a new tab, ready to paste. Only the site you choose sees it.',
    )
    for (const name of ['Google Lens', 'TinEye', 'Bing'])
      await userEvent.click(within(online).getByRole('button', { name }))
    await waitFor(() => expect(opened).toHaveLength(3))
    expect(written).toHaveLength(3)
    expect(opened.map(([url]) => url)).toEqual([
      'https://lens.google.com/',
      'https://tineye.com/',
      'https://www.bing.com/visualsearch',
    ])
    expect(client.pngRequests).toBe(1)
  })
})
