/**
 * Battle Royale timing and zones. Everything here is worked out from the game's start
 * time and rules, so every phone gets the same answer without asking the backend.
 * The backend uses the same formulas (see hide_end and get_reveal in supabase/schema.sql).
 */
import { contains, destination, distanceM, distanceToAreaM, type Area, type LngLat } from './geo.ts'
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

/**
 * All times are milliseconds since 1970, the same unit as Date.now().
 * `hideEndedMs` is when every hider said they were hidden, if that came before the hide timer.
 */
export function timeline(startMs: number, rules: BattleRoyaleRules, hideEndedMs: number | null = null): Timeline {
  const hideEnd = Math.min(startMs + rules.hideMin * 60_000, hideEndedMs ?? Infinity)
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

/** A repeatable random number generator: the same seed gives the same numbers on every phone. */
function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The safe zone at a stage. Stage 0 has no circle: the whole play area is safe.
 * With a seed, the game picks a random final spot anywhere in the play area (equally
 * likely near an edge as in the middle) and every circle slides toward it as it shrinks,
 * each one still fitting inside the one before. Every phone gets the same circles from
 * the same seed. Without a seed (games from before this rule) it shrinks toward the middle.
 */
export function zoneCircle(
  area: Area,
  stage: number,
  stages: number,
  seed: number | null = null,
): { type: 'circle'; center: LngLat; radiusM: number } | null {
  if (stage <= 0) return null
  const full = areaRadius(area)
  const radiusAt = (k: number) => Math.max(MIN_ZONE_M, full * (1 - k / (stages + 1)))
  const middle = areaCenter(area)
  if (seed === null) return { type: 'circle', center: middle, radiusM: radiusAt(stage) }

  const random = seeded(seed)
  const reach = full - radiusAt(stages)
  let target = middle
  for (let attempt = 0; attempt < 12; attempt++) {
    // sqrt spreads the spots evenly over the area instead of bunching them in the middle.
    const candidate = destination(middle, reach * Math.sqrt(random()), random() * 360)
    if (contains(area, candidate)) {
      target = candidate
      break
    }
  }
  // Slide from the middle to the target in step with the shrinking radius.
  const t = reach > 0 ? (full - radiusAt(stage)) / reach : 0
  const center: LngLat = [middle[0] + (target[0] - middle[0]) * t, middle[1] + (target[1] - middle[1]) * t]
  return { type: 'circle', center, radiusM: radiusAt(stage) }
}

/** Metres to safety: 0 when the position is inside both the play area and the current zone. */
export function distanceToSafeM(area: Area, stage: number, stages: number, p: LngLat, seed: number | null = null): number {
  const zone = zoneCircle(area, stage, stages, seed)
  const toArea = distanceToAreaM(area, p)
  if (!zone) return toArea
  return Math.max(toArea, contains(zone, p) ? 0 : distanceM(zone.center, p) - zone.radiusM)
}

/** "18:42" from milliseconds. Never negative. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
