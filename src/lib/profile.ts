import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from './supabase'
import { dataUrlToBlob } from './image'

export type Friend = { id: string; nickname: string; photo: string | null; gamesTogether: number }

export type Stats = { games: number; wins: number; catches: number; bestSurvivalSec: number }

export type Profile = {
  id: string
  nickname: string
  /** A data URL when stored on the phone only, or a web address once uploaded. */
  photo: string | null
  stats: Stats
  friends: Friend[]
  /** Where the profile lives: on this phone only, or also in the backend. */
  storedIn: 'phone' | 'backend'
}

type ProfileState = {
  profile: Profile | null
  createProfile: (nickname: string, photoDataUrl: string | null) => Promise<void>
  updateProfile: (nickname: string, photoDataUrl: string | null) => Promise<void>
  resetProfile: () => Promise<void>
  /** Make sure this phone is signed in to the backend. Online play needs it. */
  ensureBackend: () => Promise<boolean>
}

const emptyStats: Stats = { games: 0, wins: 0, catches: 0, bestSurvivalSec: 0 }

/** Upload the photo and return its public address, or keep the local copy if that fails. */
async function uploadPhoto(id: string, photoDataUrl: string | null): Promise<string | null> {
  if (!supabase || !photoDataUrl || !photoDataUrl.startsWith('data:')) return photoDataUrl
  const blob = await dataUrlToBlob(photoDataUrl)
  const path = `${id}.jpg`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) return photoDataUrl
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

async function saveToBackend(id: string, nickname: string, photo: string | null) {
  if (!supabase) return false
  const photoUrl = photo && !photo.startsWith('data:') ? photo : null
  const { error } = await supabase
    .from('players')
    .upsert({ id, nickname, photo_url: photoUrl }, { onConflict: 'id' })
  return !error
}

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,

      createProfile: async (nickname, photoDataUrl) => {
        let id: string = crypto.randomUUID()
        let photo = photoDataUrl
        let storedIn: Profile['storedIn'] = 'phone'

        if (supabase) {
          // Anonymous sign-in: the backend hands this phone a hidden ID. No email, no password.
          const { data, error } = await supabase.auth.signInAnonymously()
          if (!error && data.user) {
            id = data.user.id
            photo = await uploadPhoto(id, photoDataUrl)
            if (await saveToBackend(id, nickname, photo)) storedIn = 'backend'
          }
        }

        set({ profile: { id, nickname, photo, stats: emptyStats, friends: [], storedIn } })
      },

      updateProfile: async (nickname, photoDataUrl) => {
        const current = get().profile
        if (!current) return
        let photo = photoDataUrl
        let storedIn = current.storedIn
        if (supabase && current.storedIn === 'backend') {
          photo = await uploadPhoto(current.id, photoDataUrl)
          if (!(await saveToBackend(current.id, nickname, photo))) storedIn = 'phone'
        }
        set({ profile: { ...current, nickname, photo, storedIn } })
      },

      ensureBackend: async () => {
        const current = get().profile
        if (!supabase || !current) return false

        const { data: sessionData } = await supabase.auth.getSession()
        let userId = sessionData.session?.user.id
        if (userId && userId === current.id && current.storedIn === 'backend') return true

        // No session yet (for example the profile was made before sign-in was available):
        // sign in now and move the profile to the hidden ID the backend hands out.
        if (!userId) {
          const { data, error } = await supabase.auth.signInAnonymously()
          if (error || !data.user) return false
          userId = data.user.id
        }
        const photo = await uploadPhoto(userId, current.photo)
        if (!(await saveToBackend(userId, current.nickname, photo))) return false
        set({ profile: { ...current, id: userId, photo, storedIn: 'backend' } })
        return true
      },

      resetProfile: async () => {
        if (supabase) await supabase.auth.signOut()
        set({ profile: null })
      },
    }),
    { name: 'chase-profile' },
  ),
)
