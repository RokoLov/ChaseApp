import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Friend, useProfile } from '../lib/profile'
import { Sheet } from './GameSheets'
import { Avatar, Button } from './ui'

/** A friend's card: start a new game and send them the link, or remove them. */
export function FriendSheet({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const navigate = useNavigate()
  const removeFriend = useProfile((s) => s.removeFriend)
  const [confirm, setConfirm] = useState(false)

  return (
    <Sheet title="Friend" onClose={onClose}>
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <Avatar name={friend.nickname} photo={friend.photo} size={88} ring="brand" />
        <span className="font-display text-[26px] font-bold leading-tight">{friend.nickname}</span>
        <span className="text-sm text-muted">
          {friend.gamesTogether} {friend.gamesTogether === 1 ? 'game' : 'games'} together
        </span>
      </div>
      <p className="text-sm text-muted">
        Set up a new game, then send {friend.nickname} the invite link through your phone’s share menu.
      </p>
      <div className="mt-auto flex flex-col gap-3">
        <Button onClick={() => navigate('/create', { state: { invite: friend.nickname } })}>Invite to a new game</Button>
        {confirm ? (
          <Button
            kind="danger"
            onClick={() => {
              void removeFriend(friend.id)
              onClose()
            }}
          >
            Yes, remove {friend.nickname}
          </Button>
        ) : (
          <Button kind="secondary" onClick={() => setConfirm(true)}>
            Remove friend
          </Button>
        )}
      </div>
    </Sheet>
  )
}
