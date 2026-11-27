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
import { changeEdit, deleteBox, editFor, freshEdit, placePin, type EditChange, type FileEdit } from './lib/file-edit'
import { DEFAULT_LAYERS, type LayerSettings } from './lib/forensics/layer'
import { filesFor, MODEL_NOT_LOADED } from './lib/ocr/files'
import { MODELS, type Models } from './lib/ocr/models'
import type { Script } from './lib/ocr/scripts'
import type { WorkerClient } from './lib/protocol'
import type { LatLon } from './lib/geo'
import { planCropRotate } from './lib/plans/crop-rotate'
import { fieldsOf, pinOf, type MetadataFields } from './lib/plans/edit-metadata'
import { privacyFindings } from './lib/privacy'
import {
  EXPORT_KEY,
  loadSetting,
  parseExportSettings,
  parseStageSettings,
  parseTextScript,
  saveSetting,
  STAGE_KEY,
  TEXT_KEY,
  type ExportSettings,
  type StageSettings,
} from './lib/settings'
import { TOOLS, toolReason, type ToolId } from './lib/tools'
import { isLayer, nextView, shownView, stageViews, type StageView, type ViewEvent } from './lib/views'

/** Whether an <img> shows a result of `format`: JPEG, PNG and WebP everywhere, AVIF and JPEG XL as probed. */
const showsFormat = (format: string, capabilities: Capabilities) =>
  format === 'avif' || format === 'jxl' ? capabilities.shows[format] : true

/** The installed app's file handler (SPEC.md section 3), where the browser has one. */
type LaunchQueue = { setConsumer(consumer: (params: { files: { getFile(): Promise<File> }[] }) => void): void }

