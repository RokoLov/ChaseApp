import { useCallback, useEffect, useRef, useState } from 'react'
import type { Area, LngLat } from './geo'
import { useProfile } from './profile'
import type { BattleRoyaleRules, Mode, Preset } from './rules'
import { supabase } from './supabase'

export type Game = {
  id: string
  code: string
  host_id: string
  mode: Mode
  status: 'lobby' | 'running' | 'ended'
  preset: Preset
  settings: BattleRoyaleRules
  area: Area | null
  started_at: string | null
  ended_at: string | null
  winners: string[]
  end_reason: 'last_hider' | 'all_caught' | 'time' | null
  /** Set when every hider said they were hidden before the hide timer ran out. */
  hide_ended_at: string | null
  /** Counts up each time the game starts ("Play again" starts round 2, 3...). */
  round: number
}

export type Player = {
  id: string
  nickname: string
  photo: string | null
  ready: boolean
  role: 'hider' | 'hunter' | null
  hunterSince: string | null
  hunterReason: 'start' | 'caught' | 'zone' | 'signal' | null
  caughtBy: string | null
  catches: number
  /** A hider tapped "I'm hidden". */
  hidden: boolean
}

export type GameEvent = {
  id: number
  type: 'start' | 'caught' | 'zone' | 'signal' | 'end' | 'release'
  actor: string | null
  target: string | null
}

const messages: Record<string, string> = {
  GAME_NOT_FOUND: 'No game has that code. Check it and try again.',
  GAME_FULL: 'That game is full (10 players).',
  GAME_STARTED: 'That game has already started.',
  NO_PROFILE: 'Your profile is not saved online yet. Try again in a moment.',
  NOT_HOST: 'Only the host can do that.',
  BAD_AREA: 'The play area is missing or too large. Draw it again.',
  NEED_TWO_PLAYERS: 'A game needs at least 2 players.',
  NOT_ALL_READY: 'Someone is not ready yet.',
  BAD_HUNTERS: 'Pick at least one hunter and leave at least one hider.',
  WRONG_CODE: 'That code does not belong to a hider. Check it and try again.',
  TOO_FAR: 'That player is too far away to be caught.',
  HIDE_TIME: 'Hunters cannot catch anyone until hide time is over.',
  NOT_HUNTER: 'Only hunters can catch.',
  NOT_RUNNING: 'The game is not running.',
}

/** Turn a backend error into a sentence a player can act on. */
function friendly(error: { message: string } | null, fallback: string): string {
  if (!error) return fallback
  const key = Object.keys(messages).find((k) => error.message.includes(k))
  return key ? messages[key] : fallback
}

const offline = 'Online play is not available. Check your connection and try again.'

/** Sign in if needed. Throws a readable message when online play cannot work. */
async function requireBackend() {
  if (!supabase) throw new Error('The backend is not set up in this build.')
  const ok = await useProfile.getState().ensureBackend()
  if (!ok) throw new Error(offline)
  return supabase
}

export async function createGame(
  mode: Mode,
  preset: Preset,
  settings: BattleRoyaleRules,
  area: Area,
): Promise<string> {
  const db = await requireBackend()
  const { data, error } = await db.rpc('create_game', {
    p_mode: mode,
    p_preset: preset,
    p_settings: settings,
    p_area: area,
  })
  if (error || !data) throw new Error(friendly(error, 'The game could not be created. Try again.'))
  return data as string
}

export async function joinGame(code: string): Promise<string> {
  const db = await requireBackend()
  const { data, error } = await db.rpc('join_game', { p_code: code })
  if (error || !data) throw new Error(friendly(error, 'Could not join the game. Try again.'))
  return data as string
}

export async function setReady(gameId: string, ready: boolean) {
  await supabase?.rpc('set_ready', { p_game: gameId, p_ready: ready })
}

export async function leaveGame(gameId: string) {
  await supabase?.rpc('leave_game', { p_game: gameId })
}

export async function kickPlayer(gameId: string, playerId: string) {
  await supabase?.rpc('kick_player', { p_game: gameId, p_player: playerId })
}

/** Start the game. `hunters` is the host's pick, or null to let the backend pick at random. */
export async function startGame(gameId: string, hunters: string[] | null) {
  const db = await requireBackend()
  const { error } = await db.rpc('start_game', { p_game: gameId, p_hunters: hunters })
  if (error) throw new Error(friendly(error, 'The game could not be started. Try again.'))
}

/** A hunter enters a hider's code. Returns the caught player's id. */
export async function catchPlayer(gameId: string, code: string): Promise<string> {
  const db = await requireBackend()
  const { data, error } = await db.rpc('catch_player', { p_game: gameId, p_code: code })
  if (error || !data) throw new Error(friendly(error, 'The catch did not go through. Try again.'))
  return data as string
}

export async function resetGame(gameId: string) {
  const db = await requireBackend()
  const { error } = await db.rpc('reset_game', { p_game: gameId })
  if (error) throw new Error(friendly(error, 'Could not go back to the lobby. Try again.'))
}

