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

/**
 * Sardines uses the same rule fields: zoneStages is how many times the hint circle
 * shrinks, and there is always exactly one hider. The other fields are not used.
 */
export const sardinesPresets: Record<'quick' | 'classic', BattleRoyaleRules> = {
  quick: { gameMin: 15, hideMin: 3, hunters: 1, zoneStages: 3, revealOnShrink: false, graceSec: 60 },
  classic: { gameMin: 25, hideMin: 4, hunters: 1, zoneStages: 4, revealOnShrink: false, graceSec: 60 },
}

export const presetsFor = (mode: Mode) => (mode === 'sardines' ? sardinesPresets : presets)

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
    built: true,
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

const sardinesRows: typeof ruleRows = [
  { key: 'gameMin', label: 'Game length', min: 10, max: 45, step: 5, format: (v) => `${v} min` },
  { key: 'hideMin', label: 'Hide time', min: 1, max: 10, step: 1, format: (v) => `${v} min` },
  { key: 'zoneStages', label: 'Hint circle shrinks', min: 2, max: 6, step: 1, format: (v) => `${v} times` },
]

export const ruleRowsFor = (mode: Mode) => (mode === 'sardines' ? sardinesRows : ruleRows)

/** One line describing the rules, for the lobby. */
export function rulesSummary(mode: Mode, preset: Preset, r: BattleRoyaleRules): string {
  if (mode === 'sardines')
    return `${presetLabel(preset)} · ${r.gameMin} min · ${r.hideMin} min to hide · hint shrinks ${r.zoneStages}×`
  return `${presetLabel(preset)} · ${r.gameMin} min · ${r.zoneStages} zone stages`
}
