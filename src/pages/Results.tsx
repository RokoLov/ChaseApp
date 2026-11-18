import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, LinkButton, Note, Screen } from '../components/ui'
import { clock } from '../lib/br'
import { fetchRound, type Round, type RoundPlayer } from '../lib/games'
import { REPLAY_KEEP_MS, useHistory } from '../lib/history'
import { useProfile } from '../lib/profile'
import { modeName } from '../lib/rules'

const time = (sec: number | null) => (sec === null ? '–' : clock(sec * 1000))

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

function sardinesTitle(round: Round): string {
  const hider = round.players.find((p) => p.startRole === 'hider')
  const seekers = round.players.filter((p) => p.startRole === 'seeker')
  const found = seekers.filter((p) => p.foundRank !== null)
  if (round.endReason === 'hider_left') return 'The hider left'
  if (round.endReason === 'all_found') {
    if (seekers.length === 1) return `${seekers[0].nickname} found ${hider?.nickname ?? 'the hider'}`
    const last = [...found].sort((a, b) => (b.foundRank ?? 0) - (a.foundRank ?? 0))[0]
    return `${last?.nickname ?? 'Someone'} found the group last`
  }
  if (found.length === 0) return `${hider?.nickname ?? 'The hider'} stayed hidden`
  return `${found.length} of ${seekers.length} found ${hider?.nickname ?? 'the hider'}`
}

function resultTitle(round: Round): string {
  if (round.mode === 'sardines') return sardinesTitle(round)
  const winners = round.players.filter((p) => p.won)
  if (round.endReason === 'all_caught') return 'Hunters win'
  if (winners.length === 1) return `${winners[0].nickname} wins`
  return `${winners.length} hiders survived`
}

const reasonText = (round: Round) =>
  round.endReason === 'all_found'
    ? 'Everyone found the hiding spot'
    : round.endReason === 'hider_left'
      ? 'The game ended early'
      : round.mode === 'sardines'
        ? 'Time ran out with seekers still searching'
        : round.endReason === 'last_hider'
    ? 'Last hider standing'
    : round.endReason === 'time'
      ? 'Time ran out with hiders still free'
      : 'Every hider was caught'

function outcome(p: RoundPlayer, nameOf: (id: string | null) => string, round: Round): string {
  if (round.mode === 'sardines') {
    if (p.startRole === 'hider') return p.won ? 'The hider · won' : 'The hider'
    if (p.foundRank !== null) return `Found the group ${ordinal(p.foundRank)} · ${time(p.foundSec)} into the search`
    return 'Still searching at the end'
  }
  let base: string
  if (p.startRole === 'hunter') base = p.won ? 'Started as hunter · caught everyone' : 'Started as hunter'
  else if (p.won) base = `Survived · ${time(p.survivedSec)}`
  else if (p.outReason === 'caught') base = `Caught by ${nameOf(p.caughtBy)} at ${time(p.survivedSec)}`
  else if (p.outReason === 'zone') base = `Left the zone at ${time(p.survivedSec)}`
  else if (p.outReason === 'signal') base = `Lost signal at ${time(p.survivedSec)}`
  else base = `Lasted ${time(p.survivedSec)}`
  return p.catches > 0 ? `${base} · ${p.catches} ${p.catches === 1 ? 'catch' : 'catches'}` : base
}

