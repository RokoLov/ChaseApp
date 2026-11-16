import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/** One phone-sized page. On a wide screen it stays centred at phone width. */
export function Screen({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 bg-bg px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className={`flex flex-1 flex-col gap-4 ${center ? 'items-center' : ''}`}>{children}</div>
    </div>
  )
}

type Kind = 'primary' | 'secondary' | 'danger'

const buttonClass = (kind: Kind) =>
  [
    'flex h-14 w-full items-center justify-center rounded-2xl font-display text-[17px] font-bold',
    'transition active:scale-[0.98] disabled:opacity-40',
    kind === 'primary' ? 'bg-brand text-on-brand' : 'border-[1.5px] border-line bg-surface',
    kind === 'secondary' ? 'text-ink' : '',
    kind === 'danger' ? 'text-danger-ink' : '',
  ].join(' ')

export function Button({
  kind = 'primary',
  children,
  ...rest
}: { kind?: Kind } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={buttonClass(kind)} {...rest}>
      {children}
    </button>
  )
}

export function LinkButton({ kind = 'primary', to, children }: { kind?: Kind; to: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClass(kind)}>
      {children}
    </Link>
  )
}

export function Avatar({
  name,
  photo,
  size = 42,
  ring = 'line',
}: {
  name: string
  photo: string | null
  size?: number
  ring?: 'line' | 'brand'
}) {
  const ringClass = ring === 'brand' ? 'border-brand-ink' : 'border-line'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-raised font-display font-bold text-ink ${ringClass}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (name[0] ?? '?').toUpperCase()}
    </span>
  )
}

export function BackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Back"
        onClick={() => navigate(-1)}
        className="-ml-2 flex h-11 w-9 items-center justify-center text-3xl leading-none text-ink"
      >
        ‹
      </button>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <div className="ml-auto">{right}</div>
    </header>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>
}

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[68px] flex-1 flex-col items-center justify-center rounded-2xl bg-surface">
      <span className="font-display text-2xl font-bold">{value}</span>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-center text-xs text-muted">{children}</p>
}
