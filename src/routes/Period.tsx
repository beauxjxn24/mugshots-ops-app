import { useMemo } from 'react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState } from '../lib/store'

interface Night {
  id: string
  date: string
  netSales: number
  deposit: number
  covers: number
  notes: string
}

interface Period {
  key: string // YYYY-MM
  nights: Night[]
  total: number
  covers: number
  best: Night
  worst: Night
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/**
 * Period Review — month-by-month rollup of your Nightly Numbers: totals,
 * per-night average, best & worst nights, and how each month trends against
 * the one before. Gets richer with every night you log or import.
 */
export function Period() {
  const [log] = usePersistentState<Night[]>('nightly:log', [])

  const periods = useMemo<Period[]>(() => {
    const byMonth = new Map<string, Night[]>()
    for (const n of log) {
      if (!(n.netSales > 0)) continue
      const k = n.date.slice(0, 7)
      const arr = byMonth.get(k) ?? []
      arr.push(n)
      byMonth.set(k, arr)
    }
    return [...byMonth.entries()]
      .map(([key, nights]) => {
        const sorted = [...nights].sort((a, b) => b.netSales - a.netSales)
        return {
          key,
          nights,
          total: nights.reduce((s, n) => s + n.netSales, 0),
          covers: nights.reduce((s, n) => s + n.covers, 0),
          best: sorted[0],
          worst: sorted[sorted.length - 1],
        }
      })
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [log])

  return (
    <>
      <PageHeader
        title="Period Review"
        subtitle={periods.length ? `${periods.length} period${periods.length === 1 ? '' : 's'} on record` : 'Month-over-month performance'}
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        {periods.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="mx-auto max-w-md text-sm text-muted text-pretty">
              Nothing to review yet. As you log nights in <b>Nightly Numbers</b> (or drop sales
              summaries on <b>Imports</b>), each month rolls up here with totals, averages, and
              your best and worst nights.
            </p>
          </Card>
        ) : (
          periods.map((p, i) => {
            const prev = periods[i + 1]
            const prevAvg = prev ? prev.total / prev.nights.length : null
            const avg = p.total / p.nights.length
            const delta = prevAvg ? ((avg - prevAvg) / prevAvg) * 100 : null
            return (
              <Card key={p.key} className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-3">
                  <span className="font-display text-lg font-semibold text-ink">{fmtMonth(p.key)}</span>
                  <span className="font-display text-xl font-semibold text-brand">{money(p.total)}</span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-black/5 sm:grid-cols-4">
                  <Stat label="Avg / night" value={money(avg)} sub={delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs prior` : `${p.nights.length} nights logged`} up={delta == null ? undefined : delta >= 0} />
                  <Stat label="Nights logged" value={`${p.nights.length}`} sub={p.covers > 0 ? `${p.covers.toLocaleString()} covers` : ' '} />
                  <Stat label="Best night" value={money(p.best.netSales)} sub={fmtDay(p.best.date)} up />
                  <Stat label="Slowest night" value={money(p.worst.netSales)} sub={fmtDay(p.worst.date)} up={false} />
                </div>
                <WeekCards nights={p.nights} monthKey={p.key} />
              </Card>
            )
          })
        )}
        {periods.length > 0 && (
          <p className="text-center text-xs text-muted text-pretty">
            Averages compare against the previous period. Connect Toast later and this fills
            itself in — no manual entry.
          </p>
        )}
      </div>
    </>
  )
}

/** Week-by-week strip inside a month (handoff spec's week cards). */
function WeekCards({ nights, monthKey }: { nights: Night[]; monthKey: string }) {
  const weeks = new Map<number, Night[]>()
  for (const n of nights) {
    const day = parseInt(n.date.slice(8), 10)
    const w = Math.floor((day - 1) / 7) + 1 // wk 1 = 1st–7th, etc.
    const arr = weeks.get(w) ?? []
    arr.push(n)
    weeks.set(w, arr)
  }
  const keys = [...weeks.keys()].sort((a, b) => a - b)
  if (keys.length < 2) return null
  const inProgress = monthKey === new Date().toISOString().slice(0, 7)
  return (
    <div className="flex gap-px overflow-x-auto bg-black/5">
      {keys.map((w) => {
        const arr = weeks.get(w)!
        const total = arr.reduce((s, n) => s + n.netSales, 0)
        return (
          <div key={w} className="min-w-24 flex-1 bg-white p-2.5 text-center">
            <div className="text-[9px] font-extrabold uppercase tracking-wide text-muted">Wk {w}</div>
            <div className="font-display text-sm font-semibold text-ink">{money(total)}</div>
            <div className="text-[10px] text-muted">{arr.length} night{arr.length === 1 ? '' : 's'}</div>
          </div>
        )
      })}
      {inProgress && (
        <div className="flex min-w-24 flex-1 items-center justify-center bg-white p-2.5 text-center text-[10px] text-muted">
          month in progress
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, up }: { label: string; value: string; sub?: string; up?: boolean }) {
  return (
    <div className="bg-white p-3">
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</div>
      <div className="font-display text-lg font-semibold text-ink">{value}</div>
      {sub && (
        <div className={`text-[11px] ${up == null ? 'text-muted' : up ? 'text-up' : 'text-down'}`}>{sub}</div>
      )}
    </div>
  )
}

function fmtMonth(k: string): string {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
