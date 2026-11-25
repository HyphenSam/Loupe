import { X } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { AppLauncher } from './components/AppLauncher'
import { FileCard } from './components/FileCard'
import { InfoView } from './components/InfoView'
import { Logo } from './components/Logo'
import { Stage } from './components/stage/Stage'
import { ThemeMenu } from './components/ThemeMenu'
import { ToolRail } from './components/ToolRail'
import { UpdateBanner } from './components/UpdateBanner'
import { useSource } from './hooks/useSource'
import { APP_NAME } from './lib/brand'
import type { Capabilities } from './lib/capabilities'
import { cn } from './lib/cn'
import { typing } from './lib/keys'
import { ACCEPT } from './lib/file-types'
import type { WorkerClient } from './lib/protocol'
import { parseStageSettings, STAGE_KEY, type StageSettings } from './lib/settings'
import { DEFAULT_TOOL, TOOLS, toolReason, type ToolId } from './lib/tools'

const NOTHING_AT_STAKE = { running: false, undownloaded: 0 }

/** The installed app's file handler (SPEC.md section 3), where the browser has one. */
type LaunchQueue = { setConsumer(consumer: (params: { files: { getFile(): Promise<File> }[] }) => void): void }

/** `supported`: whether this browser has WebAssembly and Web Workers; without them nothing can be opened.
 * `client` talks to the worker; tests pass a fake. `capabilities` is what the start-up probe found. */
export function App({
  supported,
  client,
  capabilities,
}: {
  supported: boolean
  client: WorkerClient
  capabilities: Capabilities
}) {
  const { source, error, open: openSource, dismissError } = useSource(client, capabilities.shows)
  const [tool, setTool] = useState<ToolId>(DEFAULT_TOOL)
  const [dragging, setDragging] = useState(false)
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null)
  const [stage, setStageSettings] = useState<StageSettings>(() => parseStageSettings(localStorage.getItem(STAGE_KEY)))
  const input = useRef<HTMLInputElement>(null)

  const onStageSettings = useCallback((next: StageSettings) => {
    setStageSettings(next)
    localStorage.setItem(STAGE_KEY, JSON.stringify(next))
  }, [])

  // A newly opened file starts on its default tool.
  const open = useCallback(
    (next: File) => {
      openSource(next)
      setTool(DEFAULT_TOOL)
    },
    [openSource],
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

  const info = source?.info ?? null
  const reasons = useMemo(
    () => Object.fromEntries(TOOLS.flatMap((t) => (toolReason(t.id, info) ? [[t.id, toolReason(t.id, info)]] : []))),
    [info],
  )
  const toolName = TOOLS.find((t) => t.id === tool)?.label

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex min-h-dvh flex-col lg:grid lg:h-dvh lg:grid-cols-[72px_320px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        {/* Over the rail and settings only, as on the sister sites, so the stage runs the full height. */}
        <header className="flex h-14 items-center justify-between gap-2 border-b border-line bg-panel px-4 lg:col-span-2 lg:row-start-1 lg:border-r lg:px-5">
          <div className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <span className="text-[15px] font-semibold">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeMenu />
            <AboutDialog />
            <AppLauncher />
          </div>
        </header>

        {/* The page's order is desktop's (tools, settings, stage); narrow screens move the stage up. */}
        <nav
          aria-label="Tool rail"
          className="order-3 min-h-0 border-b border-line bg-panel lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:border-r lg:border-b-0"
        >
          <ToolRail value={source ? tool : null} disabled={!source} reasons={reasons} onChange={setTool} />
        </nav>

        <aside className="order-4 flex min-h-0 flex-col bg-panel lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:border-r lg:border-line">
          {error && (
            <div
              role="alert"
              className="mx-5 mt-4 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] text-ink shadow-[0_0_0_1px_var(--color-danger)]"
            >
              <p className="flex-1">{error}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={dismissError}
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
                  <InfoView source={source} sheetContainer={stageEl} onTool={setTool} />
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
          className="relative order-2 flex min-h-[55dvh] min-w-0 flex-col lg:order-none lg:col-start-3 lg:row-span-3 lg:row-start-1 lg:min-h-0"
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
          />
        </main>

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
      <UpdateBanner atStake={NOTHING_AT_STAKE} />
    </Tooltip.Provider>
  )
}
