import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PhotoPicker } from '../components/PhotoPicker'
import { Avatar, BackHeader, Button, Note, Screen, SectionLabel, Tile } from '../components/ui'
import { useProfile } from '../lib/profile'

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Profile() {
  const profile = useProfile((s) => s.profile)
  const updateProfile = useProfile((s) => s.updateProfile)
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [photo, setPhoto] = useState<string | null>(profile?.photo ?? null)
  const [busy, setBusy] = useState(false)

  if (!profile) return null
  const { stats, friends } = profile
  const valid = nickname.trim().length >= 2

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    await updateProfile(nickname.trim(), photo)
    setBusy(false)
    setEditing(false)
  }

  return (
    <Screen>
      <BackHeader
        title="Profile"
        right={
          <Link to="/settings" className="text-sm font-semibold text-brand-ink">
            Settings
          </Link>
        }
      />

      {editing ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <PhotoPicker name={nickname} photo={photo} onChange={setPhoto} />
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            aria-label="Nickname"
            className="h-12 w-full rounded-xl border-[1.5px] border-line bg-bg px-4 text-center font-display text-lg font-medium outline-none focus:border-brand-ink"
          />
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Avatar name={profile.nickname} photo={profile.photo} size={80} ring="brand" />
          <div className="flex flex-col items-start gap-1.5">
            <span className="font-display text-[26px] font-bold leading-tight">{profile.nickname}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full bg-raised px-3 py-1.5 text-xs font-semibold text-muted"
            >
              Edit photo and name
            </button>
          </div>
        </div>
      )}

      <SectionLabel>Stats</SectionLabel>
      <div className="flex gap-2.5">
        <Tile label="Games" value={String(stats.games)} />
        <Tile label="Wins" value={String(stats.wins)} />
      </div>
      <div className="flex gap-2.5">
        <Tile label="Catches" value={String(stats.catches)} />
        <Tile label="Best survival" value={stats.bestSurvivalSec ? formatTime(stats.bestSurvivalSec) : '–'} />
      </div>

      <SectionLabel>Friends</SectionLabel>
      {friends.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          No friends yet. Add them from the results screen after a game.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {friends.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5">
              <Avatar name={f.nickname} photo={f.photo} size={38} />
              <div className="flex flex-col">
                <span className="font-display font-medium">{f.nickname}</span>
                <span className="text-xs text-muted">{f.gamesTogether} games together</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto">
        <Note>Saved on this phone. Clearing browser data resets it.</Note>
      </div>
    </Screen>
  )
}
