import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackHeader, Button, Note, Screen, SectionLabel } from '../components/ui'
import { useProfile } from '../lib/profile'
import { backendReady } from '../lib/supabase'
import { useTheme, type Appearance } from '../lib/theme'

const options: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="ml-auto text-right font-display font-bold">{value}</span>
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { appearance, setAppearance } = useTheme()
  const profile = useProfile((s) => s.profile)
  const resetProfile = useProfile((s) => s.resetProfile)
  const [confirming, setConfirming] = useState(false)

  async function reset() {
    await resetProfile()
    navigate('/welcome', { replace: true })
  }

  return (
    <Screen>
      <BackHeader title="Settings" />

      <SectionLabel>Appearance</SectionLabel>
      <div className="flex gap-2" role="radiogroup" aria-label="Appearance">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={appearance === o.value}
            onClick={() => setAppearance(o.value)}
            className={`h-[42px] flex-1 rounded-xl font-display text-sm font-medium ${
              appearance === o.value ? 'bg-brand text-on-brand' : 'bg-raised text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">System follows your phone’s light or dark setting.</p>

      <SectionLabel>Install</SectionLabel>
      <p className="rounded-xl bg-surface p-4 text-sm text-muted">
        iPhone: tap Share in Safari, then “Add to Home Screen”. Android: open the browser menu, then
        “Install app”. The installed app runs full screen.
      </p>

      <SectionLabel>About</SectionLabel>
      <div className="flex flex-col gap-2">
        <Row
          label="Profile storage"
          value={profile?.storedIn === 'backend' ? 'Phone and backend' : 'This phone only'}
        />
        <Row label="Backend" value={backendReady ? 'Connected' : 'Not set up yet'} />
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {confirming ? (
          <>
            <Note>This removes your nickname, photo, stats and friends from this phone.</Note>
            <Button kind="danger" onClick={reset}>
              Yes, reset my profile
            </Button>
            <Button kind="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button kind="danger" onClick={() => setConfirming(true)}>
            Reset profile
          </Button>
        )}
        <Note>CHASE version 0.4 · milestone 4</Note>
      </div>
    </Screen>
  )
}
