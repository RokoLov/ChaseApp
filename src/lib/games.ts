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
}

export type GameEvent = {
  id: number
  type: 'start' | 'caught' | 'zone' | 'signal' | 'end'
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
  players: { nickname: string; photo_url: string | null } | { nickname: string; photo_url: string | null }[] | null
}

async function fetchLobby(code: string): Promise<{ game: Game; players: Player[] } | null> {
  if (!supabase) return null
  const { data: game } = await supabase
    .from('games')
    .select('id, code, host_id, mode, status, preset, settings, area, started_at, ended_at, winners, end_reason')
    .eq('code', code)
    .maybeSingle()
  if (!game) return null
  // game_players points at players twice (the player, and who caught them), so name the link to use.
  const { data: rows } = await supabase
    .from('game_players')
    .select(
      'player_id, ready, role, hunter_since, hunter_reason, caught_by, catches, players!game_players_player_id_fkey(nickname, photo_url)',
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
    }
  })
  return { game: { ...(game as Game), winners: (game as Game).winners ?? [] }, players }
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
