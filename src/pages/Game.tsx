import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CatchSheet, CodeSheet, Pocket, Qr, Sheet, qrText } from '../components/GameSheets'
import { MapView } from '../components/Map'
import { Avatar, Button, LinkButton, Note, Screen, Tile } from '../components/ui'
import {
  REVEAL_MS,
  WARN_MS,
  clock,
  distanceToSafeM,
  isRevealWindow,
  nextShrink,
  stageAt,
  timeline,
  zoneCircle,
} from '../lib/br'
import {
  catchPlayer,
  endGame,
  fetchClockOffset,
  fetchHint,
  fetchMyAnchor,
  fetchRound,
  fetchEvents,
  fetchMyCode,
  fetchSeen,
  joinSardine,
  leaveGame,
  markHidden,
  reportPosition,
  resetGame,
  sweepSignal,
  useLobby,
  zoneOut,
  type Game as GameData,
  type GameEvent,
  type Hint,
  type Player,
  type Round,
  type Seen,
} from '../lib/games'
import { distanceM, formatM, type LngLat } from '../lib/geo'
import { locationHelp, useLocation } from '../lib/location'
import { useProfile } from '../lib/profile'
import { modeName } from '../lib/rules'
import { play, unlockSound, type Sound } from '../lib/sound'
import { supabase } from '../lib/supabase'
import { useWakeLock, wakeLockSupported } from '../lib/wake'
import { RoundResults } from './Results'

/** Run `fn` every `ms` while `on` is true. Always calls the newest version of `fn`. */
function useEvery(fn: () => void, ms: number, on = true) {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => latest.current(), ms)
    return () => window.clearInterval(id)
  }, [ms, on])
}

type Alert = { text: string; tone: 'warn' | 'danger'; until: number }

const toneClass = { warn: 'bg-warn/15 text-warn-ink', danger: 'bg-danger/15 text-danger-ink' }

export default function Game() {
  const { code = '' } = useParams()
  const upper = code.toUpperCase()
  const profile = useProfile((s) => s.profile)
  const { state, refresh } = useLobby(upper, 4000)

  if (state.status === 'loading') {
    return (
      <Screen>
        <p className="mt-24 text-center text-muted">Loading the game…</p>
      </Screen>
    )
  }
  if (state.status === 'error' || state.status === 'gone') {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-bold">Game</h1>
        <div role="alert" className="rounded-xl bg-danger/15 p-4 text-sm font-semibold text-danger-ink">
          {state.status === 'gone' ? 'This game has closed, or you are no longer in it.' : state.message}
        </div>
        <div className="mt-auto">
          <LinkButton to="/" kind="secondary">
            Back to Home
          </LinkButton>
        </div>
      </Screen>
    )
  }

  const { game, players } = state
  if (game.status === 'lobby' || !profile) return <Navigate to={`/lobby/${upper}`} replace />
  if (game.status === 'ended') return <Ended game={game} players={players} meId={profile.id} refresh={refresh} />
  if (!game.area || !game.started_at) return <Navigate to={`/lobby/${upper}`} replace />
  return <Running key={game.started_at} game={game} players={players} meId={profile.id} refresh={refresh} />
}

// ───────────────────────────── While the game is running ─────────────────────────────

