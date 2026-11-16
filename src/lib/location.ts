import { useCallback, useEffect, useRef, useState } from 'react'
import type { LngLat } from './geo'

export type LocationState =
  /** Not asked yet. The phone only shows its permission question after a tap. */
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'on'; position: LngLat; accuracyM: number }
  /** The player said no, or location is switched off for the browser. */
  | { status: 'denied' }
  /** Allowed, but the phone cannot get a position (no GPS signal, or not a secure address). */
  | { status: 'unavailable' }

/**
 * The phone's live position. Call `start` from a button tap; the position then keeps
 * updating while the app is on screen.
 */
export function useLocation(): { location: LocationState; start: () => void } {
  const [location, setLocation] = useState<LocationState>({ status: 'idle' })
  const watch = useRef<number | null>(null)

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocation({ status: 'unavailable' })
      return
    }
    if (watch.current !== null) return
    setLocation((s) => (s.status === 'on' ? s : { status: 'asking' }))
    watch.current = navigator.geolocation.watchPosition(
      (pos) =>
        setLocation({
          status: 'on',
          position: [pos.coords.longitude, pos.coords.latitude],
          accuracyM: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
          watch.current = null
          setLocation({ status: 'denied' })
        } else {
          // A timeout or a lost signal: keep the last position if there is one.
          setLocation((s) => (s.status === 'on' ? s : { status: 'unavailable' }))
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }, [])

  // If the player already allowed location earlier, start without asking again.
  useEffect(() => {
    let cancelled = false
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => {
        if (!cancelled && p.state === 'granted') start()
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
      watch.current = null
    }
  }, [start])

  return { location, start }
}

export const locationHelp =
  'Location is switched off for CHASE. On iPhone: Settings > Privacy & Security > Location Services > Safari Websites, choose “While Using”. On Android: tap the lock icon next to the address, then Permissions > Location > Allow. Then reload the app.'