/** `supported`: whether this browser has WebAssembly and Web Workers; without them nothing can be opened.
 * `client` talks to the worker and `provenance` to the C2PA SDK; tests pass fakes. `client` must be the same object
 * for the page's life: `useLayer`'s, `ForensicsView`'s two and `useCopyAndOpen`'s effects leave its functions out of
 * their dependencies on that ground, so a new client would leave them calling the old one. `capabilities` is what
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
  // The open file, for what finishes after an await to tell whether its file is still open, and for changes to the
  // file's edits made from callbacks.
  const shown = useRef(source)
  shown.current = source
  // One banner for what went wrong opening a file, or opening it again after a cancel.
  const problem = error ?? job.error
  // Content Credentials are read alongside the worker's read (SPEC.md section 3).
  const provenance = useProvenance(reader, source?.file ?? null)
  // The open file's tool, view and edits, kept here so they outlast a visit to another tool and the stage shares
  // them (the map's pin, the crop frame, redaction boxes, Adjust's preview, the Text tool's boxes). They start afresh
  // once a new file shows, and come back if it fails (file-edit.ts).
  const [storedEdit, setStoredEdit] = useState<FileEdit>(() => freshEdit(null))
  const edit = editFor(storedEdit, source)
  const change = useCallback(
    (next: EditChange | ((current: FileEdit) => EditChange)) =>
      setStoredEdit((stored) => changeEdit(stored, shown.current, next)),
    [],
  )
  const { tool, view: chosenView, edits, crop: cropEdit, redact, selectedBox, adjust, selectedLine } = edit
  const [tiles, setTiles] = useState(false)
  // Forensics' sliders, kept while the page is open.
  const [layerSettings, setLayerSettings] = useState<LayerSettings>(DEFAULT_LAYERS)
  // Export's settings carry over to the next file and are kept between visits (SPEC.md 6.11).
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() =>
    parseExportSettings(loadSetting(EXPORT_KEY)),
  )
  // The Text tool's script, remembered; its files, downloaded by the page; and its reads, kept per file and script.
  const [script, setScript] = useState<Script>(() => parseTextScript(loadSetting(TEXT_KEY), navigator.languages ?? []))
  const textFiles = useTextFiles(textStore, textModels)
  const readText = useCallback<WorkerClient['text']>((s, onProgress) => client.text(s, onProgress), [client])
  const textReads = useTextReads(readText, source?.id)
  // While \ is held in Crop and rotate, Redact or Adjust: the stage shows the picture as it was.
  const [before, setBefore] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null)
  const [stage, setStageSettings] = useState<StageSettings>(() => parseStageSettings(loadSetting(STAGE_KEY)))
  const input = useRef<HTMLInputElement>(null)

  const onStageSettings = useCallback((next: StageSettings) => {
    setStageSettings(next)
    saveSetting(STAGE_KEY, next)
  }, [])
  const onExportSettings = useCallback((next: ExportSettings) => {
    setExportSettings(next)
    saveSetting(EXPORT_KEY, next)
  }, [])

  const info = source?.info ?? null
  const fields = edits ?? (info ? fieldsOf(info) : null)
  const crop = cropEdit ?? (info ? startCrop(info) : null)
  // Edit metadata's Location on Set: the map is where the new location goes (SPEC.md 6.7).
  const settingLocation = fields?.location === 'set'
  const picking = tool === 'edit-metadata' && settingLocation

  // The stage's view changes only through views.ts's `nextView`, from the events below.
  const viewEvent = useCallback(
    (event: ViewEvent) => change((current) => ({ view: nextView(current.view, event) })),
    [change],
  )
  const chooseView = useCallback((view: StageView) => viewEvent({ type: 'choose', view }), [viewEvent])
  const chooseTool = useCallback(
    (next: ToolId) =>
      change((current) => ({
        view: nextView(current.view, { type: 'tool', from: current.tool, to: next, picking: settingLocation }),
        tool: next,
      })),
    [change, settingLocation],
  )
  const setCropEdit = useCallback((crop: CropTool) => change({ crop }), [change])
  const setSelectedLine = useCallback((selectedLine: number | null) => change({ selectedLine }), [change])

  const onFields = (next: MetadataFields) => {
    const picks = next.location === 'set'
    change((current) => ({
      edits: next,
      ...(picks !== settingLocation && { view: nextView(current.view, { type: 'picking', picking: picks }) }),
    }))
  }
  const onPin = useCallback(
    (at: LatLon) => {
      const info = shown.current?.info
      if (info) change((current) => placePin(current, info, at))
    },
    [change],
  )

  // A running job is cancelled first, if the user says so (SPEC.md section 3). The new file's tool and edits start
  // afresh once it shows (`editFor`), not here, so a file that can't be opened loses nothing.
  const { state: jobState, cancel: cancelJob, dismissError: dismissJobError } = job
  const open = useCallback(
    (next: File) => {
      if (jobState.phase === 'running') {
        if (!window.confirm('Cancel the running job and open the new file?')) return
        void cancelJob()
      }
      openSource(next)
      dismissJobError()
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
  // A new read's lines needn't be the last read's, so the selected line goes when one starts.
  const { start: startRead } = textReads
  const readScript = useCallback(
    (s: Script) => {
      change({ selectedLine: null })
      startRead(s)
    },
    [change, startRead],
  )
  useEffect(() => {
    if (reading && scriptHeld && !read) readScript(script)
  }, [reading, scriptHeld, read, script, readScript])
  // Files the browser cleared since they were checked: look again, and the tool asks to download them.
  const modelGone = read?.status === 'failed' && read.message === MODEL_NOT_LOADED
  useEffect(() => {
    if (modelGone) checkTextFiles()
  }, [modelGone, checkTextFiles])
  // Opening Text switches to its boxes once lines are found (SPEC.md 5).
  const linesFound = read?.status === 'read' && read.lines.length > 0
  useEffect(() => {
    if (textOpen && linesFound) viewEvent({ type: 'lines' })
  }, [textOpen, linesFound, script, source?.id, viewEvent])
  const onScript = (next: Script) => {
    setScript(next)
    change({ selectedLine: null })
    saveSetting(TEXT_KEY, { script: next })
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
  // A view no longer on offer is forgotten, so it doesn't come back by itself (SPEC.md 5). Not before the file's info
  // is in: until then a file that fails to open gives the previous one back with its view.
  const offered = info ? views.join(' ') : null
  useEffect(() => {
    if (offered) viewEvent({ type: 'offered', views: offered.split(' ') as StageView[] })
  }, [offered, viewEvent])
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
                      onView={chooseView}
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
                        if (textFiles.download(script)) textReads.forget(script)
                      }}
                      onRemove={() => {
                        textFiles.remove()
                        // A worker that stopped or was replaced holds no models.
                        client.releaseText().catch(() => {})
                      }}
                      onRetry={() => readScript(script)}
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
                      isOpen={() => shown.current?.id === source.id}
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
                      onSettings={(redact) => change({ redact })}
                      onDelete={(index) => change((current) => deleteBox(current, index))}
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
                      onSettings={(adjust) => change({ adjust })}
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
            onView={chooseView}
            onTiles={setTiles}
            pick={picking && fields ? { pin: pinOf(fields), onPin } : undefined}
            layer={layer}
            crop={cropping && crop && !before ? { tool: crop, onTool: setCropEdit, chip: cropChip } : undefined}
            redact={
              redacting && !before
                ? {
                    boxes: redact.boxes,
                    fill: redact.fill,
                    selected: selectedBox,
                    onBoxes: (boxes) => change((current) => ({ redact: { ...current.redact, boxes } })),
                    onSelect: (selectedBox) => change({ selectedBox }),
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
