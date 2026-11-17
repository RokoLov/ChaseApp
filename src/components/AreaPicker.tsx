import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_EXTENT_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  extentM,
  formatM,
  insertCorner,
  isValidArea,
  untangle,
  type Area,
  type LngLat,
} from '../lib/geo'
import { locationHelp, useLocation } from '../lib/location'
import { MapView } from './Map'

type Tool = 'circle' | 'polygon'

/**
 * Draw the play area. Circle: move the map under the circle and set its size.
 * Polygon: tap the map to place each corner.
 */
export function AreaPicker({ initial, onChange }: { initial: Area | null; onChange: (area: Area | null) => void }) {
  const [fly, setFly] = useState<{ id: number; center: LngLat; zoom: number } | null>(null)
  const { location, start } = useLocation()
  const [tool, setTool] = useState<Tool>(initial?.type ?? 'circle')
  const [center, setCenter] = useState<LngLat | null>(initial?.type === 'circle' ? initial.center : null)
  const [radius, setRadius] = useState(initial?.type === 'circle' ? initial.radiusM : 150)
  const [points, setPointsRaw] = useState<LngLat[]>(initial?.type === 'polygon' ? untangle(initial.points) : [])
  /** Earlier versions of the outline, so "Undo corner" works even when a corner went in the middle. */
  const [history, setHistory] = useState<LngLat[][]>([])
  const setPoints = (next: LngLat[]) => {
    setHistory([...history, points])
    setPointsRaw(next)
  }
  /** The circle only counts once the player has placed the map somewhere on purpose. */
  const [placed, setPlaced] = useState(initial !== null)
  const wantFly = useRef(false)

  const startAt: LngLat | undefined =
    initial?.type === 'circle' ? initial.center : initial?.type === 'polygon' ? initial.points[0] : undefined

  const area: Area | null = useMemo(() => {
    if (tool === 'circle') return center && placed ? { type: 'circle', center, radiusM: radius } : null
    return points.length >= 3 ? { type: 'polygon', points } : null
  }, [tool, center, placed, radius, points])

  const valid = isValidArea(area)
  useEffect(() => onChange(valid ? area : null), [area, valid, onChange])

  // After "Use my location": jump to the position as soon as the phone reports it.
  useEffect(() => {
    if (wantFly.current && location.status === 'on') {
      wantFly.current = false
      setFly({ id: Date.now(), center: location.position, zoom: 15.5 })
      setCenter(location.position)
      setPlaced(true)
    }
  }, [location])

  function useMyLocation() {
    wantFly.current = true
    if (location.status === 'on') {
      wantFly.current = false
      setFly({ id: Date.now(), center: location.position, zoom: 15.5 })
      setCenter(location.position)
      setPlaced(true)
    } else start()
  }

  const drawn: Area | null =
    tool === 'circle'
      ? center
        ? { type: 'circle', center, radiusM: radius }
        : null
      : points.length >= 3
        ? { type: 'polygon', points }
        : null
  const extent = drawn ? extentM(drawn) : 0
  const tooBig = tool === 'polygon' && extent > MAX_EXTENT_M

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[380px] overflow-hidden rounded-2xl bg-raised">
        <MapView
          flyTo={fly}
          className="h-full w-full"
          area={drawn}
          corners={tool === 'polygon' ? points : []}
          me={location.status === 'on' ? location.position : null}
          initialCenter={startAt}
          initialZoom={startAt ? 15.5 : undefined}
          onMove={(c, zoom) => {
            if (tool !== 'circle') return
            setCenter(c)
            // Zoomed in close enough to see streets: the player is choosing a spot on purpose.
            if (zoom >= 13) setPlaced(true)
          }}
          onTap={(p) => {
            if (tool === 'polygon' && points.length < 30) setPoints(insertCorner(points, p))
          }}
        />
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute left-3 top-3 rounded-full bg-brand px-3 py-2 text-xs font-semibold text-on-brand shadow"
        >
          {location.status === 'asking' ? 'Finding you…' : 'Use my location'}
        </button>
      </div>

      {location.status === 'denied' && <p className="text-xs text-danger-ink">{locationHelp}</p>}
      {location.status === 'unavailable' && (
        <p className="text-xs text-warn-ink">Your phone cannot find its position right now. Move the map by hand.</p>
      )}

      <div className="flex gap-2" role="radiogroup" aria-label="Drawing tool">
        {(['circle', 'polygon'] as Tool[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tool === t}
            onClick={() => setTool(t)}
            className={`h-[42px] flex-1 rounded-xl font-display text-sm font-medium capitalize ${
              tool === t ? 'bg-brand text-on-brand' : 'bg-raised text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tool === 'circle' ? (
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted">Size</span>
          <input
            type="range"
            min={MIN_RADIUS_M}
            max={MAX_RADIUS_M}
            step={5}
            value={radius}
            onChange={(e) => {
              setRadius(Number(e.target.value))
              setPlaced(true)
            }}
            aria-label="Circle size"
            className="flex-1 accent-[var(--c-brand-ink)]"
          />
        </label>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={history.length === 0}
            onClick={() => {
              setPointsRaw(history[history.length - 1] ?? [])
              setHistory(history.slice(0, -1))
            }}
            className="h-10 flex-1 rounded-xl bg-raised text-sm font-semibold text-ink disabled:opacity-40"
          >
            Undo corner
          </button>
          <button
            type="button"
            disabled={points.length === 0}
            onClick={() => setPoints([])}
            className="h-10 flex-1 rounded-xl bg-raised text-sm font-semibold text-ink disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex items-baseline">
        <span className="font-display text-[15px] font-medium">
          {drawn ? `Area: ${formatM(extent)} across` : tool === 'polygon' ? `Corners: ${points.length} of at least 3` : 'Area: not placed'}
        </span>
        <span className={`ml-auto text-xs ${tooBig ? 'font-semibold text-danger-ink' : 'text-muted'}`}>
          {tooBig ? 'Too large: maximum 1 km' : 'Maximum 1 km'}
        </span>
      </div>

      <p className="text-xs text-muted">
        {tool === 'circle'
          ? placed
            ? 'Move the map to slide the circle. Use the slider to change its size.'
            : 'Tap “Use my location”, or zoom the map in to your play area.'
          : 'Tap the map to place each corner, in any order. CHASE joins them into a shape whose edges never cross.'}
      </p>
    </div>
  )
}