/** The results of one round: winner, your numbers, the ranking, and Add friend. */
export function RoundResults({ round, meId, actions }: { round: Round; meId: string; actions: ReactNode }) {
  const friends = useProfile((s) => s.profile?.friends ?? [])
  const addFriend = useProfile((s) => s.addFriend)
  const sync = useProfile((s) => s.sync)
  const setLastGame = useHistory((s) => s.setLastGame)
  const winners = round.players.filter((p) => p.won)
  const title = resultTitle(round)
  const nameOf = (id: string | null) =>
    id === meId ? 'you' : (round.players.find((p) => p.id === id)?.nickname ?? 'a player')
  const meIndex = round.players.findIndex((p) => p.id === meId)
  const me = round.players[meIndex]

  // The backend has already added this round to everyone's stats; fetch them.
  useEffect(() => {
    void sync()
    setLastGame({ gameId: round.gameId, round: round.round, endedAt: round.endedAt, title })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.gameId, round.round])

  return (
    <Screen>
      <header className="flex items-center">
        <h1 className="font-display text-2xl font-bold">Game over</h1>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold text-on-brand ${
            round.mode === 'sardines' ? 'bg-mode-sar' : 'bg-mode-br'
          }`}
        >
          {modeName(round.mode)}
        </span>
      </header>

      <div className="flex flex-col items-center gap-1 py-1 text-center">
        {winners.length >= 1 && winners.length <= 3 && (
          <div className="flex -space-x-3">
            {winners.map((w) => (
              <Avatar key={w.id} name={w.nickname} photo={w.photo} size={winners.length === 1 ? 76 : 60} ring="brand" />
            ))}
          </div>
        )}
        <span className="font-display text-[30px] font-bold leading-tight">{title}</span>
        <span className="text-[13px] text-muted">
          {reasonText(round)} · {clock(Date.parse(round.endedAt) - Date.parse(round.startedAt))} played
        </span>
      </div>

      {me && (
        <section className="flex flex-col gap-2 rounded-[20px] bg-surface p-4">
          <div className="flex items-center">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your game</span>
            <span
              className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${
                me.won ? 'bg-brand text-on-brand' : 'bg-raised text-muted'
              }`}
            >
              {me.won ? 'You won' : `#${meIndex + 1} of ${round.players.length}`}
            </span>
          </div>
          <div className="flex text-center">
            {round.mode === 'sardines' ? (
              <>
                <div className="flex flex-1 flex-col">
                  <span className="font-display text-2xl font-bold">{me.foundRank !== null ? ordinal(me.foundRank) : '–'}</span>
                  <span className="text-xs text-muted">Found the group</span>
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="font-display text-2xl font-bold">{time(me.foundSec)}</span>
                  <span className="text-xs text-muted">Search time</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-1 flex-col">
                  <span className="font-display text-2xl font-bold">{me.startRole === 'hider' ? time(me.survivedSec) : '–'}</span>
                  <span className="text-xs text-muted">Time survived</span>
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="font-display text-2xl font-bold">{me.catches}</span>
                  <span className="text-xs text-muted">Catches</span>
                </div>
              </>
            )}
            <div className="flex flex-1 flex-col">
              <span className="font-display text-2xl font-bold capitalize">{me.startRole}</span>
              <span className="text-xs text-muted">Started as</span>
            </div>
          </div>
        </section>
      )}

      <ol className="flex flex-col gap-2.5">
        {round.players.map((p, i) => {
          const isFriend = friends.some((f) => f.id === p.id)
          return (
            <li key={p.id} className="flex items-center gap-2.5">
              <span className="w-5 text-center font-display text-sm font-bold text-muted">{i + 1}</span>
              <Avatar name={p.nickname} photo={p.photo} size={38} ring={p.won ? 'brand' : 'line'} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-display font-medium">
                  {p.nickname}
                  {p.id === meId ? ' (you)' : ''}
                </span>
                <span className="text-xs text-muted">{outcome(p, nameOf, round)}</span>
              </div>
              {p.id !== meId &&
                (isFriend ? (
                  <span className="ml-auto shrink-0 rounded-full bg-raised px-2.5 py-1.5 text-xs font-semibold text-muted">
                    ✓ Friend
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void addFriend({ id: p.id, nickname: p.nickname, photo: p.photo })}
                    className="ml-auto shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand"
                  >
                    + Add friend
                  </button>
                ))}
            </li>
          )
        })}
      </ol>

      <div className="mt-auto flex flex-col gap-3">{actions}</div>
    </Screen>
  )
}

/** Results opened later, from Home. */
export default function ResultsPage() {
  const { gameId = '', round = '0' } = useParams()
  const navigate = useNavigate()
  const meId = useProfile((s) => s.profile?.id ?? '')
  const ensureBackend = useProfile((s) => s.ensureBackend)
  const [data, setData] = useState<Round | null | 'loading'>('loading')

  useEffect(() => {
    void ensureBackend().then(() => fetchRound(gameId, Number(round)).then(setData))
  }, [gameId, round, ensureBackend])

  if (data === 'loading')
    return (
      <Screen>
        <p className="mt-24 text-center text-muted">Loading the results…</p>
      </Screen>
    )
  if (!data)
    return (
      <Screen>
        <h1 className="font-display text-2xl font-bold">Results</h1>
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">These results are not available.</p>
        <div className="mt-auto">
          <Button kind="secondary" onClick={() => navigate('/')}>
            Home
          </Button>
        </div>
      </Screen>
    )
  const replayKept = Date.now() - Date.parse(data.endedAt) < REPLAY_KEEP_MS
  return (
    <RoundResults
      round={data}
      meId={meId}
      actions={
        <>
          {replayKept && (
            <LinkButton to={`/replay/${data.gameId}/${data.round}`}>Watch replay</LinkButton>
          )}
          <Button kind="secondary" onClick={() => navigate('/')}>
            Home
          </Button>
          {!replayKept && <Note>The replay was deleted 24 hours after the game.</Note>}
        </>
      }
    />
  )
}
