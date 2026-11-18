import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapView } from '../components/Map'
import { BackHeader, Screen } from '../components/ui'
import { clock, stageAt, timeline, zoneCircle } from '../lib/br'
import { fetchRound, fetchTracks, type Round, type TrackPoint } from '../lib/games'
import type { LngLat } from '../lib/geo'
import { useProfile } from '../lib/profile'

/** One colour per player, easy to tell apart on both map designs. */
const COLORS = ['#FF5A3C', '#35D0FF', '#C6FF3D', '#8B7CFF', '#FFC53D', '#FF8AD8', '#3DFFB0', '#FF4D5E', '#FFFFFF', '#2F7BFF']

/** Time since the start, rounded down to the second (the results screen counts the same way). */
const elapsed = (ms: number) => clock(Math.floor(ms / 1000) * 1000)

/** A whole game plays back in about this long at normal speed. */
const PLAYBACK_MS = 40_000

type Moment = { at: number; text: string }

export default function Replay() {
  const { gameId = '', round = '0' } = useParams()
  const ensureBackend = useProfile((s) => s.ensureBackend)
  const [data, setData] = useState<{ round: Round; tracks: TrackPoint[] } | null | 'loading'>('loading')

  useEffect(() => {
    void ensureBackend().then(async () => {
      const r = await fetchRound(gameId, Number(round))
      setData(r ? { round: r, tracks: await fetchTracks(gameId, Number(round)) } : null)
    })
  }, [gameId, round, ensureBackend])

  if (data === 'loading')
    return (
      <Screen>
        <BackHeader title="Replay" />
        <p className="mt-24 text-center text-muted">Loading everyone’s routes…</p>
      </Screen>
    )
  if (!data || data.tracks.length === 0)
    return (
      <Screen>
        <BackHeader title="Replay" />
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          {data
            ? 'No routes were saved for this game, or they were already deleted. Routes are kept for 24 hours, and deleted sooner once everyone leaves the lobby.'
            : 'This replay is not available.'}
        </p>
      </Screen>
    )
  return <Player round={data.round} tracks={data.tracks} />
}

function Player({ round, tracks }: { round: Round; tracks: TrackPoint[] }) {
  const start = Date.parse(round.startedAt)
  const end = Date.parse(round.endedAt)
  const duration = Math.max(1, end - start)
  const tl = timeline(start, round.settings, Date.parse(round.huntAt))
  const [t, setT] = useState(start)
  const [playing, setPlaying] = useState(false)
  const [fast, setFast] = useState(false)

  const color = useMemo(() => Object.fromEntries(round.players.map((p, i) => [p.id, COLORS[i % COLORS.length]])), [round.players])
  const byPlayer = useMemo(() => {
    const m = new Map<string, TrackPoint[]>()
    for (const p of tracks) m.set(p.player, [...(m.get(p.player) ?? []), p])
    return m
  }, [tracks])
  const nameOf = (id: string | null) => round.players.find((p) => p.id === id)?.nickname ?? 'A player'

  // The moments worth jumping to.
  const moments: Moment[] = useMemo(() => {
    const sardines = round.mode === 'sardines'
    const list: Moment[] = [{ at: tl.hideEnd, text: sardines ? 'The search starts' : 'Hunters released' }]
    tl.shrinks.forEach(
      (s, i) => s < end && list.push({ at: s, text: `${sardines ? 'Hint shrinks' : 'Zone shrinks'} (${i + 1} of ${tl.shrinks.length})` }),
    )
    for (const p of round.players) {
      if (p.foundSec !== null) list.push({ at: Date.parse(round.huntAt) + p.foundSec * 1000, text: `${p.nickname} found the group` })
      if (!p.outAt) continue
      const at = Date.parse(p.outAt)
      if (p.outReason === 'caught') list.push({ at, text: `${nameOf(p.caughtBy)} caught ${p.nickname}` })
      else if (p.outReason === 'zone') list.push({ at, text: `${p.nickname} left the zone` })
      else list.push({ at, text: `${p.nickname} lost signal` })
    }
    list.push({ at: end, text: 'Game over' })
    return list.sort((a, b) => a.at - b.at)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  // Play: move the time forward on every animation frame.
  const frame = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const step = (now: number) => {
      // Work out the jump now: React may run the update below later, after `last` has moved on.
      const jump = (now - last) * (duration / PLAYBACK_MS) * (fast ? 3 : 1)
      last = now
      setT((prev) => Math.min(end, prev + jump))
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [playing, fast, duration, end])

  // Stop at the end.
  useEffect(() => {
    if (playing && t >= end) setPlaying(false)
  }, [playing, t, end])

  const routes = round.players.map((p) => ({
    color: color[p.id],
    points: (byPlayer.get(p.id) ?? []).filter((x) => x.at <= t).map((x) => x.position),
  }))
  const markers = round.players.flatMap((p, i) => {
    const pts = routes[i].points
    const last: LngLat | undefined = pts[pts.length - 1]
    const hunter = p.startRole === 'hunter' || (p.outAt !== null && Date.parse(p.outAt) <= t)
    return last ? [{ position: last, kind: hunter ? ('hunter' as const) : ('hider' as const), color: color[p.id] }] : []
  })
  const zone =
    round.area && round.mode !== 'sardines' ? zoneCircle(round.area, stageAt(tl, t), round.settings.zoneStages, round.seed) : null
  const statusAt = (p: Round['players'][number]) => {
    if (round.mode === 'sardines') {
      if (p.startRole === 'hider') return 'hider'
      return p.foundSec !== null && Date.parse(round.huntAt) + p.foundSec * 1000 <= t ? 'in the group' : 'searching'
    }
    return p.startRole === 'hunter' || (p.outAt !== null && Date.parse(p.outAt) <= t) ? 'hunter' : 'hider'
  }

  return (
    <Screen>
      <BackHeader title="Replay" />
      <div className="relative h-[46dvh] overflow-hidden rounded-2xl bg-surface">
        <MapView className="h-full w-full" fitArea area={round.area} zone={zone} routes={routes} others={markers} />
        <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-surface/90 px-2.5 py-1 font-display text-sm font-bold shadow">
          {elapsed(t - start)} / {elapsed(duration)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (t >= end) setT(start)
            setPlaying(!playing)
          }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-on-brand"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={start}
          max={end}
          step={1000}
          value={t}
          onChange={(e) => {
            setPlaying(false)
            setT(Number(e.target.value))
          }}
          aria-label="Replay time"
          className="flex-1 accent-[var(--c-brand-ink)]"
        />
        <button
          type="button"
          onClick={() => setFast(!fast)}
          aria-pressed={fast}
          className={`h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${fast ? 'bg-brand text-on-brand' : 'bg-raised text-muted'}`}
        >
          3×
        </button>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {round.players.map((p) => {
          return (
            <li key={p.id} className="flex items-center gap-1.5 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: color[p.id] }} />
              <span className="font-medium">{p.nickname}</span>
              <span className="text-xs text-muted">{statusAt(p)}</span>
            </li>
          )
        })}
      </ul>

      <ol className="flex flex-col gap-1">
        {moments.map((m) => (
          <li key={`${m.at}-${m.text}`}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false)
                setT(Math.max(start, Math.min(end, m.at)))
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${
                t >= m.at ? 'bg-surface text-ink' : 'text-muted'
              }`}
            >
              <span className="w-11 font-display font-bold">{elapsed(m.at - start)}</span>
              {m.text}
            </button>
          </li>
        ))}
      </ol>
    </Screen>
  )
}
