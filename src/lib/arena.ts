import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Area } from './geo'

type ArenaState = {
  /** The play area of the last game this phone created, kept for "Play here again". */
  lastArea: Area | null
  setLastArea: (area: Area) => void
}

export const useArena = create<ArenaState>()(
  persist(
    (set) => ({
      lastArea: null,
      setLastArea: (lastArea) => set({ lastArea }),
    }),
    { name: 'chase-arena' },
  ),
)
