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

export type MapMarker = { position: LngLat; kind: 'hunter' | 'hider'; /** Overrides the role colour (replay). */ color?: string }

/** A line along someone's route (replay). */
export type MapRoute = { points: LngLat[]; color: string }

export type MapProps = {
  /** The play area to draw. */
  area?: Area | null
  /** The current safe zone, when it is smaller than the play area. */
  zone?: Area | null
  /** The zone after the next shrink, drawn as a dashed line. */
  nextZone?: Area | null
  /** Corner points to show while a polygon is being drawn. */
  corners?: LngLat[]
  /** Move the view here. Give a new `id` each time to move again. */
  flyTo?: { id: number; center: LngLat; zoom?: number } | null
  /** The player's own position. */
  me?: LngLat | null
  /** Other players this phone is allowed to see. */
  others?: MapMarker[]
  /** Routes to draw under the markers. */
  routes?: MapRoute[]
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

const routesData = (routes: MapRoute[]) => ({
  type: 'FeatureCollection' as const,
  features: routes
    .filter((r) => r.points.length >= 2)
    .map((r) => ({
      type: 'Feature' as const,
      properties: { color: r.color },
      geometry: { type: 'LineString' as const, coordinates: r.points },
    })),
})

const pointsData = (points: { position: LngLat; kind?: string; color?: string }[]) => ({
  type: 'FeatureCollection' as const,
  features: points.map((p) => ({
    type: 'Feature' as const,
    properties: p.color ? { kind: p.kind ?? '', color: p.color } : { kind: p.kind ?? '' },
    geometry: { type: 'Point' as const, coordinates: p.position },
  })),
})

/** A map with the play area, the zones and the visible players drawn on top. */
export function MapView(props: MapProps) {
  const { flyTo, interactive = true, initialCenter, initialZoom, className } = props
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const ready = useRef(false)
  const latest = useRef(props)
  latest.current = props
  /** What was last sent to the map, so unchanged shapes are not sent again every second. */
  const sent = useRef<Record<string, string>>({})
  const appearance = useTheme((s) => s.appearance)
  const theme = resolveTheme(appearance)

  function draw() {
    const m = map.current
    if (!m || !ready.current) return
    const { area, zone, nextZone, corners, me, others, routes, fitArea } = latest.current
    const set = (
      id: string,
      data: ReturnType<typeof polygonData> | ReturnType<typeof pointsData> | ReturnType<typeof routesData>,
    ) => {
      const key = JSON.stringify(data)
      if (sent.current[id] === key) return
      sent.current[id] = key
      ;(m.getSource(id) as GeoJSONSource | undefined)?.setData(data)
    }
    set('area', polygonData(area))
    set('zone', polygonData(zone))
    set('next', polygonData(nextZone))
    set('corners', pointsData((corners ?? []).map((position) => ({ position }))))
    set('routes', routesData(routes ?? []))
    set('others', pointsData(others ?? []))
    set('me', pointsData(me ? [{ position: me }] : []))

    // Once the zone has shrunk, the outer play area fades so the safe zone stands out.
    const faded = zone ? '1' : '0'
    if (sent.current.faded !== faded) {
      sent.current.faded = faded
      m.setPaintProperty('area-fill', 'fill-opacity', zone ? 0.04 : 0.18)
      m.setPaintProperty('area-line', 'line-width', zone ? 1.5 : 3)
    }

    if (fitArea && area) {
      // Keep the whole play area in view, and the zone or hint circle too when it reaches past the edge.
      let box = boundsOf(area)
      if (zone) {
        const z = boundsOf(zone)
        box = [
          [Math.min(box[0][0], z[0][0]), Math.min(box[0][1], z[0][1])],
          [Math.max(box[1][0], z[1][0]), Math.max(box[1][1], z[1][1])],
        ]
      }
      const key = JSON.stringify(box)
      if (sent.current.fit !== key) {
        sent.current.fit = key
        m.fitBounds(box, { padding: 28, animate: false, maxZoom: 18 })
      }
    }
  }

  // Build the map once per theme: the dark and light maps are different map designs.
  useEffect(() => {
    if (!box.current) return
    let fellBack = false
    sent.current = {}
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
      const warn = css('--c-warn-ink') || '#8a5a00'
      const hunter = css('--c-mode-br') || '#ff5a3c'
      if (m.getSource('area')) return
      for (const id of ['area', 'zone', 'next']) m.addSource(id, { type: 'geojson', data: polygonData(null) })
      for (const id of ['corners', 'others', 'me']) m.addSource(id, { type: 'geojson', data: pointsData([]) })
      m.addSource('routes', { type: 'geojson', data: routesData([]) })
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': fill, 'fill-opacity': 0.18 } })
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': line, 'line-width': 3 } })
      m.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': fill, 'fill-opacity': 0.22 } })
      m.addLayer({ id: 'zone-line', type: 'line', source: 'zone', paint: { 'line-color': line, 'line-width': 3 } })
      m.addLayer({
        id: 'next-line',
        type: 'line',
        source: 'next',
        paint: { 'line-color': warn, 'line-width': 2, 'line-dasharray': [2, 2] },
      })
      m.addLayer({
        id: 'routes',
        type: 'line',
        source: 'routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.75 },
      })
      m.addLayer({
        id: 'corners',
        type: 'circle',
        source: 'corners',
        paint: { 'circle-radius': 6, 'circle-color': fill, 'circle-stroke-color': line, 'circle-stroke-width': 2 },
      })
      m.addLayer({
        id: 'others',
        type: 'circle',
        source: 'others',
        paint: {
          'circle-radius': 7,
          'circle-color': ['case', ['has', 'color'], ['get', 'color'], ['match', ['get', 'kind'], 'hunter', hunter, fill]],
          'circle-stroke-color': '#0b0f14',
          'circle-stroke-width': 2,
        },
      })
      m.addLayer({
        id: 'me',
        type: 'circle',
        source: 'me',
        paint: { 'circle-radius': 8, 'circle-color': '#2f7bff', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
      })
      ready.current = true
      sent.current = {}
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