function Running({ game, players, meId, refresh }: { game: GameData; players: Player[]; meId: string; refresh: () => void }) {
  const navigate = useNavigate()
  const rules = game.settings
  const area = game.area!
  const sardines = game.mode === 'sardines'
  const tl = timeline(Date.parse(game.started_at!), rules, game.hide_ended_at ? Date.parse(game.hide_ended_at) : null)

  // The backend's clock, so every phone counts down together.
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    void fetchClockOffset().then(setOffset)
  }, [])
  const [now, setNow] = useState(() => Date.now())
  useEvery(() => setNow(Date.now() + offset), 500)

  const me = players.find((p) => p.id === meId)
  const role = me?.role ?? (sardines ? 'seeker' : 'hunter')
  const hunting = now >= tl.hideEnd
  const stage = stageAt(tl, now)
  const upcoming = nextShrink(tl, now)
  const name = (id: string | null) => (id === meId ? 'You' : (players.find((p) => p.id === id)?.nickname ?? 'A player'))

  // Battle Royale numbers.
  const zone = sardines ? null : zoneCircle(area, stage, rules.zoneStages, game.seed)
  const nextZone = sardines || !upcoming ? null : zoneCircle(area, stage + 1, rules.zoneStages, game.seed)
  const revealing = !sardines && rules.revealOnShrink && isRevealWindow(tl, now)
  const hidersLeft = players.filter((p) => p.role === 'hider').length
  const hunters = players.filter((p) => p.role === 'hunter').length
  const hidersHidden = players.filter((p) => p.role === 'hider' && p.hidden).length

  // Sardines numbers.
  const seekers = players.filter((p) => p.role === 'seeker')
  const foundCount = seekers.filter((p) => p.foundAt).length
  const stillSearching = seekers.filter((p) => !p.foundAt)
  const hider = players.find((p) => p.role === 'hider')
  const inGroup = sardines && role === 'seeker' && !!me?.foundAt
  const searching = sardines && role === 'seeker' && !me?.foundAt

  const roleLabel = sardines ? (role === 'hider' ? 'hider' : inGroup ? 'in the group' : 'seeker') : role
  const modeBg = sardines ? 'bg-mode-sar' : 'bg-mode-br'
  const showsCode = role === 'hider' || inGroup

  const { location, start: startLocation } = useLocation()
  const [entered, setEntered] = useState(false)
  useWakeLock(entered)
  const [alert, setAlert] = useState<Alert | null>(null)
  const [sheet, setSheet] = useState<null | 'code' | 'catch' | 'menu'>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [fly, setFly] = useState<{ id: number; center: [number, number]; zoom: number } | null>(null)
  const [pocket, setPocket] = useState(false)
  const [myCode, setMyCode] = useState<string | null>(null)
  const [seen, setSeen] = useState<Seen[]>([])
  const [hint, setHint] = useState<Hint | null>(null)
  const [anchor, setAnchor] = useState<LngLat | null>(null)

  function notify(text: string, tone: Alert['tone'], sound: Sound) {
    setAlert({ text, tone, until: Date.now() + offset + 12_000 })
    play(sound)
  }

  useEffect(() => {
    void fetchMyCode(game.id).then(setMyCode)
  }, [game.id])

  // Tell the backend this phone is still here, with its position when the reading is good.
  const report = () => {
    const good = location.status === 'on' && location.accuracyM <= 50
    void reportPosition(game.id, good ? location.position : null, location.status === 'on' ? location.accuracyM : null)
  }
  useEvery(report, 10_000)
  const hasFix = location.status === 'on'
  useEffect(() => {
    if (hasFix) report()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix])

  // Hunters see each other, and the hiders during a reveal. The backend decides what comes back.
  useEvery(() => void fetchSeen(game.id, meId, revealing).then(setSeen), 4000, role === 'hunter')
  useEffect(() => {
    if (role !== 'hunter') setSeen([])
  }, [role])

  useEvery(() => void sweepSignal(game.id), 30_000, hunting && !sardines)

  // Sardines: the hint circle (the backend places it around the hider's spot), asked again when it shrinks.
  const askHint = () => void fetchHint(game.id).then(setHint)
  useEvery(askHint, 10_000, sardines && hunting)
  useEffect(() => {
    if (sardines && hunting) askHint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sardines, hunting, stage])

  // Sardines: the hider's spot is fixed when the search starts; their phone warns them if they wander off.
  useEvery(() => void fetchMyAnchor(game.id).then(setAnchor), 5000, sardines && hunting && role === 'hider' && !anchor)
  const drift = anchor && location.status === 'on' ? distanceM(anchor, location.position) : 0
  const wandered = sardines && role === 'hider' && hunting && drift > 20
  const lastDriftWarning = useRef(0)
  useEffect(() => {
    if (wandered && now - lastDriftWarning.current > 20_000) {
      lastDriftWarning.current = now
      play('warn')
    }
  })

  // When the timer runs out, ask the backend to end the game (asking twice is harmless).
  const over = now >= tl.end
  useEvery(() => void endGame(game.id)?.then(refresh), 3000, over)

  // Alerts that depend only on the clock.
  const previous = useRef(0)
  useEffect(() => {
    const before = previous.current
    previous.current = now
    if (!entered || before === 0 || now - before > 5000) return
    const crossed = (t: number) => before < t && now >= t
    for (const s of tl.shrinks) {
      if (sardines) {
        if (crossed(s))
          notify(searching ? 'The hint circle got smaller.' : 'The seekers’ hint circle got smaller.', 'warn', 'shrink')
        continue
      }
      if (crossed(s - WARN_MS)) notify('The zone shrinks in 60 seconds.', 'warn', 'warn')
      if (crossed(s)) {
        if (!rules.revealOnShrink) notify('The zone shrank.', 'warn', 'shrink')
        else if (role === 'hunter') notify(`The zone shrank. Hiders are on your map for ${REVEAL_MS / 1000} seconds.`, 'warn', 'reveal')
        else notify(`The zone shrank. Hunters can see you for ${REVEAL_MS / 1000} seconds.`, 'danger', 'shrink')
      }
    }
    if (crossed(tl.end - 60_000)) notify('1 minute left.', 'warn', 'warn')
  })

  // Hunters are released: by the hide timer, or early once every hider said they are hidden.
  const wasHunting = useRef<boolean | null>(null)
  useEffect(() => {
    if (!entered) return
    if (wasHunting.current === false && hunting) {
      const early = game.hide_ended_at !== null
      if (!sardines) notify(early ? 'Everyone is hidden. Hunters are released!' : 'Hunters are released!', 'warn', 'release')
      else if (role === 'hider') notify('The search has started. Stay where you are.', 'warn', 'release')
      else notify('The search is on! The hider is somewhere inside the circle.', 'warn', 'release')
    }
    wasHunting.current = hunting
  })

  async function toggleHidden() {
    await markHidden(game.id, !me?.hidden)
    refresh()
  }

  // Things other players did: catches, zone exits, lost signal, finding the group.
  const lastEvent = useRef<number | null>(null)
  const handle = (events: GameEvent[]) => {
    for (const e of events) {
      if (lastEvent.current !== null && e.id <= lastEvent.current) continue
      lastEvent.current = e.id
      if (e.type === 'caught') {
        if (e.target === meId) notify(`${name(e.actor)} caught you. You are now a hunter.`, 'danger', 'youCaught')
        // My own catch is announced by the catch screen, so only other players' catches are news.
        else if (e.actor !== meId) notify(`${name(e.target)} was caught by ${name(e.actor)}.`, 'warn', 'caught')
      } else if (e.type === 'zone') {
        if (e.target === meId) notify('You stayed outside the zone. You are now a hunter.', 'danger', 'youCaught')
        else notify(`${name(e.target)} left the zone and is now a hunter.`, 'warn', 'caught')
      } else if (e.type === 'signal') {
        if (e.target === meId) notify('Your phone lost signal for too long. You are now a hunter.', 'danger', 'youCaught')
        else notify(`${name(e.target)} lost signal and is now a hunter.`, 'warn', 'caught')
      } else if (e.type === 'found' && e.actor !== meId) {
        if (role === 'hider') notify(`${name(e.actor)} found you and joined your spot.`, 'warn', 'caught')
        else notify(`${name(e.actor)} found the group.`, 'warn', 'caught')
      }
    }
    if (events.length) refresh()
  }
  const pollEvents = () => {
    if (lastEvent.current === null) return
    void fetchEvents(game.id, lastEvent.current).then(handle)
  }
  useEffect(() => {
    // Events from before this screen opened are history, not news.
    void fetchEvents(game.id, 0).then((old) => {
      lastEvent.current = old.length ? old[old.length - 1].id : 0
    })
    if (!supabase) return
    const db = supabase
    const channel = db
      .channel(`events-${game.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `game_id=eq.${game.id}` }, () =>
        latestPoll.current(),
      )
      .subscribe()
    return () => void db.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id])
  const latestPoll = useRef(pollEvents)
  latestPoll.current = pollEvents
  useEvery(pollEvents, 3000)

  // Battle Royale: a hider outside the safe zone gets a countdown; when it runs out they become a hunter.
  const toSafe = location.status === 'on' ? distanceToSafeM(area, stage, rules.zoneStages, location.position, game.seed) : 0
  const outside = !sardines && role === 'hider' && hunting && toSafe > 5
  const [outsideSince, setOutsideSince] = useState<number | null>(null)
  const lastWarning = useRef(0)
  const reported = useRef(false)
  useEffect(() => {
    if (!outside) {
      if (outsideSince !== null) setOutsideSince(null)
      reported.current = false
      return
    }
    if (outsideSince === null) {
      setOutsideSince(now)
      return
    }
    if (now - lastWarning.current > 10_000) {
      lastWarning.current = now
      play('danger')
    }
    if (now - outsideSince >= rules.graceSec * 1000 && !reported.current) {
      reported.current = true
      void zoneOut(game.id)?.then(refresh)
    }
  })
  const graceLeft = outsideSince === null ? 0 : rules.graceSec * 1000 - (now - outsideSince)

  async function submitCatch(code: string) {
    if (sardines) {
      await joinSardine(game.id, code)
      setSheet(null)
      notify('You found the group! Hide quietly with them.', 'warn', 'caught')
    } else {
      const target = await catchPlayer(game.id, code)
      setSheet(null)
      notify(`You caught ${name(target)}!`, 'warn', 'caught')
    }
    refresh()
  }

  async function leave() {
    await leaveGame(game.id)
    navigate('/', { replace: true })
  }

  // ── Role reveal: shown first, and its button is the tap that switches sound on ──
  if (!entered) {
    const intro = sardines
      ? role === 'hider'
        ? 'Hide anywhere in the play area. When the search starts, stay put: everyone who finds you squeezes into your spot.'
        : 'Wait at the start. When the search starts, a circle on your map shows roughly where the hider is. Find them and scan their code.'
      : role === 'hider'
        ? 'Hide inside the play area. You may move at any time.'
        : 'Wait at the start until every hider is hidden or hide time ends. Then find the hiders and enter their codes.'
    return (
      <Screen center>
        <header className="flex w-full items-center">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold text-on-brand ${modeBg}`}>{modeName(game.mode)}</span>
          <span className="ml-auto text-[13px] text-muted">{players.length} players</span>
        </header>
        <div className="mt-auto flex flex-col items-center gap-1.5 text-center">
          <span className="text-muted">{sardines && role === 'hider' ? 'You are the' : 'You are a'}</span>
          <span
            className={`font-display text-[76px] font-bold uppercase leading-none ${sardines ? 'text-mode-sar-ink' : 'text-mode-br-ink'}`}
          >
            {role}
          </span>
          <p className="max-w-[300px] text-[15px] text-muted">{intro}</p>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-sm text-muted">
            {hunting ? (sardines ? 'The search is on' : 'The hunt is on') : sardines ? 'The search starts in' : 'Hunters start in'}
          </span>
          <span className="font-display text-6xl font-bold">{hunting ? clock(tl.end - now) : clock(tl.hideEnd - now)}</span>
        </div>
        <div className="mt-auto flex w-full flex-col gap-3">
          <Button
            kind="secondary"
            onClick={() => {
              unlockSound()
              play('test')
            }}
          >
            Test alert sound
          </Button>
          <Button
            onClick={() => {
              unlockSound()
              play('test')
              startLocation()
              setEntered(true)
            }}
          >
            I’m ready to play
          </Button>
          <Note>Turn the volume up. On iPhone, alerts are sound only.</Note>
        </div>
      </Screen>
    )
  }

  // ── The banner under the timer: the most urgent thing wins ──
  let banner: { text: string; tone: Alert['tone'] } | null = null
  if (location.status === 'denied') banner = { text: locationHelp, tone: 'danger' }
  else if (location.status === 'idle' || location.status === 'unavailable')
    banner = { text: 'CHASE cannot find your position. Check that location is on.', tone: 'danger' }
  else if (outside)
    banner = { text: `Outside the zone! Go ${formatM(toSafe)} back in. ${clock(graceLeft)} left.`, tone: 'danger' }
  else if (wandered)
    banner = { text: `You moved ${formatM(drift)} from your hiding spot. Go back so the hint stays fair.`, tone: 'warn' }
  else if (alert && alert.until > now) banner = alert

  const status = sardines
    ? role === 'hider'
      ? hunting
        ? 'Stay put. Let them find you'
        : me?.hidden
          ? 'Hidden. The search starts soon'
          : 'Find a hiding spot'
      : inGroup
        ? 'Hide quietly with the group'
        : hunting
          ? 'Find the hider, then scan their code'
          : 'Wait at the start'
    : role === 'hider'
      ? hunting
        ? 'Stay hidden inside the zone'
        : me?.hidden
          ? 'Hidden. Waiting for the others'
          : 'Go and hide inside the play area'
      : hunting
        ? 'Find the hiders and enter their codes'
        : 'Wait here until hide time ends'

  const subline = !hunting
    ? `${sardines ? 'The search starts' : 'Hunters start'} in ${clock(tl.hideEnd - now)}`
    : upcoming
      ? `${sardines ? 'Hint shrinks' : 'Zone shrinks'} in ${clock(upcoming - now)}`
      : sardines
        ? 'Smallest hint'
        : 'Final zone'

  const hintCircle = sardines && hint ? { type: 'circle' as const, center: hint.center, radiusM: hint.radiusM } : null
  const mapProps = {
    area,
    zone: sardines ? hintCircle : zone,
    nextZone,
    me: location.status === 'on' ? location.position : null,
    others: seen.map((s) => ({ position: s.position, kind: s.kind })),
  }

  const counts = sardines
    ? [
        { label: 'Found the group', value: `${foundCount}/${seekers.length}` },
        { label: 'Still searching', value: String(stillSearching.length) },
      ]
    : [
        { label: 'Hiders left', value: String(hidersLeft) },
        { label: 'Hunters', value: String(hunters) },
      ]

  const searchButtonLabel = hunting
    ? sardines
      ? 'Found them? Scan their code'
      : 'Catch a hider'
    : sardines
      ? `The search starts in ${clock(tl.hideEnd - now)}`
      : `Catching opens in ${clock(tl.hideEnd - now)} or when all are hidden`

  return (
    <Screen>
      <header className={`flex items-center gap-2 rounded-[18px] px-[18px] py-3.5 text-on-brand ${modeBg}`}>
        <div className="flex flex-col">
          <span className="font-display text-[26px] font-bold uppercase leading-tight">{roleLabel}</span>
          <span className="text-[13px] font-medium">{status}</span>
        </div>
        <button type="button" aria-label="Game menu" onClick={() => setSheet('menu')} className="ml-auto h-11 w-11 font-display text-2xl font-bold">
          ⋯
        </button>
      </header>

      <div className="flex flex-col items-center">
        <span className="font-display text-[76px] font-bold leading-none">{clock(tl.end - now)}</span>
        <span className="font-display text-[15px] font-medium text-muted">{subline}</span>
      </div>

      <div
        role="status"
        className={`flex min-h-[46px] items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold ${banner ? toneClass[banner.tone] : 'bg-surface text-muted'}`}
      >
        {banner ? banner.text : 'No alerts.'}
      </div>

      <div className="relative h-[200px] overflow-hidden rounded-2xl bg-surface">
        <MapView className="h-full w-full" fitArea interactive={false} {...mapProps} />
        <button type="button" aria-label="Open the full map" onClick={() => setMapOpen(true)} className="absolute inset-0" />
        <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold text-ink shadow">
          ⤢ Full map
        </span>
      </div>

      <div className="flex gap-2.5">
        {counts.map((c) => (
          <Tile key={c.label} label={c.label} value={c.value} />
        ))}
      </div>

      {sardines && hunting && (role === 'hider' || inGroup) && (
        <p className="rounded-2xl bg-surface px-4 py-3 text-sm">
          <span className="text-muted">Still searching: </span>
          <span className="font-medium">{stillSearching.length ? stillSearching.map((p) => name(p.id)).join(', ') : 'nobody'}</span>
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {!hunting &&
          (sardines ? (
            <HideProgress
              title={hider?.id === meId ? (me?.hidden ? 'You are hidden' : 'You are still hiding') : `${hider?.nickname ?? 'The hider'} is ${hider?.hidden ? 'hidden' : 'still hiding'}`}
              fraction={hider?.hidden ? 1 : 0}
              timeLabel={`Search starts in ${clock(tl.hideEnd - now)}`}
              note="The search starts as soon as the hider taps “I’m hidden”."
            />
          ) : (
            <HideProgress
              title={`${hidersHidden} of ${hidersLeft} hiders hidden`}
              fraction={hidersLeft ? hidersHidden / hidersLeft : 0}
              timeLabel={`Hunters go in ${clock(tl.hideEnd - now)}`}
              note="Hunters are released as soon as every hider taps “I’m hidden”."
            />
          ))}
        {role === 'hider' && !hunting && (
          <Button kind={me?.hidden ? 'secondary' : 'primary'} onClick={toggleHidden}>
            {me?.hidden ? 'Not hidden yet (undo)' : 'I’m hidden'}
          </Button>
        )}
        {showsCode ? (
          <button
            type="button"
            onClick={() => setSheet('code')}
            disabled={!myCode}
            className="flex items-center gap-3 rounded-[18px] bg-raised p-3 text-left"
          >
            {myCode ? <Qr text={qrText(myCode)} className="h-16 w-16 rounded-[10px] p-1" /> : <span className="h-16 w-16 rounded-[10px] bg-surface" />}
            <span className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">My code</span>
              <span className="font-display text-[32px] font-bold leading-tight tracking-[0.15em]">{myCode ?? '····'}</span>
            </span>
            <span className="ml-auto rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">Enlarge</span>
          </button>
        ) : (
          <Button onClick={() => setSheet('catch')} disabled={!hunting}>
            {searchButtonLabel}
          </Button>
        )}
        <Button kind="secondary" onClick={() => setPocket(true)}>
          Pocket mode
        </Button>
        {!wakeLockSupported && <Note>This phone cannot keep its screen on by itself. Set auto-lock to “Never” while playing.</Note>}
      </div>

      {mapOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-bg">
          {/* The map fills the space above the info panel, so the whole area stays in view. */}
          <div className="relative flex-1">
            <div className="absolute inset-0 pb-5">
              <MapView className="h-full w-full" fitArea flyTo={fly} {...mapProps} />
            </div>
            <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2">
              <button
                type="button"
                aria-label="Close the full map"
                onClick={() => setMapOpen(false)}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-surface/95 text-xl font-bold text-ink shadow-lg"
              >
                ✕
              </button>
              <span className="rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-muted shadow-lg">
                {sardines
                  ? hunting
                    ? `Hint ${stage + 1} of ${rules.zoneStages + 1}`
                    : 'The hint appears when the search starts'
                  : stage === 0
                    ? 'Whole area is safe'
                    : `Zone ${stage} of ${rules.zoneStages}`}
              </span>
              {location.status === 'on' && (
                <button
                  type="button"
                  onClick={() => setFly({ id: Date.now(), center: location.position, zoom: 17 })}
                  className="ml-auto h-12 rounded-full bg-surface/95 px-4 text-sm font-semibold text-ink shadow-lg"
                >
                  ◎ Me
                </button>
              )}
            </div>
          </div>
          <div className="relative z-10 -mt-5 flex flex-col gap-2.5 rounded-t-[24px] bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-8px_24px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-3">
              <span className={`whitespace-nowrap rounded-full px-3 py-1.5 font-display text-sm font-bold uppercase text-on-brand ${modeBg}`}>
                {roleLabel}
              </span>
              <div className="flex flex-col">
                <span className="font-display text-[40px] font-bold leading-none">{clock(tl.end - now)}</span>
                <span className="text-xs font-medium text-muted">{subline}</span>
              </div>
              <div className="ml-auto flex gap-3 text-center">
                {counts.map((c) => (
                  <div key={c.label} className="flex flex-col">
                    <span className="font-display text-2xl font-bold leading-none">{c.value}</span>
                    <span className="max-w-[64px] text-[11px] leading-tight text-muted">{c.label.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
            {banner && (
              <div role="status" className={`rounded-xl px-3 py-2 text-sm font-semibold ${toneClass[banner.tone]}`}>
                {banner.text}
              </div>
            )}
            <div className="flex gap-2.5">
              {showsCode ? (
                <button
                  type="button"
                  onClick={() => setSheet('code')}
                  disabled={!myCode}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-raised font-display"
                >
                  <span className="text-xs font-semibold uppercase text-muted">My code</span>
                  <span className="text-2xl font-bold tracking-[0.15em]">{myCode ?? '····'}</span>
                </button>
              ) : (
                <div className="flex-1">
                  <Button onClick={() => setSheet('catch')} disabled={!hunting}>
                    {hunting ? searchButtonLabel : `${sardines ? 'Search starts' : 'Catching opens'} in ${clock(tl.hideEnd - now)}`}
                  </Button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted">
              {sardines
                ? 'Blue dot: you · Green circle: the hider is somewhere inside it. It shrinks over time.'
                : `Blue dot: you · Green: safe zone${nextZone ? ' · Dashed: next zone' : ''}${
                    role === 'hunter' ? ' · Orange: hunters, green dots: hiders during a reveal' : ' · Hunters see you briefly after each shrink'
                  }`}
            </p>
          </div>
        </div>
      )}
      {sheet === 'code' && myCode && <CodeSheet code={myCode} onClose={() => setSheet(null)} />}
      {sheet === 'catch' &&
        (sardines ? (
          <CatchSheet onSubmit={submitCatch} onClose={() => setSheet(null)} title="Join the group" confirm="Join the group" whose="hider’s" />
        ) : (
          <CatchSheet onSubmit={submitCatch} onClose={() => setSheet(null)} />
        ))}
      {sheet === 'menu' && (
        <Sheet title="Game menu" onClose={() => setSheet(null)}>
          <p className="text-sm text-muted">
            {sardines && role === 'hider'
              ? 'You are the hider: if you leave, the game ends for everyone.'
              : 'Leaving removes you from this game. The others keep playing.'}
          </p>
          <div className="mt-auto flex flex-col gap-3">
            <Button kind="danger" onClick={leave}>
              Leave the game
            </Button>
            <Button kind="secondary" onClick={() => setSheet(null)}>
              Keep playing
            </Button>
          </div>
        </Sheet>
      )}
      {pocket && <Pocket timeLeftMs={tl.end - now} onUnlock={() => setPocket(false)} />}
    </Screen>
  )
}

/** During hide time: who is hidden, and when the hunt starts anyway. */
function HideProgress({ title, fraction, timeLabel, note }: { title: string; fraction: number; timeLabel: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-surface p-3">
      <div className="flex items-baseline">
        <span className="font-display text-[15px] font-medium">{title}</span>
        <span className="ml-auto text-xs text-muted">{timeLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-brand" style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="text-xs text-muted">{note}</span>
    </div>
  )
}

// ───────────────────────────── After the game ─────────────────────────────

function Ended({ game, players, meId, refresh }: { game: GameData; players: Player[]; meId: string; refresh: () => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [round, setRound] = useState<Round | null | 'loading'>('loading')
  const isHost = game.host_id === meId
  const hostName = players.find((p) => p.id === game.host_id)?.nickname ?? 'The host'

  useEffect(() => play('end'), [])

  // The backend saves the results the moment the game ends. Ask again briefly in case of a slow connection.
  useEffect(() => {
    let tries = 0
    let stopped = false
    const load = async () => {
      const r = await fetchRound(game.id, game.round)
      if (stopped) return
      if (r || ++tries >= 4) setRound(r)
      else window.setTimeout(load, 1500)
    }
    void load()
    return () => {
      stopped = true
    }
  }, [game.id, game.round])

  async function again() {
    try {
      await resetGame(game.id)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not go back to the lobby.')
    }
  }

  async function home() {
    await leaveGame(game.id)
    navigate('/', { replace: true })
  }

  if (round === 'loading')
    return (
      <Screen>
        <p className="mt-24 text-center text-muted">Adding up the results…</p>
      </Screen>
    )

  const actions = (
    <>
      {error && <Note>{error}</Note>}
      {isHost ? (
        <Button onClick={again}>Play again</Button>
      ) : (
        <Note>{hostName} can start another round. You will return to the lobby automatically.</Note>
      )}
      {round && <LinkButton to={`/replay/${game.id}/${game.round}`} kind="secondary">Watch replay</LinkButton>}
      <Button kind="secondary" onClick={home}>
        Home
      </Button>
      <Note>Home takes you out of this lobby. Your results stay on your profile.</Note>
    </>
  )

  if (round) return <RoundResults round={round} meId={meId} actions={actions} />

  // Results were not saved (for example a game that ended before this version): a short summary.
  return (
    <Screen>
      <h1 className="font-display text-2xl font-bold">Game over</h1>
      <ul className="flex flex-col gap-2.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <Avatar name={p.nickname} photo={p.photo} size={36} ring={game.winners.includes(p.id) ? 'brand' : 'line'} />
            <span className="font-display font-medium">
              {p.nickname}
              {p.id === meId ? ' (you)' : ''}
            </span>
            <span className="ml-auto text-xs text-muted">{game.winners.includes(p.id) ? 'Survived' : ''}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-3">{actions}</div>
    </Screen>
  )
}
