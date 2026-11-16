/** Map maths for play areas. Positions are [longitude, latitude], the order maps use. */
export type LngLat = [number, number]

export type Area =
  | { type: 'circle'; center: LngLat; radiusM: number }
  | { type: 'polygon'; points: LngLat[] }

/** The widest a play area may be, edge to edge. */
export const MAX_EXTENT_M = 1000
export const MIN_RADIUS_M = 25
export const MAX_RADIUS_M = MAX_EXTENT_M / 2

const R = 6371000 // Earth's radius in metres
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Distance between two positions in metres. */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The position reached by going `metres` from `from` in compass direction `bearingDeg`. */
function destination(from: LngLat, metres: number, bearingDeg: number): LngLat {
  const d = metres / R
  const b = rad(bearingDeg)
  const lat1 = rad(from[1])
  const lng1 = rad(from[0])
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [deg(lng2), deg(lat2)]
}

/** The outline of an area as a closed ring of positions, ready to draw. */
export function areaRing(area: Area): LngLat[] {
  if (area.type === 'circle') {
    const ring: LngLat[] = []
    for (let i = 0; i <= 64; i++) ring.push(destination(area.center, area.radiusM, (i * 360) / 64))
    return ring
  }
  return area.points.length ? [...area.points, area.points[0]] : []
}

/** Flatten positions near `origin` to metres east and north, accurate over a few kilometres. */
function toLocal(origin: LngLat, p: LngLat): [number, number] {
  return [rad(p[0] - origin[0]) * R * Math.cos(rad(origin[1])), rad(p[1] - origin[1]) * R]
}

function insidePolygon(points: LngLat[], p: LngLat): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Is this position inside the play area? */
export function contains(area: Area, p: LngLat): boolean {
  if (area.type === 'circle') return distanceM(area.center, p) <= area.radiusM
  return area.points.length >= 3 && insidePolygon(area.points, p)
}

/** Metres from a position to the edge of the area. 0 when the position is inside. */
export function distanceToAreaM(area: Area, p: LngLat): number {
  if (contains(area, p)) return 0
  if (area.type === 'circle') return distanceM(area.center, p) - area.radiusM
  let best = Infinity
  const pts = area.points
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = toLocal(p, pts[i])
    const [bx, by] = toLocal(p, pts[(i + 1) % pts.length])
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

/** How wide the area is at its widest, in metres. */
export function extentM(area: Area): number {
  if (area.type === 'circle') return area.radiusM * 2
  let max = 0
  for (let i = 0; i < area.points.length; i++)
    for (let j = i + 1; j < area.points.length; j++) max = Math.max(max, distanceM(area.points[i], area.points[j]))
  return max
}

/** The box around an area: [[west, south], [east, north]]. */
export function boundsOf(area: Area): [LngLat, LngLat] {
  const ring = areaRing(area)
  const lngs = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

export function isValidArea(area: Area | null): area is Area {
  if (!area) return false
  if (area.type === 'circle') return area.radiusM >= MIN_RADIUS_M && area.radiusM <= MAX_RADIUS_M
  return area.points.length >= 3 && area.points.length <= 30 && extentM(area) <= MAX_EXTENT_M && extentM(area) >= MIN_RADIUS_M * 2
}

/** "320 m" or "1.2 km". */
export function formatM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`
}
