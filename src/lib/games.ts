import { useCallback, useEffect, useRef, useState } from 'react'
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
}

export type LobbyPlayer = {
  id: string
  nickname: string
  photo: string | null
  ready: boolean
}

const messages: Record<string, string> = {
  GAME_NOT_FOUND: 'No game has that code. Check it and try again.',
  GAME_FULL: 'That game is full (10 players).',
  GAME_STARTED: 'That game has already started.',
  NO_PROFILE: 'Your profile is not saved online yet. Try again in a moment.',
  NOT_HOST: 'Only the host can do that.',
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

export async function createGame(mode: Mode, preset: Preset, settings: BattleRoyaleRules): Promise<string> {
  const db = await requireBackend()
  const { data, error } = await db.rpc('create_game', { p_mode: mode, p_preset: preset, p_settings: settings })
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

type PlayerRow = {
  player_id: string
  ready: boolean
  players: { nickname: string; photo_url: string | null } | { nickname: string; photo_url: string | null }[] | null
}

async function fetchLobby(code: string): Promise<{ game: Game; players: LobbyPlayer[] } | null> {
  if (!supabase) return null
  const { data: game } = await supabase
    .from('games')
    .select('id, code, host_id, mode, status, preset, settings')
    .eq('code', code)
    .maybeSingle()
  if (!game) return null
  const { data: rows } = await supabase
    .from('game_players')
    .select('player_id, ready, players(nickname, photo_url)')
    .eq('game_id', game.id)
    .order('joined_at')
  const players = ((rows ?? []) as PlayerRow[]).map((r) => {
    const p = Array.isArray(r.players) ? r.players[0] : r.players
    return { id: r.player_id, nickname: p?.nickname ?? 'Player', photo: p?.photo_url ?? null, ready: r.ready }
  })
  return { game: game as Game, players }
}

export type LobbyState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** The game no longer exists, or this player was removed from it. */
  | { status: 'gone' }
  | { status: 'ready'; game: Game; players: LobbyPlayer[] }

/**
 * Join the lobby with this code and keep it up to date.
 * The backend announces every change; a slow repeat check covers a missed announcement.
 */
export function useLobby(code: string): { state: LobbyState; refresh: () => void } {
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
        .channel(`lobby-${lobby.game.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${lobby.game.id}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${lobby.game.id}` }, onChange)
        .subscribe()
      const timer = window.setInterval(onChange, 8000)
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
  }, [code, refresh])

  return { state, refresh: () => void refresh() }
}
