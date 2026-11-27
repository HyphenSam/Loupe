import { X } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { AdjustView } from './components/AdjustView'
import { AiCheckView } from './components/AiCheckView'
import { AppLauncher } from './components/AppLauncher'
import { CropRotateView } from './components/CropRotateView'
import { EditMetadataView } from './components/EditMetadataView'
import { ExportView } from './components/ExportView'
import { ExtractView } from './components/ExtractView'
import { ExportsStrip } from './components/ExportsStrip'
import { FileCard } from './components/FileCard'
import { ForensicsView } from './components/ForensicsView'
import { InfoView } from './components/InfoView'
import { LocationView } from './components/LocationView'
import { Logo } from './components/Logo'
import { PrivacyView } from './components/PrivacyView'
import { RedactView } from './components/RedactView'
import { Stage } from './components/stage/Stage'
import { TextView } from './components/TextView'
import { ThemeMenu } from './components/ThemeMenu'
import { ToolRail } from './components/ToolRail'
import { UpdateBanner } from './components/UpdateBanner'
import { useJob, type Made } from './hooks/useJob'
import { useLayer } from './hooks/useLayer'
import { useProvenance } from './hooks/useProvenance'
import { useSource } from './hooks/useSource'
import { BROWSER_STORE, useTextFiles, type TextStore } from './hooks/useTextFiles'
import { useTextReads } from './hooks/useTextReads'
import type { ProvenanceReader } from './lib/ai/c2pa'
import { verdict as verdictOf } from './lib/ai/verdict'
import { openingWords } from './lib/announce'
import { APP_NAME } from './lib/brand'
import type { Capabilities } from './lib/capabilities'
import { cn } from './lib/cn'
import { cropSettings, gridChip, gridOf, startCrop, turnCrop, type CropTool } from './lib/crop'
import { typing } from './lib/keys'
import { ACCEPT } from './lib/file-types'
import { DEFAULT_LAYERS, type LayerSettings } from './lib/forensics/layer'
import { filesFor, MODEL_NOT_LOADED } from './lib/ocr/files'
import { MODELS, type Models } from './lib/ocr/models'
import type { Script } from './lib/ocr/scripts'
import type { WorkerClient } from './lib/protocol'
import type { LatLon } from './lib/geo'
import { DEFAULT_ADJUST, type AdjustSettings } from './lib/plans/adjust'
import { planCropRotate } from './lib/plans/crop-rotate'
import { fieldsOf, pinOf, type MetadataFields } from './lib/plans/edit-metadata'
import { DEFAULT_REDACT, type RedactSettings } from './lib/plans/redact'
import { privacyFindings } from './lib/privacy'
import {
  EXPORT_KEY,
  parseExportSettings,
  parseStageSettings,
  parseTextScript,
  STAGE_KEY,
  TEXT_KEY,
  type ExportSettings,
  type StageSettings,
} from './lib/settings'
import { DEFAULT_TOOL, TOOLS, toolReason, type ToolId } from './lib/tools'
import { isLayer, shownView, stageViews, viewForTool, type StageView } from './lib/views'

/** Whether an <img> shows a result of `format`: JPEG, PNG and WebP everywhere, AVIF and JPEG XL as probed. */
const showsFormat = (format: string, capabilities: Capabilities) =>
  format === 'avif' || format === 'jxl' ? capabilities.shows[format] : true

/** The installed app's file handler (SPEC.md section 3), where the browser has one. */
type LaunchQueue = { setConsumer(consumer: (params: { files: { getFile(): Promise<File> }[] }) => void): void }

/** `supported`: whether this browser has WebAssembly and Web Workers; without them nothing can be opened.
 * `client` talks to the worker and `provenance` to the C2PA SDK; tests pass fakes. `capabilities` is what
 * the start-up probe found. `textStore` is where the Text tool downloads and keeps its files, and `textModels` what
 * they are; tests pass fakes of both. */
