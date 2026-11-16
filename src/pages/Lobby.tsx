import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, LinkButton, Note, Screen } from '../components/ui'
import { kickPlayer, leaveGame, setReady, useLobby } from '../lib/games'
import { useProfile } from '../lib/profile'
import { modeName, presetLabel, type Mode } from '../lib/rules'

const modeBg: Record<Mode, string> = {
  battle_royale: 'bg-mode-br',
  sardines: 'bg-mode-sar',
  cops_robbers: 'bg-mode-cnr',
}

function Chip({ children, tone }: { children: string; tone: 'brand' | 'muted' }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        tone === 'brand' ? 'bg-brand text-on-brand' : 'bg-raised text-muted'
      }`}
    >
      {children}
    </span>
  )
}

export default function Lobby() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const profile = useProfile((s) => s.profile)
  const { state, refresh } = useLobby(code.toUpperCase())
  const [qr, setQr] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [shared, setShared] = useState('')

  const link = `${window.location.origin}/join/${code.toUpperCase()}`

  useEffect(() => {
    // The QR code is always dark on white so every camera can read it.
    QRCode.toDataURL(link, { margin: 1, width: 480 }).then(setQr, () => setQr(''))
  }, [link])

  if (state.status === 'loading') {
    return (
      <Screen>
        <p className="mt-24 text-center text-muted">Joining the lobby…</p>
      </Screen>
    )
  }

  if (state.status === 'error' || state.status === 'gone') {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-bold">Lobby</h1>
        <div role="alert" className="rounded-xl bg-danger/15 p-4 text-sm font-semibold text-danger-ink">
          {state.status === 'gone'
            ? 'This lobby has closed, or the host removed you from it.'
            : state.message}
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
  const me = players.find((p) => p.id === profile?.id)
  const isHost = game.host_id === profile?.id
  const allReady = players.length >= 2 && players.every((p) => p.ready)
  const hostName = players.find((p) => p.id === game.host_id)?.nickname ?? 'the host'

  async function share() {
    const text = `Join my CHASE game. Code: ${game.code}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CHASE', text, url: link })
      } else {
        await navigator.clipboard.writeText(link)
        setShared('Link copied')
      }
    } catch {
      // The player closed the share menu: nothing to do.
    }
  }

  async function toggleReady() {
    if (!me) return
    await setReady(game.id, !me.ready)
    refresh()
  }

  async function leave() {
    await leaveGame(game.id)
    navigate('/', { replace: true })
  }

  return (
    <Screen>
      <header className="flex items-center">
        <h1 className="font-display text-2xl font-bold">Lobby</h1>
        <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold text-on-brand ${modeBg[game.mode]}`}>
          {modeName(game.mode)}
        </span>
      </header>

      <section className="flex flex-col gap-2 rounded-[20px] bg-surface p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Game code</span>
        <div className="flex items-center gap-2">
          <span className="font-display text-[32px] font-bold leading-none tracking-wider">{game.code}</span>
          <button
            type="button"
            onClick={share}
            className="ml-auto rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand"
          >
            Share
          </button>
          <button
            type="button"
            onClick={() => setShowQr(!showQr)}
            aria-expanded={showQr}
            className="rounded-full bg-raised px-3 py-1.5 text-xs font-semibold text-muted"
          >
            QR
          </button>
        </div>
        {shared && <span className="text-xs text-muted">{shared}</span>}
        {showQr && qr && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <img src={qr} alt={`QR code for game ${game.code}`} className="h-56 w-56 rounded-xl bg-white p-2" />
            <span className="text-xs text-muted">Friends point their phone camera at this.</span>
          </div>
        )}
      </section>

      <div className="flex items-baseline">
        <h2 className="font-display text-[17px] font-bold">Players {players.length} / 10</h2>
      </div>

      <ul className="flex flex-col gap-2.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <Avatar name={p.nickname} photo={p.photo} size={38} ring={p.ready ? 'brand' : 'line'} />
            <span className="truncate font-display font-medium">
              {p.nickname}
              {p.id === profile?.id ? ' (you)' : ''}
            </span>
            {p.id === game.host_id && <Chip tone="muted">Host</Chip>}
            <span className="ml-auto flex items-center gap-2">
              {isHost && p.id !== profile?.id && (
                <button
                  type="button"
                  onClick={() => void kickPlayer(game.id, p.id).then(refresh)}
                  className="text-xs font-semibold text-danger-ink"
                >
                  Remove
                </button>
              )}
              <Chip tone={p.ready ? 'brand' : 'muted'}>{p.ready ? 'Ready' : 'Not ready'}</Chip>
            </span>
          </li>
        ))}
      </ul>

      <div className="rounded-xl bg-surface px-3.5 py-3 text-[13px] text-muted">
        {presetLabel(game.preset)} · {game.settings.gameMin} min · {game.settings.zoneStages} zone stages
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {isHost ? (
          <>
            <Note>
              {allReady
                ? 'Everyone is ready. Starting the game arrives in milestone 4.'
                : 'Start unlocks when at least 2 players are in and everyone is ready.'}
            </Note>
            <Button disabled>Start game</Button>
          </>
        ) : (
          <Note>{allReady ? `Waiting for ${hostName} to start.` : 'The host starts when everyone is ready.'}</Note>
        )}
        <Button kind={me?.ready ? 'secondary' : 'primary'} onClick={toggleReady}>
          {me?.ready ? 'I’m not ready' : 'I’m ready'}
        </Button>
        <button type="button" onClick={leave} className="py-1 text-sm font-semibold text-muted">
          Leave lobby
        </button>
      </div>
    </Screen>
  )
}
