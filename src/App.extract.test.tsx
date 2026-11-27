// @vitest-environment jsdom
// Extract (SPEC.md 6.6): what's embedded in the file, each item saved as it is, pictures opened in Loupe.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { Embedded, ImageInfo } from './lib/info'
import { ALL_CAPABLE, FakeClient, FakeProvenance, fakeInfo, fakeStore } from './lib/testing'

const tool = (name: string) => within(screen.getByRole('radiogroup', { name: 'Tools' })).getByRole('radio', { name })
const row = (name: string) => screen.getByRole('listitem', { name })

const item = (over: Partial<Embedded> & Pick<Embedded, 'id' | 'kind' | 'label'>) =>
  ({ size: 1000, extension: 'jpg', isImage: false, ...over }) as Embedded

const THUMBNAIL = item({
  id: 'EXIF:IFD1:ThumbnailImage',
  kind: 'thumbnail',
  label: 'EXIF thumbnail',
  size: 9362,
  isImage: true,
  tag: { family: 'EXIF', group: 'IFD1', name: 'ThumbnailImage' },
})
const VIDEO = item({
  id: 'Trailer:Google:MotionPhotoVideo',
  kind: 'motion-video',
  label: 'Motion Photo video',
  size: 2_400_000,
  extension: 'mp4',
})
const XMP = item({ id: 'xmp', kind: 'xmp', label: 'XMP metadata', size: null, extension: 'xmp' })
const CREDENTIALS = item({
  id: 'c2pa-manifest',
  kind: 'c2pa-manifest',
  label: 'Content Credentials',
  size: null,
  extension: 'json',
})

let saved: { name: string; blob: Blob }[] = []
afterEach(() => vi.restoreAllMocks())

function saving() {
  saved = []
  const blobs = new Map<string, Blob>()
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:saved/${blobs.size + 1}`
    blobs.set(url, blob as Blob)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: blobs.get(this.href)! })
  })
}

async function openExtract(embedded: Embedded[], client = new FakeClient(), store = fakeStore()) {
  saving()
  const provenance = new FakeProvenance()
  render(<App supported client={client} capabilities={ALL_CAPABLE} provenance={provenance} />)
  await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], 'PXL_0042.MP.jpg'))
  await act(async () => {
    client.last.picture({ type: 'file' })
    client.last.resolve(fakeInfo({ name: 'PXL_0042.MP.jpg', embedded } as Partial<ImageInfo>))
    provenance.last.resolve(embedded.includes(CREDENTIALS) ? { store, thumbnails: {} } : null)
  })
  await userEvent.click(tool('Extract'))
  return client
}

describe('Extract', () => {
  it('lists each item with its size, a thumbnail for pictures and an icon for the rest', async () => {
    const client = new FakeClient()
    client.extractResult = new Blob(['jpeg'], { type: 'image/jpeg' })
    await openExtract([THUMBNAIL, VIDEO, XMP], client)
    expect(row('EXIF thumbnail')).toHaveTextContent('9 kB')
    expect(row('Motion Photo video')).toHaveTextContent('2.4 MB')
    expect(row('Motion Photo video')).toHaveTextContent('Moviola can trim it or take its sound.')
    expect(row('XMP metadata')).not.toHaveTextContent('kB')
    // The thumbnail is read out at once; the rest only when saved.
    await waitFor(() => expect(client.extracts).toEqual(['EXIF:IFD1:ThumbnailImage']))
    // Beside its label, the thumbnail is decoration.
    expect(await within(row('EXIF thumbnail')).findByRole('presentation')).toHaveAttribute('src')
  })

  it('saves each item as it is, named after the file', async () => {
    const client = new FakeClient()
    client.extractResult = new Blob(['mp4'], { type: 'video/mp4' })
    await openExtract([VIDEO, XMP], client)
    await userEvent.click(within(row('Motion Photo video')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved.map((s) => s.name)).toEqual(['PXL_0042.MP video.mp4']))
    expect(saved[0].blob.type).toBe('video/mp4')
    await userEvent.click(within(row('XMP metadata')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved.map((s) => s.name)).toContain('PXL_0042.MP.xmp'))
    expect(client.extracts).toEqual(['Trailer:Google:MotionPhotoVideo', 'xmp'])
  })

  it('opens a picture in Loupe, and offers that for pictures only', async () => {
    const client = new FakeClient()
    client.extractResult = new Blob(['jpeg'], { type: 'image/jpeg' })
    await openExtract([THUMBNAIL, VIDEO], client)
    expect(within(row('Motion Photo video')).queryByRole('button', { name: 'Open in Loupe' })).toBeNull()
    await userEvent.click(within(row('EXIF thumbnail')).getByRole('button', { name: 'Open in Loupe' }))
    await waitFor(() => expect(client.opens).toHaveLength(2))
    expect(client.last.file.name).toBe('PXL_0042.MP thumbnail.jpg')
    expect(client.last.file.type).toBe('image/jpeg')
  })

  it('ignores an item that arrives after another file has opened', async () => {
    const client = new FakeClient()
    const answers: ((blob: Blob) => void)[] = []
    client.extract = () => new Promise((resolve) => answers.push(resolve))
    await openExtract([THUMBNAIL, VIDEO], client)
    await userEvent.click(within(row('EXIF thumbnail')).getByRole('button', { name: 'Open in Loupe' }))
    await userEvent.click(within(row('Motion Photo video')).getByRole('button', { name: 'Save' }))
    await userEvent.upload(screen.getByLabelText('Choose file'), new File([new Uint8Array(10)], 'other.jpg'))
    await act(async () => {
      client.last.resolve(fakeInfo({ name: 'other.jpg' }))
      for (const answer of answers) answer(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })
    expect(client.opens.map((o) => o.file.name)).toEqual(['PXL_0042.MP.jpg', 'other.jpg'])
    expect(saved).toEqual([])
  })

  it('saves Content Credentials as the C2PA SDK reads them', async () => {
    const store = fakeStore()
    const client = await openExtract([CREDENTIALS], new FakeClient(), store)
    await userEvent.click(within(row('Content Credentials')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved.map((s) => s.name)).toEqual(['PXL_0042.MP credentials.json']))
    expect(JSON.parse(await saved[0].blob.text())).toEqual(store)
    expect(saved[0].blob.type).toBe('application/json')
    expect(client.extracts).toEqual([])
  })

  it('says why an item can’t be saved', async () => {
    const client = new FakeClient()
    client.extractResult = 'ExifTool found nothing to save as “XMP metadata”.'
    await openExtract([XMP], client)
    await userEvent.click(within(row('XMP metadata')).getByRole('button', { name: 'Save' }))
    expect(
      await within(row('XMP metadata')).findByText('ExifTool found nothing to save as “XMP metadata”.'),
    ).toBeInTheDocument()
    expect(saved).toEqual([])
  })

  it('says it’s lossless: the items are copied out as they are', async () => {
    await openExtract([XMP])
    expect(screen.getByText('Lossless')).toBeInTheDocument()
    expect(screen.getByText('Copied out as they are.')).toBeInTheDocument()
  })
})