/** A hider says they are hidden (or not yet). When every hider is, hunters are released early. */
export const markHidden = (gameId: string, hidden: boolean) => supabase?.rpc('mark_hidden', { p_game: gameId, p_hidden: hidden })

export const zoneOut = (gameId: string) => supabase?.rpc('zone_out', { p_game: gameId })
export const sweepSignal = (gameId: string) => supabase?.rpc('sweep_signal', { p_game: gameId })
export const endGame = (gameId: string) => supabase?.rpc('end_game', { p_game: gameId })

/** Tell the backend this phone is still in the game, with its position when the reading is good. */
export function reportPosition(gameId: string, position: LngLat | null, accuracyM: number | null) {
  return supabase?.rpc('report_position', {
    p_game: gameId,
    p_lat: position ? position[1] : null,
    p_lng: position ? position[0] : null,
    p_accuracy: accuracyM,
  })
}

/** How far this phone's clock is from the backend's, in milliseconds. */
export async function fetchClockOffset(): Promise<number> {
  if (!supabase) return 0
  const before = Date.now()
  const { data } = await supabase.rpc('server_now')
  const after = Date.now()
  return data ? Date.parse(data as string) - (before + after) / 2 : 0
}

export async function fetchMyCode(gameId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.from('catch_codes').select('code').eq('game_id', gameId).maybeSingle()
  return (data as { code: string } | null)?.code ?? null
}

export async function fetchEvents(gameId: string, afterId: number): Promise<GameEvent[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('events')
    .select('id, type, actor, target')
    .eq('game_id', gameId)
    .gt('id', afterId)
    .order('id')
  return (data as GameEvent[] | null) ?? []
}

export type Seen = { id: string; position: LngLat; kind: 'hunter' | 'hider' }

/** The other players this phone is allowed to see right now. The backend decides, not the app. */
export async function fetchSeen(gameId: string, myId: string, askReveal: boolean): Promise<Seen[]> {
  if (!supabase) return []
  const seen: Seen[] = []
  const { data: hunters } = await supabase.from('positions').select('player_id, lat, lng').eq('game_id', gameId)
  for (const p of (hunters as { player_id: string; lat: number; lng: number }[] | null) ?? [])
    if (p.player_id !== myId) seen.push({ id: p.player_id, position: [p.lng, p.lat], kind: 'hunter' })
  if (askReveal) {
    const { data: hiders } = await supabase.rpc('get_reveal', { p_game: gameId })
    for (const p of (hiders as { player_id: string; lat: number; lng: number }[] | null) ?? [])
      seen.push({ id: p.player_id, position: [p.lng, p.lat], kind: 'hider' })
  }
  return seen
}

type PlayerRow = {
  player_id: string
  ready: boolean
  role: Player['role']
  hunter_since: string | null
  hunter_reason: Player['hunterReason']
  caught_by: string | null
  catches: number
  hidden: boolean | null
  players: { nickname: string; photo_url: string | null } | { nickname: string; photo_url: string | null }[] | null
}

async function fetchLobby(code: string): Promise<{ game: Game; players: Player[] } | null> {
  if (!supabase) return null
  const { data: game } = await supabase
    .from('games')
    .select('id, code, host_id, mode, status, preset, settings, area, started_at, ended_at, winners, end_reason, hide_ended_at, round')
    .eq('code', code)
    .maybeSingle()
  if (!game) return null
  // game_players points at players twice (the player, and who caught them), so name the link to use.
  const { data: rows } = await supabase
    .from('game_players')
    .select(
      'player_id, ready, role, hunter_since, hunter_reason, caught_by, catches, hidden, players!game_players_player_id_fkey(nickname, photo_url)',
    )
    .eq('game_id', game.id)
    .order('joined_at')
  const players = ((rows ?? []) as PlayerRow[]).map((r) => {
    const p = Array.isArray(r.players) ? r.players[0] : r.players
    return {
      id: r.player_id,
      nickname: p?.nickname ?? 'Player',
      photo: p?.photo_url ?? null,
      ready: r.ready,
      role: r.role,
      hunterSince: r.hunter_since,
      hunterReason: r.hunter_reason,
      caughtBy: r.caught_by,
      catches: r.catches ?? 0,
      hidden: r.hidden ?? false,
    }
  })
  const g = game as Game
  return { game: { ...g, winners: g.winners ?? [], round: g.round ?? 0, hide_ended_at: g.hide_ended_at ?? null }, players }
}

export type LobbyState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** The game no longer exists, or this player was removed from it. */
  | { status: 'gone' }
  | { status: 'ready'; game: Game; players: Player[] }

/**
 * Join the game with this code and keep it up to date.
 * The backend announces every change; a repeat check covers a missed announcement.
 */
