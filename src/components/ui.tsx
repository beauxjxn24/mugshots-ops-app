import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/5 bg-white/60 px-4 py-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink text-balance">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted text-pretty">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-black/5 bg-white shadow-[0_10px_30px_-18px_rgba(23,32,55,0.18)] ${className}`}
    >
      {children}
    </div>
  )
}

export function Stat({
  value,
  label,
  sub,
  tone = 'default',
}: {
  value: ReactNode
  label: string
  sub?: string
  tone?: 'default' | 'up' | 'down'
}) {
  const toneCls =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-brand'
  return (
    <Card className="p-4">
      <div className={`font-display text-3xl font-semibold ${toneCls}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  )
}
