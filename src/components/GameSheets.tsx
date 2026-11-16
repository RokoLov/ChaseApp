import QRCode from 'qrcode'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { clock } from '../lib/br'
import { Button } from './ui'

/** What a catch code looks like inside a QR code. */
export const qrText = (code: string) => `CHASE-${code}`
const codeFromQr = (text: string) => text.match(/(\d{4})\s*$/)?.[1] ?? null

/** A QR code picture. Always dark on white so every camera can read it. */
export function Qr({ text, className }: { text: string; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 480 }).then(setSrc, () => setSrc(''))
  }, [text])
  return src ? <img src={src} alt="QR code" className={`bg-white ${className ?? ''}`} /> : <div className={className} />
}

/** A full-screen panel that slides over the game screen. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="flex items-center">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <button type="button" aria-label="Close" onClick={onClose} className="ml-auto h-11 w-11 text-xl text-muted">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function CodeSheet({ code, onClose }: { code: string; onClose: () => void }) {
  return (
    <Sheet title="My code" onClose={onClose}>
      <p className="text-sm text-muted">Show this to the hunter who found you.</p>
      <Qr text={qrText(code)} className="mx-auto w-full max-w-[300px] rounded-2xl p-3" />
      <div className="flex flex-col items-center">
        <span className="text-[13px] text-muted">or tell them your code</span>
        <span className="font-display text-[56px] font-bold leading-tight tracking-[0.15em]">{code}</span>
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <p className="text-center text-xs text-muted">When your code is entered, you become a hunter.</p>
        <Button kind="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Sheet>
  )
}

/** Scan a hider's QR code with the camera, or type their 4 digits. */
export function CatchSheet({
  onSubmit,
  onClose,
}: {
  /** Try the code. Resolves on success, rejects with a message for the player. */
  onSubmit: (code: string) => Promise<void>
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting')
  const busy = useRef(false)

  async function submit(code: string) {
    if (busy.current) return
    busy.current = true
    setError('')
    try {
      await onSubmit(code)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The catch did not go through.')
      // A short pause so the camera does not send the same wrong code again at once.
      await new Promise((r) => setTimeout(r, 1500))
    }
    busy.current = false
  }
  const submitRef = useRef(submit)
  submitRef.current = submit

  useEffect(() => {
    let stopped = false
    let stop = () => {}
    import('qr-scanner')
      .then(({ default: QrScanner }) => {
        if (stopped || !video.current) return
        const scanner = new QrScanner(
          video.current,
          (result) => {
            const code = codeFromQr(result.data)
            if (code) void submitRef.current(code)
          },
          { preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 5 },
        )
        stop = () => {
          scanner.stop()
          scanner.destroy()
        }
        scanner.start().then(
          () => !stopped && setCamera('on'),
          () => !stopped && setCamera('off'),
        )
      })
      .catch(() => setCamera('off'))
    return () => {
      stopped = true
      stop()
    }
  }, [])

  return (
    <Sheet title="Catch a hider" onClose={onClose}>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-raised">
        <video ref={video} className="h-full w-full object-cover" muted playsInline />
        {camera !== 'on' && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
            {camera === 'starting'
              ? 'Starting the camera…'
              : 'The camera is not available. Type the hider’s code instead.'}
          </p>
        )}
      </div>
      <p className="font-display text-sm font-medium">or type their 4-digit code</p>
      <input
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))
          setError('')
        }}
        inputMode="numeric"
        autoComplete="off"
        aria-label="Hider's code"
        placeholder="····"
        className="h-16 w-full rounded-2xl border-[1.5px] border-line bg-surface text-center font-display text-3xl font-bold tracking-[0.5em] outline-none placeholder:text-line focus:border-brand-ink"
      />
      {error && (
        <div role="alert" className="rounded-xl bg-danger/15 p-3 text-sm font-semibold text-danger-ink">
          {error}
        </div>
      )}
      <div className="mt-auto">
        <Button onClick={() => void submit(typed)} disabled={typed.length !== 4}>
          Confirm catch
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * Pocket mode: a black screen that ignores touches, so the phone can sit in a pocket
 * with the screen on. Holding the ring for a moment unlocks it.
 */
export function Pocket({ timeLeftMs, onUnlock }: { timeLeftMs: number; onUnlock: () => void }) {
  const timer = useRef<number | null>(null)
  const [holding, setHolding] = useState(false)

  function down() {
    setHolding(true)
    timer.current = window.setTimeout(onUnlock, 1200)
  }
  function up() {
    setHolding(false)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => up, [])

  return (
    <div className="fixed inset-0 z-50 flex touch-none select-none flex-col items-center bg-black px-8 pb-16 pt-24 text-center">
      <div className="mt-auto flex flex-col items-center gap-2">
        <span className="font-display font-medium text-neutral-500">Pocket mode</span>
        <span className="font-display text-[52px] font-bold leading-none text-neutral-600">{clock(timeLeftMs)}</span>
        <span className="text-sm text-neutral-600">Screen is locked. Sounds will tell you what happens.</span>
      </div>
      <div className="mt-auto flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label="Hold to unlock"
          onPointerDown={down}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
          className={`h-24 w-24 rounded-full border-2 transition-all duration-1000 ${
            holding ? 'scale-110 border-neutral-200 bg-neutral-800' : 'border-neutral-600'
          }`}
        />
        <span className="font-display text-sm font-medium text-neutral-500">Hold to unlock</span>
      </div>
    </div>
  )
}
