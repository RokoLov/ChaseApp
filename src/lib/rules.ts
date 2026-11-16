export type Mode = 'battle_royale' | 'sardines' | 'cops_robbers'
export type Preset = 'quick' | 'classic' | 'custom'

/** Battle Royale rules. Times are in minutes unless the name says seconds. */
export type BattleRoyaleRules = {
  gameMin: number
  hideMin: number
  /** 0 means "decide from the player count": 1 hunter for up to 7 players, 2 for 8 to 10. */
  hunters: number
  zoneStages: number
  revealOnShrink: boolean
  graceSec: number
}

export const presets: Record<'quick' | 'classic', BattleRoyaleRules> = {
  quick: { gameMin: 15, hideMin: 2, hunters: 0, zoneStages: 3, revealOnShrink: true, graceSec: 60 },
  classic: { gameMin: 25, hideMin: 3, hunters: 0, zoneStages: 4, revealOnShrink: true, graceSec: 60 },
}

export const modes: { id: Mode; name: string; short: string; rule: string; color: string; built: boolean }[] = [
  {
    id: 'battle_royale',
    name: 'Battle Royale',
    short: 'BR',
    rule: 'Hunters chase hiders while the safe zone shrinks.',
    color: 'mode-br',
    built: true,
  },
  {
    id: 'sardines',
    name: 'Sardines',
    short: 'S',
    rule: 'One player hides. Everyone who finds them joins the spot.',
    color: 'mode-sar',
    built: false,
  },
  {
    id: 'cops_robbers',
    name: 'Cops & Robbers',
    short: 'CR',
    rule: 'Cops arrest robbers. Robbers can free their team from jail.',
    color: 'mode-cnr',
    built: false,
  },
]

export const modeName = (m: Mode) => modes.find((x) => x.id === m)?.name ?? m

/** The rows shown in the rules list, with limits for the Custom steppers. */
export const ruleRows: {
  key: keyof BattleRoyaleRules
  label: string
  min: number
  max: number
  step: number
  format: (v: number) => string
}[] = [
  { key: 'gameMin', label: 'Game length', min: 10, max: 45, step: 5, format: (v) => `${v} min` },
  { key: 'hideMin', label: 'Hide time', min: 1, max: 10, step: 1, format: (v) => `${v} min` },
  { key: 'hunters', label: 'Starting hunters', min: 0, max: 3, step: 1, format: (v) => (v === 0 ? 'By player count' : String(v)) },
  { key: 'zoneStages', label: 'Zone stages', min: 2, max: 6, step: 1, format: (v) => String(v) },
  { key: 'graceSec', label: 'Out-of-zone warning', min: 30, max: 120, step: 15, format: (v) => `${v} s` },
]

export const presetLabel = (p: Preset) => p[0].toUpperCase() + p.slice(1)