export function App({
  supported,
  client,
  capabilities,
  provenance: reader,
  textStore = BROWSER_STORE,
  textModels = MODELS,
}: {
  supported: boolean
  client: WorkerClient
  capabilities: Capabilities
  provenance: ProvenanceReader
  textStore?: TextStore
  textModels?: Models
}) {
  const { source, error, open: openSource, dismissError } = useSource(client, capabilities.shows)
  const job = useJob(client)
  // The open file's id, for what finishes after an await to tell whether its file is still open.
  const openId = useRef<number | null>(null)
  openId.current = source?.id ?? null
  // One banner for what went wrong opening a file, or opening it again after a cancel.
  const problem = error ?? job.error
  // Content Credentials are read alongside the worker's read (SPEC.md section 3).
  const provenance = useProvenance(reader, source?.file ?? null)
  const [tool, setTool] = useState<ToolId>(DEFAULT_TOOL)
  const [chosenView, setChosenView] = useState<StageView>('picture')
  const [tiles, setTiles] = useState(false)
  // Forensics' sliders, kept while the page is open.
  const [layerSettings, setLayerSettings] = useState<LayerSettings>(DEFAULT_LAYERS)
  // Edit metadata's form, kept here so it outlasts a visit to another tool and the map can place its pin; null
  // until the user changes something, when the fields are the file's own.
  const [edits, setEdits] = useState<MetadataFields | null>(null)
  // Crop and rotate's settings, kept likewise and shared with the frame on the stage; null until changed. `before`
  // while \ is held: the stage shows the picture as it was.
  const [cropEdit, setCropEdit] = useState<CropTool | null>(null)
  // Redact's settings and the selected box, kept likewise and shared with the boxes on the stage.
  const [redact, setRedact] = useState<RedactSettings>(DEFAULT_REDACT)
  const [selectedBox, setSelectedBox] = useState<number | null>(null)
  // Adjust's sliders, kept likewise and previewed on the stage.
  const [adjust, setAdjust] = useState<AdjustSettings>(DEFAULT_ADJUST)
  // Export's settings carry over to the next file and are kept between visits (SPEC.md 6.11).
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() =>
    parseExportSettings(localStorage.getItem(EXPORT_KEY)),
  )
  // The Text tool's script, remembered; its files, downloaded by the page; and its reads, kept per file and script.
  const [script, setScript] = useState<Script>(() =>
    parseTextScript(localStorage.getItem(TEXT_KEY), navigator.languages ?? []),
  )
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const textFiles = useTextFiles(textStore, textModels)
  const readText = useCallback<WorkerClient['text']>((s, onProgress) => client.text(s, onProgress), [client])
  const textReads = useTextReads(readText, source?.id)
  const [before, setBefore] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null)
  const [stage, setStageSettings] = useState<StageSettings>(() => parseStageSettings(localStorage.getItem(STAGE_KEY)))
  const input = useRef<HTMLInputElement>(null)

  const onStageSettings = useCallback((next: StageSettings) => {
    setStageSettings(next)
    localStorage.setItem(STAGE_KEY, JSON.stringify(next))
  }, [])
  const onExportSettings = useCallback((next: ExportSettings) => {
    setExportSettings(next)
    localStorage.setItem(EXPORT_KEY, JSON.stringify(next))
  }, [])

  const info = source?.info ?? null
  const fields = edits ?? (info ? fieldsOf(info) : null)
  const crop = cropEdit ?? (info ? startCrop(info) : null)
  // Edit metadata's Location on Set: the map is where the new location goes (SPEC.md 6.7).
  const settingLocation = fields?.location === 'set'
  const picking = tool === 'edit-metadata' && settingLocation

  // A tool can switch the stage's view (Location to Map, and back).
  const chooseTool = useCallback(
    (next: ToolId) => {
      setChosenView((current) => viewForTool(current, tool, next, settingLocation))
      setTool(next)
    },
    [tool, settingLocation],
  )

  // Choosing Set switches the stage to the map, and leaving it switches back.
  const onFields = (next: MetadataFields) => {
    if ((next.location === 'set') !== settingLocation) setChosenView(next.location === 'set' ? 'map' : 'picture')
    setEdits(next)
  }
  const onPin = useCallback(
    (at: LatLon) => setEdits((current) => current && { ...current, lat: at.lat.toFixed(6), lon: at.lon.toFixed(6) }),
    [],
  )

  // A newly opened file starts on its default tool and the picture. A running job is cancelled first, if the
  // user says so (SPEC.md section 3).
  const { state: jobState, cancel: cancelJob, dismissError: dismissJobError } = job
  const open = useCallback(
    (next: File) => {
      if (jobState.phase === 'running') {
        if (!window.confirm('Cancel the running job and open the new file?')) return
        void cancelJob()
      }
      openSource(next)
      dismissJobError()
      setTool(DEFAULT_TOOL)
      setChosenView('picture')
      setEdits(null)
      setCropEdit(null)
      setRedact(DEFAULT_REDACT)
      setSelectedBox(null)
      setAdjust(DEFAULT_ADJUST)
      setSelectedLine(null)
    },
    [openSource, jobState.phase, cancelJob, dismissJobError],
  )

  // Files dropped or pasted anywhere on the window. Always cancel a drop, or the browser opens what's
  // dropped in place of the app. A paste with no files (text into a field) is left alone.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types ?? []).includes('Files')
    const over = (e: DragEvent) => {
      e.preventDefault()
      if (supported && hasFiles(e)) setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const dropped = e.dataTransfer?.files?.[0]
      if (supported && dropped) open(dropped)
    }
    const paste = (e: ClipboardEvent) => {
      const pasted = e.clipboardData?.files?.[0]
      if (supported && pasted) open(pasted)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [supported, open])

  // The installed app launched with a file.
  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue
    if (!supported || !queue) return
    queue.setConsumer(async ({ files }) => {
      if (files[0]) open(await files[0].getFile())
    })
  }, [supported, open])

  // L toggles the magnifier anywhere but where typing happens.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!source || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === 'l' || e.key === 'L') onStageSettings({ ...stage, magnifier: !stage.magnifier })
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [source, stage, onStageSettings])

  // While Crop and rotate is open, [ and ] turn the picture (SPEC.md 6.8). There and in Redact and Adjust, \ held
  // shows the picture as it was (6.9, 6.10).
  const cropping = tool === 'crop' && !!info && !toolReason('crop', info)
  const redacting = tool === 'redact' && !!info && !toolReason('redact', info)
  const adjusting = tool === 'adjust' && !!info && !toolReason('adjust', info)
  const latestCrop = useRef({ crop, info })
  latestCrop.current = { crop, info }
  useEffect(() => {
    if (!cropping && !redacting && !adjusting) return
    const down = (e: KeyboardEvent) => {
      const { crop, info } = latestCrop.current
      if (!crop || !info || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (cropping && (e.key === '[' || e.key === ']'))
        setCropEdit(turnCrop(crop, info, e.key === '[' ? 'left' : 'right'))
      else if (e.key === '\\') setBefore(true)
      else return
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => e.key === '\\' && setBefore(false)
    const away = () => setBefore(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', away)
      setBefore(false)
    }
  }, [cropping, redacting, adjusting])
  const cropGrid = cropping && crop && info ? gridOf(crop, info) : null
  const cropChip =
    cropGrid && crop && info && planCropRotate(info, cropSettings(crop)).plan?.kind === 'jpegtran'
      ? gridChip(cropGrid)
      : null

  // Text reads the open picture once its script's files are held: on opening the tool, and on changing script.
  const textOpen = tool === 'text'
  const { check: checkTextFiles } = textFiles
  useEffect(() => {
    if (textOpen) checkTextFiles()
  }, [textOpen, checkTextFiles])
  const held = textFiles.held
  const scriptHeld = !!held && filesFor(script, textModels).every((f) => held.includes(f.path))
  const read = textReads.reads[script] ?? null
  const reading = textOpen && !!info && !toolReason('text', info)
  const { start: startRead } = textReads
  useEffect(() => {
    if (reading && scriptHeld && !read) startRead(script)
  }, [reading, scriptHeld, read, script, startRead])
  // Files the browser cleared since they were checked: look again, and the tool asks to download them.
  const modelGone = read?.status === 'failed' && read.message === MODEL_NOT_LOADED
  useEffect(() => {
    if (modelGone) checkTextFiles()
  }, [modelGone, checkTextFiles])
  // Opening Text switches to its boxes once lines are found (SPEC.md 5).
  const linesFound = read?.status === 'read' && read.lines.length > 0
  useEffect(() => {
    if (textOpen && linesFound) setChosenView('text')
  }, [textOpen, linesFound, script, source?.id])
  const onScript = (next: Script) => {
    setScript(next)
    setSelectedLine(null)
    localStorage.setItem(TEXT_KEY, JSON.stringify({ script: next }))
  }

  const reasons = useMemo(
    () => Object.fromEntries(TOOLS.flatMap((t) => (toolReason(t.id, info) ? [[t.id, toolReason(t.id, info)]] : []))),
    [info],
  )
  const toolName = TOOLS.find((t) => t.id === tool)?.label
  // Forensics' layers are drawn over the picture, so they need one the stage can show.
  const shows = !!source?.picture && source.picture.type !== 'none'
  const layers = tool === 'forensics' && shows
  // Export's newest result from this file, which the Compare view sets against it.
  const exportTag = source ? `export:${source.id}` : ''
  const compared = job.exports.find((e): e is Made => e.tag === exportTag && !!e.url && !!e.png)
  const context = {
    picking,
    layers,
    shows,
    webgl2: capabilities.webgl2,
    compare: tool === 'export' && !!compared,
    text: textOpen && read?.status === 'read',
  }
  const views = stageViews(info, context)
  const view = shownView(chosenView, info, context)
  const layer = useLayer(
    isLayer(view) ? view : null,
    layerSettings,
    (kind, quality, amount) => client.layer(kind, quality, amount),
    source?.id,
  )
  // The AI check's verdict, once ImageInfo and the Content Credentials (or the SDK's failure) are in.
  const credentials = provenance.status === 'read' ? provenance.credentials : null
  const credentialsKnown = provenance.status === 'read' || provenance.status === 'failed'
  const verdict = useMemo(
    () =>
      info && credentialsKnown
        ? verdictOf({ credentials, sourceType: info.sourceType, generators: info.generators })
        : null,
    [info, credentialsKnown, credentials],
  )
  // Privacy waits for the Content Credentials too: they're one of its findings.
  const privacy = useMemo(
    () => (info && credentialsKnown ? privacyFindings(info, credentials) : null),
    [info, credentialsKnown, credentials],
  )

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="app flex min-h-dvh flex-col lg:grid lg:h-dvh lg:grid-cols-[72px_320px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        {/* Over the rail and settings only, as on the sister sites, so the stage runs the full height. */}
        <header className="flex h-14 items-center justify-between gap-2 border-b border-line bg-panel px-4 lg:col-span-2 lg:row-start-1 lg:border-r lg:px-5">
          <div className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <span className="text-[15px] font-semibold">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeMenu />
            <AboutDialog trustBundledOn={provenance.bundledOn} />
            <AppLauncher />
          </div>
        </header>

        {/* The page's order is desktop's (tools, settings, stage); narrow screens move the stage up. */}
        <nav
          aria-label="Tool rail"
          className="order-3 min-h-0 border-b border-line bg-panel lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:border-r lg:border-b-0"
        >
          <ToolRail value={source ? tool : null} disabled={!source} reasons={reasons} onChange={chooseTool} />
        </nav>

        <aside className="order-4 flex min-h-0 flex-col bg-panel lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:border-r lg:border-line">
          {problem && (
            <div
              role="alert"
              className="mx-5 mt-4 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] text-ink shadow-[0_0_0_1px_var(--color-danger)]"
            >
              <p className="flex-1">{problem}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  dismissError()
                  dismissJobError()
                }}
                className="-m-0.5 rounded-control p-0.5 text-ink-soft hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          {source && (
            <div className="border-b border-line px-5 py-4">
              <FileCard source={source} onReplace={() => input.current?.click()} />
            </div>
          )}
          <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 py-6">
            {source ? (
              <section aria-labelledby="tool-heading" className="flex flex-col gap-4">
                <h2 id="tool-heading" className="text-sm font-semibold">
                  {toolName}
                </h2>
                {reasons[tool] ? (
                  <p className="text-[13px] text-ink-soft">{reasons[tool]}</p>
                ) : tool === 'info' ? (
                  <InfoView
                    source={source}
                    ai={verdict}
                    privacy={privacy?.length ?? null}
                    sheetContainer={stageEl}
                    onTool={chooseTool}
                  />
                ) : tool === 'location' ? (
                  source.info ? (
                    <LocationView info={source.info} tiles={tiles && view === 'map'} />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'privacy' ? (
                  source.info ? (
                    <PrivacyView
                      key={source.id}
                      info={source.info}
                      findings={privacy}
                      job={job.state}
                      onRun={job.start}
                      onCancel={() => void job.cancel()}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'edit-metadata' ? (
                  source.info && fields ? (
                    <EditMetadataView
                      info={source.info}
                      fields={fields}
                      onFields={onFields}
                      signed={!!privacy?.some((f) => f.id === 'credentials')}
                      job={job.state}
                      onRun={job.start}
                      onCancel={() => void job.cancel()}
                      onPrivacy={() => chooseTool('privacy')}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'forensics' ? (
                  source.info ? (
                    <ForensicsView
                      key={source.id}
                      info={source.info}
                      shows={shows}
                      view={view}
                      onView={setChosenView}
                      settings={layerSettings}
                      onSettings={setLayerSettings}
                      client={client}
                      canCopy={capabilities.clipboardImage}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'text' ? (
                  source.info ? (
                    <TextView
                      script={script}
                      onScript={onScript}
                      files={textFiles}
                      models={textModels}
                      read={read}
                      onDownload={() => {
                        textReads.forget(script)
                        textFiles.download(script)
                      }}
                      onRetry={() => textReads.start(script)}
                      selected={selectedLine}
                      onSelect={setSelectedLine}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'extract' ? (
                  source.info ? (
                    <ExtractView
                      key={source.id}
                      info={source.info}
                      extract={(item) => client.extract(item)}
                      isOpen={() => openId.current === source.id}
                      credentials={
                        provenance.status === 'read'
                          ? (provenance.store ?? 'This file has no Content Credentials the C2PA SDK could read.')
                          : provenance.status === 'failed'
                            ? provenance.message
                            : 'Still reading the Content Credentials. Try again in a moment.'
                      }
                      onOpen={open}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'crop' ? (
                  source.info && crop ? (
                    <CropRotateView
                      info={source.info}
                      tool={crop}
                      onTool={setCropEdit}
                      job={job.state}
                      onRun={job.start}
                      onCancel={() => void job.cancel()}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'redact' ? (
                  source.info ? (
                    <RedactView
                      info={source.info}
                      settings={redact}
                      onSettings={setRedact}
                      job={job.state}
                      onRun={job.start}
                      onCancel={() => void job.cancel()}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'adjust' ? (
                  source.info ? (
                    <AdjustView
                      info={source.info}
                      settings={adjust}
                      onSettings={setAdjust}
                      job={job.state}
                      onRun={job.start}
                      onCancel={() => void job.cancel()}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'export' ? (
                  source.info ? (
                    <ExportView
                      info={source.info}
                      settings={exportSettings}
                      onSettings={onExportSettings}
                      tag={exportTag}
                      job={job.state}
                      onRun={job.start}
                      onCancel={() => void job.cancel()}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : tool === 'ai' ? (
                  source.info ? (
                    <AiCheckView
                      info={source.info}
                      provenance={provenance}
                      verdict={verdict}
                      png={() => client.png()}
                      capabilities={capabilities}
                    />
                  ) : (
                    <p className="text-[13px] text-ink-soft">Reading metadata…</p>
                  )
                ) : null}
              </section>
            ) : (
              <section>
                <h2 className="text-sm font-semibold">No image open</h2>
                <p className="mt-1 text-xs text-ink-soft">
                  {supported
                    ? 'Open a picture to inspect or edit it. It stays on your device.'
                    : 'This browser can’t run Loupe’s tools.'}
                </p>
              </section>
            )}
          </div>
        </aside>

        <main
          ref={setStageEl}
          className="relative order-2 flex min-h-[55dvh] min-w-0 flex-col lg:order-none lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:min-h-0"
        >
          {supported && (
            <>
              <label className="sr-only" htmlFor="choose-file">
                Choose file
              </label>
              <input
                ref={input}
                id="choose-file"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const chosen = e.target.files?.[0]
                  if (chosen) open(chosen)
                  e.target.value = ''
                }}
              />
            </>
          )}
          <Stage
            supported={supported}
            source={source}
            settings={stage}
            onSettings={onStageSettings}
            onBrowse={() => input.current?.click()}
            pixel={client.pixel}
            pixels={(maxSide) => client.pixels(maxSide)}
            adjusted={(maxSide, adjustments) => client.adjusted(maxSide, adjustments)}
            views={views}
            view={view}
            onView={setChosenView}
            onTiles={setTiles}
            pick={picking && fields ? { pin: pinOf(fields), onPin } : undefined}
            layer={layer}
            crop={cropping && crop && !before ? { tool: crop, onTool: setCropEdit, chip: cropChip } : undefined}
            redact={
              redacting && !before
                ? {
                    boxes: redact.boxes,
                    fill: redact.fill,
                    // A box deleted from the list can leave the selection past the end.
                    selected: selectedBox !== null && selectedBox < redact.boxes.length ? selectedBox : null,
                    onBoxes: (boxes) => setRedact((current) => ({ ...current, boxes })),
                    onSelect: setSelectedBox,
                  }
                : undefined
            }
            adjust={adjusting && !before ? adjust.adjustments : undefined}
            text={
              read?.status === 'read'
                ? { lines: read.lines, selected: selectedLine, onSelect: setSelectedLine }
                : undefined
            }
            compare={
              compared?.png
                ? {
                    result: {
                      id: compared.id,
                      url: compared.url,
                      shown: showsFormat(compared.png.format, capabilities),
                      png: () => client.png(compared.png!),
                    },
                    originalPng: () => client.png(),
                  }
                : undefined
            }
          />
        </main>

        <ExportsStrip
          exports={job.exports}
          note={job.note}
          busy={job.state.phase !== 'idle'}
          canCopy={capabilities.clipboardImage}
          onUse={job.used}
          onCopy={(id) => void job.copy(id)}
          onOpen={(item) => {
            job.used(item.id)
            open(new File([item.blob], item.name, { type: item.blob.type, lastModified: Date.now() }))
          }}
          onRemove={job.remove}
        />

        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-panel border-2 border-dashed border-accent bg-accent-soft/80 text-base font-semibold text-accent-text backdrop-blur-sm transition-opacity duration-150',
            dragging ? 'opacity-100' : 'opacity-0',
          )}
        >
          Drop to open
        </div>
      </div>
      {/* Always there, so the first words are announced as well. */}
      <p role="status" aria-label="Opening" className="sr-only">
        {openingWords(source && { name: source.file.name, metadata: !!source.info, credentials: credentialsKnown })}
      </p>
      <UpdateBanner atStake={{ running: job.state.phase === 'running', undownloaded: job.unused }} />
    </Tooltip.Provider>
  )
}
