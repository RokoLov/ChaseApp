import { useState } from 'react'
import { PhotoPicker } from '../components/PhotoPicker'
import { Button, Note, Screen } from '../components/ui'
import { useProfile } from '../lib/profile'

const cards = [
  { title: 'The real world is the game', text: 'You run, hide and search outdoors with your friends.' },
  { title: 'Your phone is the referee', text: 'It keeps the time, the boundaries and who has been caught.' },
  { title: 'Pocket mode keeps you playing', text: 'Lock the screen with one tap and listen for the alerts.' },
]

export default function Welcome() {
  const createProfile = useProfile((s) => s.createProfile)
  const [nickname, setNickname] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [card, setCard] = useState(0)
  const [busy, setBusy] = useState(false)

  const valid = nickname.trim().length >= 2

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    // The app then moves on by itself: to Home, or to the invite link that was opened.
    await createProfile(nickname.trim(), photo)
  }

  return (
    <Screen center>
      <div className="mt-4 flex flex-col items-center gap-1">
        <h1 className="font-display text-[40px] font-bold leading-none text-brand-ink">CHASE</h1>
        <p className="text-muted">Set up your profile</p>
      </div>

      <PhotoPicker name={nickname} photo={photo} onChange={setPhoto} />

      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={16}
        placeholder="Nickname"
        aria-label="Nickname"
        autoComplete="nickname"
        className="h-14 w-full rounded-2xl border-[1.5px] border-line bg-surface px-4 text-center font-display text-lg font-medium outline-none placeholder:text-muted focus:border-brand-ink"
      />

      <button
        type="button"
        onClick={() => setCard((card + 1) % cards.length)}
        className="flex min-h-[150px] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-surface px-6 text-center"
      >
        <span className="font-display text-lg font-bold">{cards[card].title}</span>
        <span className="text-sm text-muted">{cards[card].text}</span>
      </button>
      <div className="flex gap-1.5" aria-hidden>
        {cards.map((c, i) => (
          <span key={c.title} className={`h-2 w-2 rounded-full ${i === card ? 'bg-brand-ink' : 'bg-line'}`} />
        ))}
      </div>

      <div className="mt-auto flex w-full flex-col gap-3">
        <Note>No email or password needed</Note>
        <Button onClick={submit} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </Screen>
  )
}
