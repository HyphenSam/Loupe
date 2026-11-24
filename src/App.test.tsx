// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'

const photo = () => new File([new Uint8Array(2_400)], 'holiday.jpg', { type: 'image/jpeg' })
const rail = () => screen.getByRole('radiogroup', { name: 'Tools' })
const tools = (group: string) =>
  within(within(rail()).getByRole('group', { name: group }))
    .getAllByRole('radio')
    .map((tool) => tool.textContent)

describe('The tool rail', () => {
  it('shows the eleven tools in two groups, Inspect and Edit', () => {
    render(<App supported />)
    expect(tools('Inspect')).toEqual(['Info', 'Location', 'AI check', 'Privacy', 'Forensics', 'Extract'])
    expect(tools('Edit')).toEqual(['Edit metadata', 'Crop and rotate', 'Redact', 'Adjust', 'Export'])
  })

  it('keeps every tool disabled until a file is open', async () => {
    render(<App supported />)
    for (const tool of within(rail()).getAllByRole('radio')) expect(tool).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'No image open' })).toBeInTheDocument()

    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    for (const tool of within(rail()).getAllByRole('radio')) expect(tool).toBeEnabled()
    // A newly opened file starts on Info.
    expect(within(rail()).getByRole('radio', { name: 'Info' })).toBeChecked()
    expect(screen.getByRole('heading', { name: 'Info' })).toBeInTheDocument()
  })

  it('switches the settings column to the chosen tool', async () => {
    const user = userEvent.setup()
    render(<App supported />)
    await user.upload(screen.getByLabelText('Choose file'), photo())
    await user.click(within(rail()).getByRole('radio', { name: 'Crop and rotate' }))
    expect(screen.getByRole('heading', { name: 'Crop and rotate' })).toBeInTheDocument()
  })
})

describe('Opening a file', () => {
  it('shows the empty stage with its drop target and Choose file', () => {
    render(<App supported />)
    expect(screen.getByRole('heading', { name: 'Drop an image here' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument()
  })

  it('accepts a file from Choose file, and shows its name and size', async () => {
    render(<App supported />)
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    const card = screen.getByRole('region', { name: 'Open file' })
    expect(card).toHaveTextContent('holiday.jpg')
    expect(card).toHaveTextContent('2 kB')
    expect(screen.queryByRole('heading', { name: 'Drop an image here' })).not.toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Stage' })).toBeInTheDocument()
  })

  it('takes the accept list from the file types table', () => {
    render(<App supported />)
    expect(screen.getByLabelText('Choose file')).toHaveAttribute('accept', expect.stringContaining('image/heic'))
    expect(screen.getByLabelText('Choose file')).toHaveAttribute('accept', expect.stringContaining('.nef'))
  })

  it('accepts a file dropped anywhere on the window, whatever it is called', () => {
    render(<App supported />)
    const file = new File(['x'], 'IMG_0001.weird')
    fireEvent.dragOver(window, { dataTransfer: { types: ['Files'], files: [file] } })
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } })
    expect(screen.getByRole('region', { name: 'Open file' })).toHaveTextContent('IMG_0001.weird')
  })

  it('accepts a file pasted anywhere on the page', () => {
    render(<App supported />)
    fireEvent.paste(window, { clipboardData: { files: [photo()] } })
    expect(screen.getByRole('region', { name: 'Open file' })).toHaveTextContent('holiday.jpg')
  })

  it('leaves a paste with no file alone', () => {
    render(<App supported />)
    fireEvent.paste(window, { clipboardData: { files: [] } })
    expect(screen.queryByRole('region', { name: 'Open file' })).not.toBeInTheDocument()
  })

  it('replaces the open file with the next one', async () => {
    render(<App supported />)
    await userEvent.upload(screen.getByLabelText('Choose file'), photo())
    fireEvent.paste(window, { clipboardData: { files: [new File(['y'], 'second.png')] } })
    expect(screen.getByRole('region', { name: 'Open file' })).toHaveTextContent('second.png')
    expect(screen.getByRole('region', { name: 'Open file' })).not.toHaveTextContent('holiday.jpg')
  })
})

describe('In a browser without WebAssembly or Web Workers', () => {
  it('says the browser is too old and shows nothing else on the stage', () => {
    render(<App supported={false} />)
    expect(screen.getByRole('heading', { name: 'This browser is too old for Loupe' })).toBeInTheDocument()
    expect(screen.getByText(/needs WebAssembly and Web Workers/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Drop an image here' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose file' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Choose file')).not.toBeInTheDocument()
  })

  it('ignores dropped and pasted files', () => {
    render(<App supported={false} />)
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [photo()] } })
    fireEvent.paste(window, { clipboardData: { files: [photo()] } })
    expect(screen.queryByRole('region', { name: 'Open file' })).not.toBeInTheDocument()
  })
})

describe('About', () => {
  it('says in two sentences what leaves the device, and links the source', async () => {
    render(<App supported />)
    await userEvent.click(screen.getByRole('button', { name: 'About' }))
    const about = screen.getByRole('dialog', { name: 'Loupe' })
    expect(within(about).getByText(/never sends your pictures anywhere/)).toBeInTheDocument()
    expect(within(about).getByText(/OpenStreetMap/)).toBeInTheDocument()
    expect(within(about).getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/HyphenSam/Loupe',
    )
  })
})
