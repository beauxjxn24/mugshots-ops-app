import { useMemo } from 'react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'

interface Night {
  id: string
  date: string
  netSales: number
  deposit: number
  covers: number
  notes: string
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Forecast — projects the next 7 days from your own sales history.
 * Each day = the average of your last few same-weekdays (so Fridays predict
 * Fridays), scaled by an adjustment you control, with per-day overrides.
 * Connecting Toast later just deepens the history it learns from.
 */
export function Forecast() {
  const [log] = usePersistentState<Night[]>('nightly:log', [])
  const [adj, setAdj] = usePersistentState<number>('forecast:adj', 0)
  const [overrides, setOverrides] = usePersistentState<Record<string, number>>('forecast:overrides', {})

  // Average of the most recent 4 entries per weekday.
  const dowAvg = useMemo(() => {
    const byDow: Record<number, Night[]> = {}
    for (const n of log) {
      if (!(n.netSales > 0)) continue
      const d = new Date(n.date + 'T12:00:00')
      ;(byDow[d.getDay()] ??= []).push(n)
    }
    const avg: Record<number, number> = {}
    for (const [k, arr] of Object.entries(byDow)) {
      const recent = arr.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
      avg[+k] = recent.reduce((s, n) => s + n.netSales, 0) / recent.length
    }
    return avg
  }, [log])

  const days = useMemo(() => {
    const start = new Date(today() + 'T12:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const date = iso(d)
      const base = dowAvg[d.getDay()] ?? 0
      const projected = Math.round(base * (1 + adj / 100))
      return { date, dow: d.getDay(), base, projected, value: overrides[date] ?? projected }
    })
  }, [dowAvg, adj, overrides])

  const weekTotal = days.reduce((s, d) => s + d.value, 0)
  const max = Math.max(...days.map((d) => d.value), 1)
  const hasHistory = Object.keys(dowAvg).length > 0

  return (
    <>
      <PageHeader
        title="Forecast"
        subtitle={hasHistory ? `Next 7 days · ${money(weekTotal)} projected` : 'Projects sales from your history'}
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        {!hasHistory ? (
          <Card className="p-8 text-center">
            <p className="mx-auto max-w-md text-sm text-muted text-pretty">
              No sales history yet. Log a few nights in <b>Nightly Numbers</b> (or drop a Toast
              sales summary on <b>Imports</b>) and this screen starts predicting each day of the
              week from your own numbers.
            </p>
          </Card>
        ) : (
          <>
            {/* Adjustment */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">Outlook</div>
                  <div className="text-sm text-ink/80">
                    Slide for events, weather, season — every day scales with it.
                  </div>
                </div>
                <div className={`font-display text-2xl font-semibold ${adj >= 0 ? 'text-up' : 'text-down'}`}>
                  {adj > 0 ? '+' : ''}
                  {adj}%
                </div>
              </div>
              <input
                type="range"
                min={-25}
                max={25}
                step={1}
                value={adj}
                onChange={(e) => setAdj(parseInt(e.target.value))}
                className="mt-3 w-full accent-[--color-brand]"
              />
            </Card>

            {/* Day-by-day */}
            <Card className="overflow-hidden">
              {days.map((d) => {
                const overridden = overrides[d.date] != null
                return (
                  <div key={d.date} className="flex items-center gap-3 border-b border-black/5 px-4 py-3 last:border-0">
                    <div className="w-24 shrink-0">
                      <div className="text-sm font-semibold text-ink">{DOW[d.dow].slice(0, 3)}</div>
                      <div className="text-[10px] text-muted">{d.date.slice(5).replace('-', '/')}</div>
                    </div>
                    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${(d.value / max) * 100}%` }}
                      />
                    </div>
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={d.value || ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setOverrides((o) => {
                            const next = { ...o }
                            if (!Number.isFinite(v) || v === d.projected) delete next[d.date]
                            else next[d.date] = v
                            return next
                          })
                        }}
                        className={`w-full rounded-lg border bg-white py-1.5 pl-6 pr-2 text-right text-sm font-semibold outline-none focus:border-brand ${
                          overridden ? 'border-brand/50 text-brand' : 'border-black/10 text-ink'
                        }`}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between bg-black/[0.02] px-4 py-3">
                <span className="text-sm font-semibold text-muted">Projected week</span>
                <span className="font-display text-xl font-semibold text-ink">{money(weekTotal)}</span>
              </div>
            </Card>

            <p className="text-center text-xs text-muted text-pretty">
              Each day averages your last 4 of that weekday. Type in a box to override a day
              (shown in gold); clearing it goes back to the projection.
            </p>
          </>
        )}
      </div>
    </>
  )
}
