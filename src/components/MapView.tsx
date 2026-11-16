import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl'
// The map does its heavy work in a background helper file; tell it where the build put that file.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { areaRing, boundsOf, type Area, type LngLat } from '../lib/geo'
import { resolveTheme, useTheme } from '../lib/theme'

setWorkerUrl(workerUrl)

const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

export type MapProps = {
  /** The play area to draw. */
  area?: Area | null
  /** Corner points to show while a polygon is being drawn. */
  corners?: LngLat[]
  /** Move the view here. Give a new `id` each time to move again. */
  flyTo?: { id: number; center: LngLat; zoom?: number } | null
  /** The player's own position. */
  me?: LngLat | null
  /** Keep the whole area in view (used where the map is only for looking). */
  fitArea?: boolean
  /** Let the player move and zoom the map. */
  interactive?: boolean
  initialCenter?: LngLat
  initialZoom?: number
  onMove?: (center: LngLat, zoom: number) => void
  onTap?: (position: LngLat) => void
  className?: string
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const polygonData = (area: Area | null | undefined) => ({
  type: 'FeatureCollection' as const,
  features:
    area && areaRing(area).length >= 4
      ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [areaRing(area)] } }]
      : [],
})

const pointsData = (points: LngLat[]) => ({
  type: 'FeatureCollection' as const,
  features: points.map((p) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates: p },
  })),
})

/** A map with the play area and the player's position drawn on top. */
export function MapView({
  area,
  corners,
  flyTo,
  me,
  fitArea,
  interactive = true,
  initialCenter,
  initialZoom,
  onMove,
  onTap,
  className,
}: MapProps) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const ready = useRef(false)
  const latest = useRef({ area, corners, me, fitArea, onMove, onTap })
  latest.current = { area, corners, me, fitArea, onMove, onTap }
  const appearance = useTheme((s) => s.appearance)
  const theme = resolveTheme(appearance)

  function draw() {
    const m = map.current
    if (!m || !ready.current) return
    const { area, corners, me, fitArea } = latest.current
    ;(m.getSource('area') as GeoJSONSource | undefined)?.setData(polygonData(area))
    ;(m.getSource('corners') as GeoJSONSource | undefined)?.setData(pointsData(corners ?? []))
    ;(m.getSource('me') as GeoJSONSource | undefined)?.setData(pointsData(me ? [me] : []))
    if (fitArea && area) m.fitBounds(boundsOf(area), { padding: 28, animate: false, maxZoom: 18 })
  }

  // Build the map once per theme: the dark and light maps are different map designs.
  useEffect(() => {
    if (!box.current) return
    let fellBack = false
    const m = new MapLibreMap({
      container: box.current,
      style: STYLE[theme],
      center: initialCenter ?? [15.5, 45.2],
      zoom: initialZoom ?? 5,
      interactive,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
    map.current = m
    m.touchZoomRotate.disableRotation()

    m.on('error', () => {
      // If the dark map design cannot be loaded, use the light one instead of showing nothing.
      if (!ready.current && !fellBack && theme === 'dark') {
        fellBack = true
        m.setStyle(STYLE.light)
      }
    })

    m.on('style.load', () => {
      const line = css('--c-brand-ink') || '#4a7300'
      const fill = css('--c-brand') || '#c6ff3d'
      const empty = pointsData([])
      if (m.getSource('area')) return
      m.addSource('area', { type: 'geojson', data: polygonData(null) })
      m.addSource('corners', { type: 'geojson', data: empty })
      m.addSource('me', { type: 'geojson', data: empty })
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': fill, 'fill-opacity': 0.18 } })
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': line, 'line-width': 3 } })
      m.addLayer({
        id: 'corners',
        type: 'circle',
        source: 'corners',
        paint: { 'circle-radius': 6, 'circle-color': fill, 'circle-stroke-color': line, 'circle-stroke-width': 2 },
      })
      m.addLayer({
        id: 'me',
        type: 'circle',
        source: 'me',
        paint: { 'circle-radius': 8, 'circle-color': '#2f7bff', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
      })
      ready.current = true
      draw()
    })

    m.on('move', () => {
      const c = m.getCenter()
      latest.current.onMove?.([c.lng, c.lat], m.getZoom())
    })
    m.on('click', (e: MapMouseEvent) => latest.current.onTap?.([e.lngLat.lng, e.lngLat.lat]))

    return () => {
      ready.current = false
      map.current = null
      m.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, interactive])

  useEffect(draw)

  const flyId = flyTo?.id
  useEffect(() => {
    if (flyTo) map.current?.flyTo({ center: flyTo.center, zoom: flyTo.zoom ?? 16, duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyId])

  return <div ref={box} className={className} />
}

export default MapView
