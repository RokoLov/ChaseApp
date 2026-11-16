import { Suspense, lazy } from 'react'
import type { MapProps } from './MapView'

// The map library is large, so it is downloaded only when a screen with a map opens.
const Loaded = lazy(() => import('./MapView'))

export function MapView(props: MapProps) {
  return (
    <Suspense fallback={<div className={props.className} />}>
      <Loaded {...props} />
    </Suspense>
  )
}
