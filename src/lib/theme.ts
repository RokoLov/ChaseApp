import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Appearance = 'system' | 'light' | 'dark'

type ThemeState = {
  appearance: Appearance
  setAppearance: (a: Appearance) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      appearance: 'system',
      setAppearance: (appearance) => set({ appearance }),
    }),
    { name: 'chase-appearance' },
  ),
)

const lightQuery = () => window.matchMedia('(prefers-color-scheme: light)')

/** Turn "system" into the phone's actual setting. */
export function resolveTheme(a: Appearance): 'light' | 'dark' {
  if (a === 'system') return lightQuery().matches ? 'light' : 'dark'
  return a
}

function apply(a: Appearance) {
  const resolved = resolveTheme(a)
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#F4F6F8' : '#0B0F14')
}

/** Call once at startup: applies the saved choice and follows later changes. */
export function initTheme() {
  apply(useTheme.getState().appearance)
  useTheme.subscribe((s) => apply(s.appearance))
  lightQuery().addEventListener('change', () => apply(useTheme.getState().appearance))
}
