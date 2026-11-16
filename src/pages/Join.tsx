import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackHeader, Button, Note, Screen } from '../components/ui'
import { joinGame } from '../lib/games'

/** Codes never use the letters I and O or the digits 0 and 1, so they cannot be misread. */
const clean = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, '')
    .slice(0, 6)

export default function Join() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function join() {
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      const joined = await joinGame(code)
      navigate(`/lobby/${joined}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the game.')
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader title="Join game" />
      <p className="text-sm text-muted">Enter the 6-character game code</p>

      <input
        value={code}
        onChange={(e) => {
          setCode(clean(e.target.value))
          setError('')
        }}
        onKeyDown={(e) => e.key === 'Enter' && void join()}
        aria-label="Game code"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="······"
        className="h-16 w-full rounded-2xl border-[1.5px] border-line bg-surface text-center font-display text-3xl font-bold tracking-[0.35em] outline-none placeholder:text-line focus:border-brand-ink"
      />

      {error && (
        <div role="alert" className="rounded-xl bg-danger/15 p-3 text-sm font-semibold text-danger-ink">
          {error}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <Note>
          Got an invite link or a QR code? Open the link, or point your phone’s camera at the QR code,
          and you land in the lobby directly.
        </Note>
        <Button onClick={join} disabled={code.length !== 6 || busy}>
          {busy ? 'Joining…' : 'Join'}
        </Button>
      </div>
    </Screen>
  )
}
