import { useState } from 'react'
import { startGame, type Game, type Player } from '../lib/games'
import { Sheet } from './GameSheets'
import { Avatar, Button, Note } from './ui'

const checks = [
  'No busy roads inside the play area',
  'No private property, water or building sites',
  'Everyone knows the boundaries and has enough battery',
]

/** The host's last step before the game: confirm the safety checklist and choose the hunters. */
export function StartSheet({
  game,
  players,
  onClose,
  onStarted,
}: {
  game: Game
  players: Player[]
  onClose: () => void
  onStarted: () => void
}) {
  const [ticked, setTicked] = useState<boolean[]>(checks.map(() => false))
  const [pick, setPick] = useState(false)
  const [hunters, setHunters] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Battle Royale: the host picks the hunters. Sardines: the host picks the one hider.
  const sardines = game.mode === 'sardines'
  const auto = sardines ? 1 : game.settings.hunters || (players.length >= 8 ? 2 : 1)
  const allTicked = ticked.every(Boolean)
  const pickValid = sardines ? hunters.length === 1 : hunters.length >= 1 && hunters.length <= players.length - 1
  const special = sardines ? 'Hider' : 'Hunter'
  const regular = sardines ? 'Seeker' : 'Hider'
  const tone = sardines ? 'mode-sar' : 'mode-br'

  function toggle(id: string) {
    if (sardines) setHunters([id])
    else setHunters(hunters.includes(id) ? hunters.filter((h) => h !== id) : [...hunters, id])
  }

  async function start() {
    setBusy(true)
    setError('')
    try {
      await startGame(game.id, pick ? hunters : null)
      onStarted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The game could not be started.')
      setBusy(false)
    }
  }

  return (
    <Sheet title="Before you start" onClose={onClose}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Safety checklist</h2>
      <div className="flex flex-col gap-2">
        {checks.map((text, i) => (
          <label key={text} className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={ticked[i]}
              onChange={() => setTicked(ticked.map((t, j) => (j === i ? !t : t)))}
              className="h-5 w-5 accent-[var(--c-brand-ink)]"
            />
            {text}
          </label>
        ))}
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{sardines ? 'Hider' : 'Hunters'}</h2>
      <div className="flex gap-2" role="radiogroup" aria-label={sardines ? 'How the hider is chosen' : 'How hunters are chosen'}>
        {[
          { on: !pick, label: `Random (${Math.min(auto, players.length - 1)})`, set: () => setPick(false) },
          { on: pick, label: 'I choose', set: () => setPick(true) },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={o.on}
            onClick={o.set}
            className={`h-[42px] flex-1 rounded-xl font-display text-sm font-medium ${
              o.on ? 'bg-brand text-on-brand' : 'bg-raised text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {pick && (
        <ul className="flex flex-col gap-2">
          {players.map((p) => {
            const on = hunters.includes(p.id)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border-2 bg-surface px-3 py-2 text-left ${
                    on ? (tone === 'mode-sar' ? 'border-mode-sar' : 'border-mode-br') : 'border-transparent'
                  }`}
                >
                  <Avatar name={p.nickname} photo={p.photo} size={34} />
                  <span className="font-display font-medium">{p.nickname}</span>
                  <span
                    className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${
                      on ? (tone === 'mode-sar' ? 'bg-mode-sar' : 'bg-mode-br') + ' text-on-brand' : 'bg-raised text-muted'
                    }`}
                  >
                    {on ? special : regular}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {error && (
          <div role="alert" className="rounded-xl bg-danger/15 p-3 text-sm font-semibold text-danger-ink">
            {error}
          </div>
        )}
        {pick && !pickValid && (
          <Note>{sardines ? 'Pick the player who hides.' : 'Pick at least one hunter and leave at least one hider.'}</Note>
        )}
        <Button onClick={start} disabled={busy || !allTicked || (pick && !pickValid)}>
          {busy ? 'Starting…' : 'Start game'}
        </Button>
      </div>
    </Sheet>
  )
}
