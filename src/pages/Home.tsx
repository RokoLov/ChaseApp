import { Link, useNavigate } from 'react-router-dom'
import { MapView } from '../components/Map'
import { Avatar, LinkButton, Screen, SectionLabel } from '../components/ui'
import { useArena } from '../lib/arena'
import { extentM, formatM } from '../lib/geo'
import { useProfile } from '../lib/profile'

export default function Home() {
  const profile = useProfile((s) => s.profile)
  const lastArea = useArena((s) => s.lastArea)
  const navigate = useNavigate()
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
      {lastArea ? (
        <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-3">
          <MapView
            className="h-32 w-full overflow-hidden rounded-2xl bg-raised"
            area={lastArea}
            fitArea
            interactive={false}
          />
          <div className="flex items-center px-1">
            <span className="font-display font-medium">{formatM(extentM(lastArea))} across</span>
            <button
              type="button"
              onClick={() => navigate('/create', { state: { area: lastArea } })}
              className="ml-auto rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand"
            >
              Play here again
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          The last play area you used will appear here.
        </p>
      )}
    </Screen>
  )
}
