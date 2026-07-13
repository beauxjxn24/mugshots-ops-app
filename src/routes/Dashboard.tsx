import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { AreaChart, type Point } from '../components/AreaChart'
import { useCurrentNames } from '../lib/scope'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import type { Booking } from '../lib/catering'
import type { Night } from '../lib/nightly'
import type { PmixDays } from '../lib/pmix'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { PartyPopper, CalendarClock, Banknote, PieChart, Bell, Plus, Moon, X } from 'lucide-react'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
type Scope = 'day' | 'week' | 'period'

export function Dashboard() {
  const { concept, location } = useCurrentNames()
  const [bookings] = usePersistentState<Booking[]>('catering:bookings', [])
  const [nights] = usePersistentState<Night[]>('nightly:log', [])
  const [targets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  const [scope, setScope] = useState<Scope>('day')

  const t = today()
  const upcoming = bookings
    .filter((b) => !b.completedAt && b.date >= t)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const todays = upcoming.filter((b) => b.date === t)
  const next = upcoming[0]

  const sorted = useMemo(() => [...nights].sort((a, b) => a.date.localeCompare(b.date)), [nights])
  const latest = sorted[sorted.length - 1]
  const hasReal = !!latest

  // ---- Day / Week / Period windows (latest night anchors "day") ----
  const win = useMemo(() => {
    if (!latest) return { nights: [] as Night[], prior: [] as Night[], label: '' }
    if (scope === 'day') {
      const prior = sorted[sorted.length - 2]
      return { nights: [latest], prior: prior ? [prior] : [], label: fmtWhen(latest.date) }
    }
    if (scope === 'week') {
      return {
        nights: sorted.slice(-7),
        prior: sorted.slice(-14, -7),
        label: `last ${Math.min(7, sorted.length)} nights`,
      }
    }
    const month = latest.date.slice(0, 7)
    const prevMonth = prevMonthKey(month)
    return {
      nights: sorted.filter((n) => n.date.startsWith(month)),
      prior: sorted.filter((n) => n.date.startsWith(prevMonth)),
      label: fmtMonth(month),
    }
  }, [sorted, latest, scope])

  const net = win.nights.reduce((s, n) => s + n.netSales, 0)
  const priorNet = win.prior.reduce((s, n) => s + n.netSales, 0)
  const vsPrior = priorNet > 0 ? ((net - priorNet) / priorNet) * 100 : null
  const laborSum = win.nights.reduce((s, n) => s + (n.labor ?? 0), 0)
  const laborPct = laborSum > 0 && net > 0 ? (laborSum / net) * 100 : null

  // ---- Sales by category across the scope ----
  const cats = useMemo(() => {
    const sum = (k: 'food' | 'beer' | 'liquor' | 'wine' | 'na') =>
      win.nights.reduce((s, n) => s + (n[k] ?? 0), 0)
    const parts = [
      { l: 'Food', v: sum('food'), c: '#E4B84C' },
      { l: 'Beer', v: sum('beer'), c: '#F0A94C' },
      { l: 'Liquor', v: sum('liquor'), c: '#F472B6' },
      { l: 'Wine', v: sum('wine'), c: '#A78BFA' },
      { l: 'N/A bev', v: sum('na'), c: '#60A5FA' },
    ].filter((p) => p.v > 0)
    const total = parts.reduce((s, p) => s + p.v, 0)
    return { parts, total }
  }, [win.nights])

  const weekData: Point[] = sorted
    .slice(-7)
    .map((n) => ({ label: weekday(n.date), value: +(n.netSales / 1000).toFixed(1) }))
  const wtd = sorted.slice(-7).reduce((s, n) => s + n.netSales, 0)

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${concept} · ${location} · ${todayLong()}`} />
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Catering alerts */}
        {(todays.length > 0 || (next && daysUntil(next.date) <= 7)) && (
          <Link
            to="/catering"
            className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4 transition-colors hover:bg-brand/10"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
              <Bell size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">
                {todays.length > 0
                  ? `${todays.length} catering${todays.length === 1 ? '' : 's'} today`
                  : `Upcoming catering — ${fmtWhen(next!.date)}`}
              </div>
              <div className="truncate text-xs text-muted">
                {(todays[0] ?? next)?.event}
                {(todays[0] ?? next)?.guests ? ` · ${(todays[0] ?? next)!.guests} guests` : ''}
                {(todays[0] ?? next)?.time ? ` · ${fmtTime((todays[0] ?? next)!.time)}` : ''}
              </div>
            </div>
            <span className="text-sm font-semibold text-brand">View →</span>
          </Link>
        )}

        {hasReal ? (
          <>
            {/* Hero + scope toggle */}
            <Card className="relative overflow-hidden p-5 sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand/10 blur-2xl" />
              <div className="relative mb-3 flex">
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1">
                  {(['day', 'week', 'period'] as Scope[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setScope(s)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold capitalize ${
                        scope === s ? 'bg-navy text-white shadow-sm' : 'text-muted'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <span className="font-display text-[clamp(2.5rem,8vw,3.5rem)] font-semibold leading-none text-ink">
                  {money(net)}
                </span>
                <span className="text-sm text-muted">net · {win.label}</span>
                {vsPrior != null && (
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${vsPrior >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                    {vsPrior >= 0 ? '▲' : '▼'} {Math.abs(vsPrior).toFixed(1)}% vs prior
                  </span>
                )}
                {laborPct != null && (
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${laborPct <= targets.laborPct ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                    labor {laborPct.toFixed(1)}% · goal ≤ {targets.laborPct}%
                  </span>
                )}
              </div>
            </Card>

            {/* Weekly trend + ▲▼ day strip */}
            <Card className="p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">
                  Recent nights · net sales
                </div>
                <div className="text-xs text-muted">
                  Last {Math.min(7, sorted.length)} nights <b className="font-mono text-ink">{money(wtd)}</b>
                </div>
              </div>
              <AreaChart data={weekData} height={200} format={(n) => `$${n.toFixed(1)}k`} />
              <div className="mt-2 grid grid-cols-7 gap-1">
                {sorted.slice(-7).map((n, i, arr) => {
                  const prev = arr[i - 1] ?? sorted[sorted.length - 8]
                  const d = prev ? ((n.netSales - prev.netSales) / prev.netSales) * 100 : null
                  return (
                    <div key={n.date} className="text-center">
                      <div className="text-[9px] font-bold text-muted">{weekday(n.date)}</div>
                      {d != null ? (
                        <div className={`text-[10px] font-bold ${d >= 0 ? 'text-up' : 'text-down'}`}>
                          {d >= 0 ? '▲' : '▼'}{Math.abs(d).toFixed(0)}%
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted">—</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Sales by category */}
            {cats.total > 0 && (
              <Card className="p-5">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                  Sales by category · {win.label}
                </div>
                <div className="flex h-3 gap-px overflow-hidden rounded-full">
                  {cats.parts.map((p) => (
                    <div key={p.l} style={{ width: `${(p.v / cats.total) * 100}%`, background: p.c }} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {cats.parts.map((p) => (
                    <span key={p.l} className="inline-flex items-center gap-1.5 text-xs">
                      <span className="size-2.5 rounded-full" style={{ background: p.c }} />
                      <span className="font-semibold text-ink">{p.l}</span>
                      <span className="font-mono text-muted">
                        {money(p.v)} · {((p.v / cats.total) * 100).toFixed(0)}%
                      </span>
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </>
        ) : (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
              <Moon size={26} />
            </div>
            <h2 className="font-display text-xl font-semibold text-ink">No sales logged yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">
              Log a night to bring this dashboard to life — the hero number and sales trend fill in
              automatically. (Live Toast sync comes with the backend.)
            </p>
            <Link
              to="/nightly"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus size={15} /> Add tonight’s numbers
            </Link>
          </Card>
        )}

        <TrackedBand scope={scope} anchor={latest?.date ?? t} />

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile
            icon={<PartyPopper size={18} />}
            value={String(todays.length)}
            label="Caterings today"
            sub={todays.length ? todays[0].event.slice(0, 20) : 'none today'}
          />
          <KpiTile
            icon={<CalendarClock size={18} />}
            value={next ? String(next.guests || '—') : '—'}
            label="Next booking"
            sub={next ? `${fmtWhen(next.date)}${next.time ? ` · ${fmtTime(next.time)}` : ''}` : 'none scheduled'}
          />
          <KpiTile
            icon={<Banknote size={18} />}
            value={hasReal && latest.deposit > 0 ? money(latest.deposit) : '—'}
            label="Last deposit"
            sub={hasReal ? fmtWhen(latest.date) : 'from Nightly Numbers'}
          />
          <KpiTile
            icon={<PieChart size={18} />}
            value={cats.total > 0 && cats.parts[0] ? `${((cats.parts[0].v / cats.total) * 100).toFixed(0)}%` : '—'}
            label="Food mix"
            sub={cats.total > 0 ? `of ${money(cats.total)} categorized` : 'log category sales'}
          />
        </div>
      </div>
    </>
  )
}

/**
 * TRACKED band — tiles fed by per-day PMIX imports, scoped to the dashboard
 * toggle (handoff spec). Add any item you sell; honest "not in PMIX" states.
 */
function TrackedBand({ scope, anchor }: { scope: Scope; anchor: string }) {
  const [tracked, setTracked] = usePersistentState<string[]>('tracked:items', [])
  const [days] = usePersistentState<PmixDays>('pmix:days', {})
  const [adding, setAdding] = useState('')

  const keys = Object.keys(days).sort()
  const inScope = useMemo(() => {
    if (keys.length === 0) return []
    if (scope === 'day') return keys.includes(anchor) ? [anchor] : [keys[keys.length - 1]]
    if (scope === 'week') {
      const from = shiftDays(anchor, -6)
      const win = keys.filter((k) => k >= from && k <= anchor)
      return win.length ? win : [keys[keys.length - 1]]
    }
    const win = keys.filter((k) => k.startsWith(anchor.slice(0, 7)))
    return win.length ? win : [keys[keys.length - 1]]
  }, [keys, scope, anchor])

  const agg = useMemo(() => {
    const byName = new Map<string, { qty: number; sales: number }>()
    let net = 0
    for (const k of inScope) {
      for (const it of days[k]?.items ?? []) {
        net += it.sales
        const cur = byName.get(it.name.toLowerCase())
        if (cur) {
          cur.qty += it.qty
          cur.sales += it.sales
        } else byName.set(it.name.toLowerCase(), { qty: it.qty, sales: it.sales })
      }
    }
    return { byName, net }
  }, [days, inScope])

  if (tracked.length === 0 && keys.length === 0) return null

  const find = (name: string) => {
    const n = name.toLowerCase()
    for (const [k, v] of agg.byName) if (k === n || k.includes(n)) return v
    return null
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Tracked</span>
        {keys.length > 0 && (
          <span className="text-[10px] text-muted">
            {scope} · {inScope.length} day{inScope.length === 1 ? '' : 's'} of PMIX
          </span>
        )}
        <div className="ml-auto flex gap-1.5">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && adding.trim()) {
                setTracked((ts) => [...new Set([...ts, adding.trim()])])
                setAdding('')
              }
            }}
            placeholder="Track an item…"
            className="w-36 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand"
          />
        </div>
      </div>
      {tracked.length === 0 ? (
        <Card className="p-4 text-center text-xs text-muted">
          Track the items you watch (wings, burgers, a new LTO…) — tiles fill from your PMIX drops.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tracked.map((name) => {
            const hit = find(name)
            return (
              <Card key={name} className="group relative p-3">
                <button
                  onClick={async () => {
                    if (await confirmDelete(`Stop tracking ${name}?`, undefined, 'Remove'))
                      setTracked((ts) => ts.filter((x) => x !== name))
                  }}
                  aria-label={`Stop tracking ${name}`}
                  className="absolute right-2 top-2 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
                >
                  <X size={13} />
                </button>
                <div className="truncate text-xs font-semibold text-ink">{name}</div>
                {hit ? (
                  <>
                    <div className="mt-1 font-display text-xl font-semibold text-brand">{hit.qty}</div>
                    <div className="text-[10px] text-muted">
                      {money(hit.sales)}
                      {agg.net > 0 ? ` · ${((hit.sales / agg.net) * 100).toFixed(1)}% mix` : ''}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-sm text-muted">— · not in PMIX</div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function KpiTile({ icon, value, label, sub }: { icon: React.ReactNode; value: string; label: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="mb-2 grid size-9 place-items-center rounded-xl bg-brand/10 text-brand">{icon}</div>
      <div className="font-display text-2xl font-semibold text-brand">{value}</div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Card>
  )
}

function todayLong(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
}
function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const then = new Date(y, m - 1, d).getTime()
  const [ty, tm, td] = today().split('-').map(Number)
  return Math.round((then - new Date(ty, tm - 1, td).getTime()) / 86400000)
}
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function prevMonthKey(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtMonth(k: string): string {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })
}
function fmtWhen(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(tm: string): string {
  const [h, m] = tm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'p' : 'a'}`
}
