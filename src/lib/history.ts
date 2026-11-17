import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LastGame = { gameId: string; round: number; endedAt: string; title: string }

type HistoryState = {
  /** The last finished game on this phone, so Home can link back to its results and replay. */
  lastGame: LastGame | null
  setLastGame: (game: LastGame) => void
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      lastGame: null,
      setLastGame: (lastGame) => set({ lastGame }),
    }),
    { name: 'chase-history' },
  ),
)

/** Routes are kept for 24 hours after a game ends. */
export const REPLAY_KEEP_MS = 24 * 60 * 60 * 1000
