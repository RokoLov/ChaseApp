import { useEffect, useState } from 'react'

type Lock = { release: () => Promise<void> }
type WakeLockApi = { request: (type: 'screen') => Promise<Lock> }

/**
 * Keep the screen from switching off while `active` is true. A web app stops running
 * when the screen locks, so the game holds this for as long as it is on screen.
 * Returns false when the phone's browser does not offer the feature.
 */
export function useWakeLock(active: boolean): boolean {
  const api = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!active || !api) return
    let lock: Lock | null = null
    let stopped = false

    const acquire = async () => {
      try {
        lock = await api.request('screen')
        if (stopped) void lock.release()
        else setHeld(true)
      } catch {
        setHeld(false)
      }
    }
    // The phone drops the lock whenever the app leaves the screen, so take it again on return.
    const onVisible = () => document.visibilityState === 'visible' && void acquire()

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
      setHeld(false)
    }
  }, [active, api])

  return api ? held : false
}

export const wakeLockSupported = 'wakeLock' in navigator
