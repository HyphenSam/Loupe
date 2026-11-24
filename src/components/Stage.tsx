import { ImageUp, MonitorX } from 'lucide-react'
import { Button } from './ui/Button'

/** The dark area where the picture sits: the drop target before a file is open, the picture with its
 * toolbar once one is, or why this browser can't be used. */
export function Stage({ supported, open, onBrowse }: { supported: boolean; open: boolean; onBrowse: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-stage p-4 text-stage-ink lg:p-5">
      {!supported ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <MonitorX aria-hidden="true" className="size-6 text-stage-ink-soft" strokeWidth={1.75} />
          <h2 className="text-lg leading-snug font-semibold">This browser is too old for Loupe</h2>
          <p className="max-w-sm text-[13px] text-stage-ink-soft">
            Loupe needs WebAssembly and Web Workers. Any current version of Chrome, Edge, Firefox or Safari has both.
          </p>
        </div>
      ) : open ? (
        <div className="relative flex flex-1 flex-col">
          {/* The views, zoom, background and magnifier join this as they arrive (DESIGN.md). */}
          <div
            role="toolbar"
            aria-label="Stage"
            className="flex h-9 items-center gap-1 self-center rounded-full bg-black/55 p-1 text-[13px] backdrop-blur-sm"
          >
            <span className="flex h-7 items-center rounded-full bg-white/15 px-3 font-medium text-stage-ink">
              Picture
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-panel border-2 border-dashed border-stage-line px-6 py-10 text-center">
          <ImageUp aria-hidden="true" className="size-6 text-stage-ink-soft" strokeWidth={1.75} />
          <div>
            <h2 className="text-lg leading-snug font-semibold">Drop an image here</h2>
            <p className="mt-1 max-w-sm text-xs text-stage-ink-soft">
              JPEG, PNG, WebP, AVIF, HEIC, JPEG XL, GIF, BMP, TIFF or a camera raw file. You can also paste one.
            </p>
          </div>
          <Button variant="primary" onClick={onBrowse}>
            Choose file
          </Button>
          <p className="mt-4 text-xs text-stage-ink-soft">Runs on your device. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  )
}
