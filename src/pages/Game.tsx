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
  fetchEvents,
  fetchMyCode,
  fetchSeen,
  leaveGame,
  reportPosition,
  resetGame,
  sweepSignal,
  useLobby,
  zoneOut,
  type Game as GameData,
  type GameEvent,
  type Player,
  type Seen,
} from '../lib/games'
import { formatM } from '../lib/geo'
import { locationHelp, useLocation } from '../lib/location'
import { useProfile } from '../lib/profile'
import { play, unlockSound, type Sound } from '../lib/sound'
import { supabase } from '../lib/supabase'
import { useWakeLock, wakeLockSupported } from '../lib/wake'

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
  const tl = timeline(Date.parse(game.started_at!), rules)

  // The backend's clock, so every phone counts down together.
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    void fetchClockOffset().then(setOffset)
  }, [])
  const [now, setNow] = useState(() => Date.now())
  useEvery(() => setNow(Date.now() + offset), 500)

  const me = players.find((p) => p.id === meId)
  const role = me?.role ?? 'hunter'
  const hunting = now >= tl.hideEnd
  const stage = stageAt(tl, now)
  const zone = zoneCircle(area, stage, rules.zoneStages)
  const upcoming = nextShrink(tl, now)
  const nextZone = upcoming ? zoneCircle(area, stage + 1, rules.zoneStages) : null
  const revealing = rules.revealOnShrink && isRevealWindow(tl, now)
  const hidersLeft = players.filter((p) => p.role === 'hider').length
  const hunters = players.filter((p) => p.role === 'hunter').length
  const name = (id: string | null) => (id === meId ? 'You' : (players.find((p) => p.id === id)?.nickname ?? 'A player'))

  const { location, start: startLocation } = useLocation()
  const [entered, setEntered] = useState(false)
  useWakeLock(entered)
  const [alert, setAlert] = useState<Alert | null>(null)
  const [sheet, setSheet] = useState<null | 'code' | 'catch' | 'map' | 'menu'>(null)
  const [pocket, setPocket] = useState(false)
  const [myCode, setMyCode] = useState<string | null>(null)
  const [seen, setSeen] = useState<Seen[]>([])

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

  useEvery(() => void sweepSignal(game.id), 30_000, hunting)

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
    if (crossed(tl.hideEnd)) notify('Hunters are released!', 'warn', 'release')
    for (const s of tl.shrinks) {
      if (crossed(s - WARN_MS)) notify('The zone shrinks in 60 seconds.', 'warn', 'warn')
      if (crossed(s)) {
        if (!rules.revealOnShrink) notify('The zone shrank.', 'warn', 'shrink')
        else if (role === 'hunter') notify(`The zone shrank. Hiders are on your map for ${REVEAL_MS / 1000} seconds.`, 'warn', 'reveal')
        else notify(`The zone shrank. Hunters can see you for ${REVEAL_MS / 1000} seconds.`, 'danger', 'shrink')
      }
    }
    if (crossed(tl.end - 60_000)) notify('1 minute left.', 'warn', 'warn')
  })

  // Things other players did: catches, zone exits, lost signal.
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

  // A hider outside the safe zone gets a countdown; when it runs out they become a hunter.
  const toSafe = location.status === 'on' ? distanceToSafeM(area, stage, rules.zoneStages, location.position) : 0
  const outside = role === 'hider' && hunting && toSafe > 5
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
    const target = await catchPlayer(game.id, code)
    setSheet(null)
    notify(`You caught ${name(target)}!`, 'warn', 'caught')
    refresh()
  }

  async function leave() {
    await leaveGame(game.id)
    navigate('/', { replace: true })
  }

  // ── Role reveal: shown first, and its button is the tap that switches sound on ──
  if (!entered) {
    return (
      <Screen center>
        <header className="flex w-full items-center">
          <span className="rounded-full bg-mode-br px-2.5 py-1 text-xs font-semibold text-on-brand">Battle Royale</span>
          <span className="ml-auto text-[13px] text-muted">{players.length} players</span>
        </header>
        <div className="mt-auto flex flex-col items-center gap-1.5 text-center">
          <span className="text-muted">You are a</span>
          <span className="font-display text-[76px] font-bold uppercase leading-none text-mode-br-ink">{role}</span>
          <p className="max-w-[300px] text-[15px] text-muted">
            {role === 'hider'
              ? 'Hide inside the play area. You may move at any time.'
              : 'Wait at the start until hide time ends, then find the hiders and enter their codes.'}
          </p>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-sm text-muted">{hunting ? 'The hunt is on' : 'Hunters start in'}</span>
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
  else if (alert && alert.until > now) banner = alert

  const status =
    role === 'hider'
      ? hunting
        ? 'Stay hidden inside the zone'
        : 'Go and hide inside the play area'
      : hunting
        ? 'Find the hiders and enter their codes'
        : 'Wait here until hide time ends'

  const mapProps = {
    area,
    zone,
    nextZone,
    me: location.status === 'on' ? location.position : null,
    others: seen.map((s) => ({ position: s.position, kind: s.kind })),
  }

  return (
    <Screen>
      <header className="flex items-center gap-2 rounded-[18px] bg-mode-br px-[18px] py-3.5 text-on-brand">
        <div className="flex flex-col">
          <span className="font-display text-[26px] font-bold uppercase leading-tight">{role}</span>
          <span className="text-[13px] font-medium">{status}</span>
        </div>
        <button type="button" aria-label="Game menu" onClick={() => setSheet('menu')} className="ml-auto h-11 w-11 font-display text-2xl font-bold">
          ⋯
        </button>
      </header>

      <div className="flex flex-col items-center">
        <span className="font-display text-[76px] font-bold leading-none">{clock(tl.end - now)}</span>
        <span className="font-display text-[15px] font-medium text-muted">
          {!hunting
            ? `Hunters start in ${clock(tl.hideEnd - now)}`
            : upcoming
              ? `Zone shrinks in ${clock(upcoming - now)}`
              : 'Final zone'}
        </span>
      </div>

      <div
        role="status"
        className={`flex min-h-[46px] items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold ${banner ? toneClass[banner.tone] : 'bg-surface text-muted'}`}
      >
        {banner ? banner.text : 'No alerts.'}
      </div>

      <div className="relative h-[200px] overflow-hidden rounded-2xl bg-surface">
        <MapView className="h-full w-full" fitArea interactive={false} {...mapProps} />
        <button type="button" aria-label="Open the full map" onClick={() => setSheet('map')} className="absolute inset-0" />
      </div>

      <div className="flex gap-2.5">
        <Tile label="Hiders left" value={String(hidersLeft)} />
        <Tile label="Hunters" value={String(hunters)} />
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {role === 'hider' ? (
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
            {hunting ? 'Catch a hider' : `Catching opens in ${clock(tl.hideEnd - now)}`}
          </Button>
        )}
        <Button kind="secondary" onClick={() => setPocket(true)}>
          Pocket mode
        </Button>
        {!wakeLockSupported && <Note>This phone cannot keep its screen on by itself. Set auto-lock to “Never” while playing.</Note>}
      </div>

      {sheet === 'code' && myCode && <CodeSheet code={myCode} onClose={() => setSheet(null)} />}
      {sheet === 'catch' && <CatchSheet onSubmit={submitCatch} onClose={() => setSheet(null)} />}
      {sheet === 'map' && (
        <Sheet title="Map" onClose={() => setSheet(null)}>
          <MapView className="h-[60dvh] w-full overflow-hidden rounded-2xl bg-surface" fitArea {...mapProps} />
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-raised px-2.5 py-1 text-muted">Blue dot: you</span>
            <span className="rounded-full bg-brand px-2.5 py-1 text-on-brand">Safe zone</span>
            {nextZone && <span className="rounded-full bg-warn/15 px-2.5 py-1 text-warn-ink">Dashed: next zone</span>}
            {role === 'hunter' && <span className="rounded-full bg-mode-br px-2.5 py-1 text-on-brand">Other hunters</span>}
          </div>
          <p className="text-xs text-muted">
            {role === 'hunter'
              ? 'You see the other hunters, and the hiders for a moment after each zone shrink.'
              : 'You see only yourself. Hunters see you for a moment after each zone shrink.'}
          </p>
          <p className="text-xs text-muted">
            Zone stage {stage} of {rules.zoneStages}
          </p>
          <div className="mt-auto">
            <Button kind="secondary" onClick={() => setSheet(null)}>
              Close
            </Button>
          </div>
        </Sheet>
      )}
      {sheet === 'menu' && (
        <Sheet title="Game menu" onClose={() => setSheet(null)}>
          <p className="text-sm text-muted">Leaving removes you from this game. The others keep playing.</p>
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

// ───────────────────────────── After the game ─────────────────────────────

function Ended({ game, players, meId, refresh }: { game: GameData; players: Player[]; meId: string; refresh: () => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const isHost = game.host_id === meId
  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.nickname ?? 'a player'
  const winners = players.filter((p) => game.winners.includes(p.id))

  useEffect(() => play('end'), [])

  const title =
    game.end_reason === 'all_caught' || winners.length === 0
      ? 'Hunters win'
      : winners.length === 1
        ? `${winners[0].nickname} wins`
        : `${winners.length} hiders survived`
  const reason =
    game.end_reason === 'last_hider'
      ? 'Last hider standing'
      : game.end_reason === 'time'
        ? 'Time ran out with hiders still free'
        : 'Every hider was caught'

  const outcome = (p: Player) => {
    const base = game.winners.includes(p.id)
      ? 'Survived'
      : p.hunterReason === 'start'
        ? 'Started as a hunter'
        : p.hunterReason === 'caught'
          ? `Caught by ${nameOf(p.caughtBy)}`
          : p.hunterReason === 'zone'
            ? 'Left the zone'
            : p.hunterReason === 'signal'
              ? 'Lost signal'
              : ''
    return p.catches > 0 ? `${base} · ${p.catches} ${p.catches === 1 ? 'catch' : 'catches'}` : base
  }

  async function again() {
    try {
      await resetGame(game.id)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not go back to the lobby.')
    }
  }

  async function leave() {
    await leaveGame(game.id)
    navigate('/', { replace: true })
  }

  return (
    <Screen>
      <header className="flex items-center">
        <h1 className="font-display text-2xl font-bold">Game over</h1>
        <span className="ml-auto rounded-full bg-mode-br px-2.5 py-1 text-xs font-semibold text-on-brand">Battle Royale</span>
      </header>

      <div className="flex flex-col items-center gap-1 py-2 text-center">
        {winners.length === 1 && <Avatar name={winners[0].nickname} photo={winners[0].photo} size={76} ring="brand" />}
        <span className="font-display text-[30px] font-bold leading-tight">{title}</span>
        <span className="text-[13px] text-muted">{reason}</span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <Avatar name={p.nickname} photo={p.photo} size={36} ring={game.winners.includes(p.id) ? 'brand' : 'line'} />
            <div className="flex flex-col">
              <span className="font-display font-medium">
                {p.nickname}
                {p.id === meId ? ' (you)' : ''}
              </span>
              <span className="text-xs text-muted">{outcome(p)}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        {error && <Note>{error}</Note>}
        {isHost ? (
          <Button onClick={again}>Play again</Button>
        ) : (
          <Note>{nameOf(game.host_id)} can start another round. You will return to the lobby automatically.</Note>
        )}
        <Button kind="secondary" onClick={leave}>
          Leave
        </Button>
        <Note>Full results, stats and the replay arrive in milestone 5.</Note>
      </div>
    </Screen>
  )
}
