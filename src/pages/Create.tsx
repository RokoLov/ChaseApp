import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackHeader, Button, Note, Screen } from '../components/ui'
import { createGame } from '../lib/games'
import { modes, presets, ruleRows, type BattleRoyaleRules, type Mode, type Preset } from '../lib/rules'

const modeBg: Record<Mode, string> = {
  battle_royale: 'bg-mode-br',
  sardines: 'bg-mode-sar',
  cops_robbers: 'bg-mode-cnr',
}
const modeBorder: Record<Mode, string> = {
  battle_royale: 'border-mode-br',
  sardines: 'border-mode-sar',
  cops_robbers: 'border-mode-cnr',
}

export default function Create() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [mode, setMode] = useState<Mode>('battle_royale')
  const [preset, setPreset] = useState<Preset>('classic')
  const [rules, setRules] = useState<BattleRoyaleRules>(presets.classic)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function choosePreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') setRules(presets[p])
  }

  function change(key: keyof BattleRoyaleRules, delta: number, min: number, max: number) {
    const next = Math.min(max, Math.max(min, (rules[key] as number) + delta))
    setRules({ ...rules, [key]: next })
  }

  async function create() {
    setBusy(true)
    setError('')
    try {
      const code = await createGame(mode, preset, rules)
      navigate(`/lobby/${code}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The game could not be created.')
      setBusy(false)
    }
  }

  if (step === 1) {
    return (
      <Screen>
        <BackHeader title="Choose a mode" />
        <p className="-mt-3 pl-10 text-[13px] font-medium text-muted">Step 1 of 2</p>
        {modes.map((m) => {
          const selected = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              disabled={!m.built}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-3.5 rounded-[20px] border-2 bg-surface p-4 text-left disabled:opacity-50 ${
                selected ? modeBorder[m.id] : 'border-transparent'
              }`}
            >
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] font-display text-lg font-bold text-on-brand ${modeBg[m.id]}`}
              >
                {m.short}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-display text-lg font-bold">{m.name}</span>
                <span className="text-[13px] text-muted">{m.built ? m.rule : 'Not built yet. Coming in a later milestone.'}</span>
              </span>
            </button>
          )
        })}
        <div className="mt-auto">
          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <header className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => setStep(1)}
          className="-ml-2 flex h-11 w-9 items-center justify-center text-3xl leading-none"
        >
          ‹
        </button>
        <div>
          <h1 className="font-display text-[22px] font-bold leading-tight">Pick the rules</h1>
          <p className="text-[13px] font-medium text-muted">Step 2 of 2</p>
        </div>
      </header>

      <div className="flex gap-2" role="radiogroup" aria-label="Preset">
        {(['quick', 'classic', 'custom'] as Preset[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={preset === p}
            onClick={() => choosePreset(p)}
            className={`h-[42px] flex-1 rounded-xl font-display text-sm font-medium capitalize ${
              preset === p ? 'bg-brand text-on-brand' : 'bg-raised text-muted'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {ruleRows.map((row) => (
          <div key={row.key} className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm">
            <span className="text-muted">{row.label}</span>
            <span className="ml-auto flex items-center gap-2">
              {preset === 'custom' && (
                <button
                  type="button"
                  aria-label={`Less: ${row.label}`}
                  onClick={() => change(row.key, -row.step, row.min, row.max)}
                  className="h-8 w-8 rounded-lg bg-raised font-display text-lg font-bold"
                >
                  −
                </button>
              )}
              <span className="min-w-[4.5rem] text-center font-display font-bold">
                {row.format(rules[row.key] as number)}
              </span>
              {preset === 'custom' && (
                <button
                  type="button"
                  aria-label={`More: ${row.label}`}
                  onClick={() => change(row.key, row.step, row.min, row.max)}
                  className="h-8 w-8 rounded-lg bg-raised font-display text-lg font-bold"
                >
                  +
                </button>
              )}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm">
          <span className="text-muted">Position reveal on shrink</span>
          <button
            type="button"
            disabled={preset !== 'custom'}
            onClick={() => setRules({ ...rules, revealOnShrink: !rules.revealOnShrink })}
            className="ml-auto min-w-[4.5rem] rounded-lg py-1 text-center font-display font-bold enabled:bg-raised"
          >
            {rules.revealOnShrink ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted">
        {preset === 'custom' ? 'Use − and + to change a rule.' : 'Choose Custom to change any rule.'}
      </p>
      <div className="rounded-xl bg-warn/15 p-3 text-[13px] font-semibold text-warn-ink">
        Drawing the play area on the map arrives in milestone 3.
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {error && <Note>{error}</Note>}
        <Button onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create lobby'}
        </Button>
      </div>
    </Screen>
  )
}