export function useLobby(code: string, everyMs = 8000): { state: LobbyState; refresh: () => void } {
  const [state, setState] = useState<LobbyState>({ status: 'loading' })
  const joined = useRef(false)

  const refresh = useCallback(async () => {
    const lobby = await fetchLobby(code)
    if (lobby) setState({ status: 'ready', ...lobby })
    else if (joined.current) setState({ status: 'gone' })
  }, [code])

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}

    async function start() {
      try {
        await joinGame(code)
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : offline })
        return
      }
      const lobby = await fetchLobby(code)
      if (cancelled || !supabase) return
      if (!lobby) {
        setState({ status: 'gone' })
        return
      }
      joined.current = true
      setState({ status: 'ready', ...lobby })

      const db = supabase
      const onChange = () => void refresh()
      const channel = db
        .channel(`game-${lobby.game.id}-${everyMs}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${lobby.game.id}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${lobby.game.id}` }, onChange)
        .subscribe()
      const timer = window.setInterval(onChange, everyMs)
      const onVisible = () => document.visibilityState === 'visible' && onChange()
      document.addEventListener('visibilitychange', onVisible)
      cleanup = () => {
        window.clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisible)
        void db.removeChannel(channel)
      }
    }

    void start()
    return () => {
      cancelled = true
      cleanup()
    }
  }, [code, everyMs, refresh])

  return { state, refresh: () => void refresh() }
}

// ───────────────────────────── After the game ─────────────────────────────

export type RoundPlayer = {
  id: string
  nickname: string
  photo: string | null
  startRole: 'hider' | 'hunter'
  won: boolean
  /** Seconds from the start until caught, or until the end. Hiders only. */
  survivedSec: number | null
  catches: number
  caughtBy: string | null
  outReason: 'caught' | 'zone' | 'signal' | null
  outAt: string | null
}

export type Round = {
  gameId: string
  round: number
  mode: Mode
  area: Area | null
  settings: BattleRoyaleRules
  startedAt: string
  huntAt: string
  endedAt: string
  endReason: Game['end_reason']
  players: RoundPlayer[]
}

type RoundPlayerRow = {
  player_id: string
  start_role: RoundPlayer['startRole']
  won: boolean
  survived_sec: number | null
  catches: number
  caught_by: string | null
  out_reason: RoundPlayer['outReason']
  out_at: string | null
  players: { nickname: string; photo_url: string | null } | { nickname: string; photo_url: string | null }[] | null
}

/** The saved results of a finished round. Only players of that round can read them. */
export async function fetchRound(gameId: string, round: number): Promise<Round | null> {
  if (!supabase) return null
  const { data: r } = await supabase
    .from('game_rounds')
    .select('game_id, round, mode, area, settings, started_at, hunt_at, ended_at, end_reason')
    .eq('game_id', gameId)
    .eq('round', round)
    .maybeSingle()
  if (!r) return null
  const { data: rows } = await supabase
    .from('round_players')
    .select(
      'player_id, start_role, won, survived_sec, catches, caught_by, out_reason, out_at, players!round_players_player_id_fkey(nickname, photo_url)',
    )
    .eq('game_id', gameId)
    .eq('round', round)
  const players = ((rows ?? []) as RoundPlayerRow[]).map((x) => {
    const p = Array.isArray(x.players) ? x.players[0] : x.players
    return {
      id: x.player_id,
      nickname: p?.nickname ?? 'Player',
      photo: p?.photo_url ?? null,
      startRole: x.start_role,
      won: x.won,
      survivedSec: x.survived_sec,
      catches: x.catches,
      caughtBy: x.caught_by,
      outReason: x.out_reason,
      outAt: x.out_at,
    }
  })
  const row = r as {
    game_id: string
    round: number
    mode: Mode
    area: Area | null
    settings: BattleRoyaleRules
    started_at: string
    hunt_at: string
    ended_at: string
    end_reason: Game['end_reason']
  }
  return {
    gameId: row.game_id,
    round: row.round,
    mode: row.mode,
    area: row.area,
    settings: row.settings,
    startedAt: row.started_at,
    huntAt: row.hunt_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    players: rankRound(players),
  }
}

/** Winners first, then hiders by how long they lasted, then hunters by catches. */
export function rankRound(players: RoundPlayer[]): RoundPlayer[] {
  const score = (p: RoundPlayer) => [p.won ? 1 : 0, p.survivedSec ?? -1, p.catches]
  return [...players].sort((a, b) => {
    const x = score(a)
    const y = score(b)
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]
    return a.nickname.localeCompare(b.nickname)
  })
}

export type TrackPoint = { player: string; at: number; position: LngLat }

/** Everyone's route points for a finished round, oldest first. Empty once they are deleted. */
export async function fetchTracks(gameId: string, round: number): Promise<TrackPoint[]> {
  if (!supabase) return []
  const points: TrackPoint[] = []
  // The backend sends at most 1000 rows at a time, so ask page by page.
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('tracks')
      .select('player_id, at, lat, lng')
      .eq('game_id', gameId)
      .eq('round', round)
      .order('at')
      .range(from, from + 999)
    if (error || !data) break
    for (const t of data as { player_id: string; at: string; lat: number; lng: number }[])
      points.push({ player: t.player_id, at: Date.parse(t.at), position: [t.lng, t.lat] })
    if (data.length < 1000) break
  }
  return points
}
