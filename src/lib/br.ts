/**
 * Battle Royale timing and zones. Everything here is worked out from the game's start
 * time and rules, so every phone gets the same answer without asking the backend.
 * The backend uses the same formulas (see get_reveal in supabase/schema.sql).
 */
import { contains, distanceM, distanceToAreaM, type Area, type LngLat } from './geo.ts'
import type { BattleRoyaleRules } from './rules.ts'

/** How long hunters can see hiders after a zone shrink. */
export const REVEAL_MS = 20_000
/** How long before a shrink the warning sounds. */
export const WARN_MS = 60_000
/** The zone never gets smaller than this radius. */
export const MIN_ZONE_M = 20

export type Timeline = {
  start: number
  /** Hunters are released. */
  hideEnd: number
  end: number
  /** The moments the zone shrinks, one per stage. */
  shrinks: number[]
}

/** All times are milliseconds since 1970, the same unit as Date.now(). */
export function timeline(startMs: number, rules: BattleRoyaleRules): Timeline {
  const hideEnd = startMs + rules.hideMin * 60_000
  const end = startMs + rules.gameMin * 60_000
  const step = (end - hideEnd) / (rules.zoneStages + 1)
  const shrinks = Array.from({ length: rules.zoneStages }, (_, i) => hideEnd + step * (i + 1))
  return { start: startMs, hideEnd, end, shrinks }
}

/** How many times the zone has shrunk so far (0 = the whole play area). */
export function stageAt(tl: Timeline, now: number): number {
  return tl.shrinks.filter((t) => now >= t).length
}

export function nextShrink(tl: Timeline, now: number): number | null {
  return tl.shrinks.find((t) => t > now) ?? null
}

export function isRevealWindow(tl: Timeline, now: number): boolean {
  return tl.shrinks.some((t) => now >= t && now < t + REVEAL_MS)
}

export function areaCenter(area: Area): LngLat {
  if (area.type === 'circle') return area.center
  const n = area.points.length
  return [area.points.reduce((s, p) => s + p[0], 0) / n, area.points.reduce((s, p) => s + p[1], 0) / n]
}

function areaRadius(area: Area): number {
  if (area.type === 'circle') return area.radiusM
  const c = areaCenter(area)
  return Math.max(...area.points.map((p) => distanceM(c, p)))
}

/**
 * The safe zone at a stage: a circle around the middle of the play area that gets
 * smaller in equal steps. Stage 0 has no circle: the whole play area is safe.
 */
export function zoneCircle(area: Area, stage: number, stages: number): { type: 'circle'; center: LngLat; radiusM: number } | null {
  if (stage <= 0) return null
  const radiusM = Math.max(MIN_ZONE_M, areaRadius(area) * (1 - stage / (stages + 1)))
  return { type: 'circle', center: areaCenter(area), radiusM }
}

/** Metres to safety: 0 when the position is inside both the play area and the current zone. */
export function distanceToSafeM(area: Area, stage: number, stages: number, p: LngLat): number {
  const zone = zoneCircle(area, stage, stages)
  const toArea = distanceToAreaM(area, p)
  if (!zone) return toArea
  return Math.max(toArea, contains(zone, p) ? 0 : distanceM(zone.center, p) - zone.radiusM)
}

/** "18:42" from milliseconds. Never negative. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
