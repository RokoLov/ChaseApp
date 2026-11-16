import { Link } from 'react-router-dom'
import { Avatar, LinkButton, Screen, SectionLabel } from '../components/ui'
import { useProfile } from '../lib/profile'

export default function Home() {
  const profile = useProfile((s) => s.profile)
  if (!profile) return null

  return (
    <Screen>
      <header className="flex items-center">
        <span className="font-display text-3xl font-bold text-brand-ink">CHASE</span>
        <Link to="/profile" aria-label="Profile" className="ml-auto">
          <Avatar name={profile.nickname} photo={profile.photo} ring="brand" />
        </Link>
      </header>

      <p className="text-[15px] text-muted">Hide and seek, refereed by your phone.</p>

      <LinkButton to="/create">Create game</LinkButton>
      <LinkButton to="/join" kind="secondary">
        Join game
      </LinkButton>

      <SectionLabel>Friends</SectionLabel>
      {profile.friends.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          People you add after a game will appear here.
        </p>
      ) : (
        <div className="flex gap-4 overflow-x-auto">
          {profile.friends.map((f) => (
            <div key={f.id} className="flex flex-col items-center gap-1.5">
              <Avatar name={f.nickname} photo={f.photo} size={54} />
              <span className="text-xs font-medium text-muted">{f.nickname}</span>
            </div>
          ))}
        </div>
      )}

      <SectionLabel>Last arena</SectionLabel>
      <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
        The last play area you used will appear here.
      </p>
    </Screen>
  )
}
