import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { useCurrentNames } from '../lib/scope'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import type { Booking } from '../lib/catering'
import { getCatMix, type Night } from '../lib/nightly'
import { sanitizePmix, type PmixDays } from '../lib/pmix'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { PartyPopper, PackageOpen, Truck, Plus, Moon, ChevronLeft, ChevronRight, Flame, Megaphone, X } from 'lucide-react'
import { dowAverages, projectDay, periodWeek, periodStart as periodStartOf } from '../lib/forecast'
import { ACTIVE_SPECS } from '../lib/specs'
import { DashDrop } from '../components/DashDrop'
import { dishPhoto } from '../lib/photos'
import { isDrink } from '../lib/categories'
import type { Spec } from '../lib/types'
import { upcomingEvents, addEvent, removeEvent, type LocalEvent } from '../lib/events'
import { ordersDueOn, deliveriesOn } from '../lib/orderDays'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
type Scope = 'day' | 'week' | 'period'

/** Count the hero dollar up to its value — a little life on every load. */
function useCountUp(target: number, ms = 750): number {
  const [v, setV] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setV(target)
      return
    }
    const from = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(from + (target - from) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms])
  return v
}

export function Dashboard() {
  const { concept, location } = useCurrentNames()
  const [rawBookings] = usePersistentState<Booking[]>('catering:bookings', [])
  const bookings = Array.isArray(rawBookings) ? rawBookings : []
  const [rawNights] = usePersistentState<Night[]>('nightly:log', [])
  const nights = Array.isArray(rawNights) ? rawNights : []
  const [targets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  const [scope, setScope] = useState<Scope>('day')

  const t = today()
  const upcoming = bookings
    .filter((b) => !b.completedAt && b.date >= t)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const todays = upcoming.filter((b) => b.date === t)
  const next = upcoming[0]
  // The catering tile reads whatever is actually next. A day with nothing on
  // it is not a blank tile — it points at the next booking, because "nothing
  // today" and "nothing coming" are very different things to a manager.
  const cater = cateringTile(todays, next)
  // The two halves of today's order day, from this store's own delivery
  // calendar: what has to go out, and what's landing on the dock.
  const dueToday = useMemo(() => ordersDueOn(t), [t])
  const arrivingToday = useMemo(() => deliveriesOn(t), [t])
  const vendorList = (rows: { vendor: string }[]) => rows.map((o) => o.vendor).join(', ').slice(0, 28)

  const sorted = useMemo(() => [...nights].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')), [nights])
  const latest = sorted[sorted.length - 1]
  const hasReal = !!latest

  // ---- Day / Week / Period windows ----
  // Day = the last night entered, with its date. Week = the REAL week the
  // latest night sits in, Monday → Sunday (never a rolling 7 that looks like
  // Wednesday-to-Wednesday). Period = the 28-day period containing it.
  const win = useMemo(() => {
    if (!latest) return { nights: [] as Night[], prior: [] as Night[], label: '' }
    if (scope === 'day') {
      const prior = sorted[sorted.length - 2]
      return { nights: [latest], prior: prior ? [prior] : [], label: fmtWhen(latest.date) }
    }
    if (scope === 'week') {
      const start = mondayOf(latest.date)
      const end = shiftDays(start, 6)
      const prevStart = shiftDays(start, -7)
      return {
        nights: sorted.filter((n) => n.date >= start && n.date <= end),
        prior: sorted.filter((n) => n.date >= prevStart && n.date < start),
        label: `week of Mon ${fmtWhen(start).replace(/^\w+, /, '')}`,
      }
    }
    const pStart = periodStartOf(latest.date)
    const pEnd = shiftDays(pStart, 27)
    const prevStart = shiftDays(pStart, -28)
    return {
      nights: sorted.filter((n) => n.date >= pStart && n.date <= pEnd),
      prior: sorted.filter((n) => n.date >= prevStart && n.date < pStart),
      label: `Period ${periodWeek(latest.date).period}`,
    }
  }, [sorted, latest, scope])

  const net = win.nights.reduce((s, n) => s + n.netSales, 0)
  // Labor % is labor ÷ net, but ONLY over nights that have BOTH — otherwise a
  // window with more labor-days than sales-days (e.g. a full period of labor
  // imported but only a few days of sales) divides a big labor sum by a small
  // net and reads absurdly high (the "labor 63%" bug).
  const laborNights = win.nights.filter((n) => (n.labor ?? 0) > 0 && n.netSales > 0)
  const laborSum = laborNights.reduce((s, n) => s + (n.labor ?? 0), 0)
  const laborNet = laborNights.reduce((s, n) => s + n.netSales, 0)
  const laborPct = laborSum > 0 && laborNet > 0 ? (laborSum / laborNet) * 100 : null
  // Coverage: how many of the window's sales-nights actually have labor too. A
  // rate computed over 3 of 7 nights is REAL for those 3 but is not the week's
  // labor — so the number always says what it covers instead of implying it's
  // the whole window. (Honest > tidy.)
  const salesNights = win.nights.filter((n) => n.netSales > 0).length
  const laborCoverage = laborNights.length
  const laborPartial = laborPct != null && salesNights > 0 && laborCoverage < salesNights

  // Hero = FORECASTED sales for the scope, anchored to TODAY (what to expect),
  // from the day-of-week averages. A day already logged uses its real net, so a
  // week/period figure is "banked so far + forecast for the rest". The pill
  // compares it to the same window last week.
  const fc = useMemo(() => {
    const avg = dowAverages(nights)
    const byDate = new Map(nights.map((n) => [n.date, n]))
    const val = (d: string) => byDate.get(d)?.netSales || projectDay(avg, d)
    const range = (start: string, len: number) => Array.from({ length: len }, (_, i) => shiftDays(start, i))
    let dates: string[], priorDates: string[], label: string
    if (scope === 'day') {
      dates = [t]; priorDates = [shiftDays(t, -7)]; label = fmtWhen(t)
    } else if (scope === 'week') {
      const s = mondayOf(t); dates = range(s, 7); priorDates = range(shiftDays(s, -7), 7)
      label = `week of Mon ${fmtWhen(s).replace(/^\w+, /, '')}`
    } else {
      const s = periodStartOf(t); dates = range(s, 28); priorDates = range(shiftDays(s, -28), 28)
      label = `Period ${periodWeek(t).period}`
    }
    const total = dates.reduce((a, d) => a + val(d), 0)
    const prior = priorDates.reduce((a, d) => a + (byDate.get(d)?.netSales ?? 0), 0)
    return { total, prior, label }
  }, [nights, scope, t])
  const displayFc = useCountUp(fc.total)
  const vsPrior = fc.prior > 0 ? ((fc.total - fc.prior) / fc.prior) * 100 : null
  const priorNet = fc.prior

  // ---- Sales by category across the scope ----
  // Real per-night categories win. When a night has none (e.g. days imported
  // from a "sales by day" file that only carried net), fall back to the Toast
  // category MIX applied to this window's net sales — flagged as an estimate.
  const catMix = getCatMix()
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
    if (total > 0) return { parts, total, estimated: false }
    // Fallback: split the window net by the imported category mix.
    if (catMix && catMix.net > 0 && net > 0) {
      const r = (v: number) => (v / catMix.net) * net
      const est = [
        { l: 'Food', v: r(catMix.food), c: '#E4B84C' },
        { l: 'Beer', v: r(catMix.beer), c: '#F0A94C' },
        { l: 'Liquor', v: r(catMix.liquor), c: '#F472B6' },
        { l: 'Wine', v: r(catMix.wine), c: '#A78BFA' },
        { l: 'N/A bev', v: r(catMix.na), c: '#60A5FA' },
      ].filter((p) => p.v > 0)
      return { parts: est, total: est.reduce((s, p) => s + p.v, 0), estimated: true }
    }
    return { parts, total, estimated: false }
  }, [win.nights, catMix, net])

  const pw = periodWeek(t)

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${concept} · ${location} · ${todayLong()} · Period ${pw.period}, Week ${pw.week}`}
      />
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        {hasReal ? (
          <>
            {/* Row 1 — catering tiles by the nav (they blink & shake when a
                catering is coming up) + ONE sales card: hero number on the
                left, the week's graph beside it */}
            <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(160px,1fr)_minmax(0,4.4fr)]">
              <div className="drift [--i:0] grid grid-cols-2 gap-4 lg:grid-cols-1 lg:grid-rows-3">
                {/* Catering — only this tile reacts to catering, and only when
                    there IS one today (an empty "0" must never shake). */}
                <KpiTile
                  compact
                  dot={cater.dot}
                  className={cater.urgent ? 'tile-nudge' : cater.soon ? 'tile-ring' : ''}
                  to={cater.to}
                  icon={<PartyPopper size={15} />}
                  value={cater.value}
                  label={cater.label}
                  sub={cater.sub}
                />
                {/* The order day, split in two — placing and receiving are
                    different jobs, often different people. Both read the
                    store's delivery calendar (Stores & Concepts). */}
                <KpiTile
                  compact
                  to="/ordering"
                  icon={<PackageOpen size={15} />}
                  value={String(dueToday.length)}
                  label={dueToday.length === 1 ? 'Order to place' : 'Orders to place'}
                  sub={dueToday.length ? vendorList(dueToday) : 'nothing to place'}
                />
                <KpiTile
                  compact
                  to="/invoices"
                  icon={<Truck size={15} />}
                  value={String(arrivingToday.length)}
                  label={arrivingToday.length === 1 ? 'Order to receive' : 'Orders to receive'}
                  sub={arrivingToday.length ? vendorList(arrivingToday) : 'no deliveries'}
                />
              </div>
              <Card className="drift [--i:1] relative overflow-hidden p-5">
                <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand/10 blur-2xl" />
                <div className="relative flex flex-col gap-6 lg:flex-row">
                  {/* Hero — the number, its toggle, and the goal pills */}
                  <div className="flex shrink-0 flex-col lg:w-[280px]">
                    <div className="mb-4 flex">
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
                    <div className="flex flex-1 flex-col justify-center">
                      <span className="self-start border-b-[3px] border-brand pb-1 font-display text-[clamp(2.1rem,3.2vw,2.7rem)] font-semibold leading-none text-ink">
                        {money(displayFc)}
                      </span>
                      <div className="mt-2 text-sm text-muted">forecast · {fc.label}</div>
                    </div>
                    <div className="mt-4 flex flex-col items-start gap-1.5">
                      {vsPrior != null && (
                        <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${vsPrior >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                          {vsPrior >= 0 ? '▲ +' : '▼ −'}{Math.abs(vsPrior).toFixed(1)}% ({fc.total - priorNet >= 0 ? '+' : '−'}
                          {money(Math.abs(fc.total - priorNet))}) vs last {scope === 'day' ? 'week' : scope === 'week' ? 'week' : 'period'} · goal +{targets.growthPct}%
                        </span>
                      )}
                      {laborPct != null && (
                        <span
                          title={
                            laborPartial
                              ? `Covers the ${laborCoverage} night${laborCoverage === 1 ? '' : 's'} that have BOTH labor and sales — ${salesNights - laborCoverage} more night(s) still need a labor report.`
                              : undefined
                          }
                          className={`rounded-full px-3 py-1 text-[13px] font-bold ${laborPct <= targets.laborPct ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}
                        >
                          labor {laborPct.toFixed(1)}% · goal ≤ {targets.laborPct}%
                          {laborPartial && (
                            <span className="ml-1 font-semibold opacity-80">
                              ({laborCoverage} of {salesNights} nights)
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Where the week's graph was. The graph restated what the
                      number above already says; a report waiting to be imported
                      is the thing that actually needs a hand. */}
                  <div className="min-w-0 flex-1 lg:border-l lg:border-black/5 lg:pl-6">
                    <DashDrop />
                  </div>
                </div>
              </Card>
            </div>

            {/* Gold rule — the prototype's section divider */}
            <div className="h-[3px] rounded-full bg-gradient-to-r from-brand via-brand/40 to-transparent" />

            {/* Local events — what's happening around town this week */}
            <EventsTicker />

            {/* Row 2 — tracked items from PMIX */}
            <TrackedBand scope={scope} anchor={latest?.date ?? t} />

            {/* Row 3 — Food Focus up front where it can be seen, categories beside it */}
            <div className="grid gap-6 lg:grid-cols-2">
              <LtoFocus />
              <Card className="drift [--i:3] h-full p-5">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                  Sales by category · {win.label}
                  {cats.estimated && <span className="ml-1 normal-case text-[10px] font-semibold text-brand-600">· est. from your category mix</span>}
                </div>
                {cats.total > 0 ? (
                  <div className="space-y-3">
                    {[...cats.parts]
                      .sort((a, b) => b.v - a.v)
                      .map((p, pi) => {
                        const pct = (p.v / cats.total) * 100
                        return (
                          <div key={p.l} className="flex items-center gap-3">
                            <span className="w-16 shrink-0 text-xs font-semibold text-ink">{p.l}</span>
                            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
                              <div className="sweep h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: p.c, '--i': pi } as React.CSSProperties} />
                            </div>
                            <span className="w-24 shrink-0 text-right font-mono text-[11px] text-muted">
                              {money(p.v)} · {pct.toFixed(1)}%
                            </span>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <div className="flex h-[calc(100%-1.5rem)] min-h-24 flex-col justify-center text-sm text-muted">
                    <p className="font-semibold text-ink">No category split for this day yet</p>
                    <p className="mt-1 text-xs">
                      Food / beer / liquor / wine fills in from a nightly report that has the breakdown.
                      Imported sales summaries only carry the net total — enter a night on{' '}
                      <Link to="/nightly" className="font-bold text-brand">
                        Nightly Numbers
                      </Link>{' '}
                      with categories to light this up.
                    </p>
                  </div>
                )}
              </Card>
            </div>
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

        {!hasReal && (
          <>
            <EventsTicker />
            <TrackedBand scope={scope} anchor={t} />
            <LtoFocus />
          </>
        )}

        {/* Catering tiles live beside the hero once sales exist — until then, here. */}
        {!hasReal && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <KpiTile
              dot={cater.dot}
              className={cater.urgent ? 'tile-nudge' : cater.soon ? 'tile-ring' : ''}
              to={cater.to}
              icon={<PartyPopper size={18} />}
              value={cater.value}
              label={cater.label}
              sub={cater.sub}
            />
            <KpiTile
              to="/ordering"
              icon={<PackageOpen size={18} />}
              value={String(dueToday.length)}
              label={dueToday.length === 1 ? 'Order to place' : 'Orders to place'}
              sub={dueToday.length ? vendorList(dueToday) : 'nothing to place'}
            />
            <KpiTile
              to="/invoices"
              icon={<Truck size={18} />}
              value={String(arrivingToday.length)}
              label={arrivingToday.length === 1 ? 'Order to receive' : 'Orders to receive'}
              sub={arrivingToday.length ? vendorList(arrivingToday) : 'no deliveries'}
            />
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Weekly column chart (prototype spec): slim gold pillars centered over each
 * day, dollar value on top, and a green/red +/- underneath comparing to the
 * SAME DAY LAST YEAR — falling back to the same weekday last week until a
 * year of history builds up.
 */
function WeekBars({ nights, h = 168 }: { nights: Night[]; h?: number }) {
  if (nights.length === 0) return null
  const byDate = new Map(nights.map((n) => [n.date, n]))
  const H = h // px, plot height
  const t = today()

  // Paired-pillar week view: for each day, THIS YEAR's bar (gold, clickable to
  // the nightly report; dashed when it's a forecast for a day not yet logged)
  // sits next to the PRIOR bar (striped grey — last year if that history
  // exists, otherwise last week). Two distinct pillars, never an overlay.
  const monday = mondayOf(t)
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftDays(monday, i))
  const weekActuals = weekDates.filter((d) => byDate.has(d))
  const currentWeekMode =
    weekActuals.length > 0 ||
    weekDates.some((d) => byDate.has(shiftDays(d, -364)) || byDate.has(shiftDays(d, -7)))
  const avg = dowAverages(nights)

  type Col = {
    date: string
    actual: number | null
    forecast: number | null
    prior: number | null
    priorKind: 'ly' | 'lw' | null
    delta: number | null
    deltaAbs: number | null
  }
  const mkCol = (date: string): Col => {
    const n = byDate.get(date)
    const ly = byDate.get(shiftDays(date, -364))
    const lw = byDate.get(shiftDays(date, -7))
    const priorN = ly ?? lw
    const prior = priorN && priorN.netSales > 0 ? priorN.netSales : null
    const priorKind: 'ly' | 'lw' | null = ly ? 'ly' : lw ? 'lw' : null
    const actual = n ? n.netSales : null
    const forecast = !n && date >= t ? projectDay(avg, date) || null : null
    const delta = actual != null && prior != null ? ((actual - prior) / prior) * 100 : null
    const deltaAbs = actual != null && prior != null ? actual - prior : null
    return { date, actual, forecast, prior, priorKind, delta, deltaAbs }
  }

  const cols: Col[] = currentWeekMode ? weekDates.map(mkCol) : nights.slice(-7).map((n) => mkCol(n.date))

  const max = Math.max(...cols.flatMap((c) => [c.actual ?? 0, c.forecast ?? 0, c.prior ?? 0]), 1)
  const hasLY = cols.some((c) => c.priorKind === 'ly')
  const hasLW = cols.some((c) => c.priorKind === 'lw')
  const hasPrior = hasLY || hasLW
  const priorWord = hasLY && hasLW ? 'Last yr / wk' : hasLY ? 'Last year' : 'Last week'
  const hasForecast = cols.some((c) => c.actual == null && c.forecast != null)

  return (
    <div>
      {currentWeekMode && hasPrior && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-[11px] font-medium text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-slate-300" /> {priorWord}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-brand" /> This year
          </span>
          {hasForecast && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed border-brand/60 bg-brand/15" /> Forecast
            </span>
          )}
        </div>
      )}

      <div className="relative flex items-end justify-around gap-2 sm:gap-3" style={{ height: H + 22 }}>
        {/* recessive gridlines — a quiet magnitude reference behind the marks */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: H }}>
          {[0.5, 1].map((fr) => (
            <div key={fr} className="absolute inset-x-0 border-t border-black/[0.055]" style={{ bottom: `${fr * 100}%` }} />
          ))}
        </div>
        {cols.map((c, ci) => {
          const aVal = c.actual ?? c.forecast
          const aH = aVal ? Math.max(5, (aVal / max) * H) : 0
          const pH = c.prior ? Math.max(5, (c.prior / max) * H) : 0
          return (
            <div key={c.date} className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-end">
              {/* value labels — last week (left), this year / forecast (right) */}
              <div className="mb-1.5 flex items-end justify-center gap-1.5 text-[10px] font-semibold leading-none tabular-nums sm:text-[11px]">
                {c.prior != null && <span className="text-slate-400">${(c.prior / 1000).toFixed(1)}k</span>}
                {aVal != null && (
                  <span className={c.actual != null ? 'text-ink' : 'text-brand-600/70'}>
                    {c.actual == null ? '~' : ''}${(aVal / 1000).toFixed(1)}k
                  </span>
                )}
              </div>

              {/* the pair — LAST WEEK on the left, THIS YEAR / FORECAST on the right */}
              <div className="flex items-end justify-center gap-[3px]">
                {c.prior != null ? (
                  <div
                    className="rise w-3.5 rounded-t-md bg-slate-300 sm:w-4"
                    style={{ height: pH, '--i': ci } as React.CSSProperties}
                    title={`${c.date} · ${c.priorKind === 'ly' ? 'last year' : 'last week'} ${money(c.prior)}`}
                  />
                ) : (
                  <div className="w-3.5 sm:w-4" />
                )}
                {aVal != null ? (
                  c.actual != null ? (
                    <Link
                      to={`/nightly?date=${c.date}`}
                      title={`${c.date} · this year ${money(c.actual)} — open nightly report`}
                      aria-label={`${c.date} this year ${money(c.actual)}`}
                    >
                      <div
                        className="rise w-3.5 rounded-t-md bg-gradient-to-t from-brand to-brand-600 shadow-[0_1px_3px_-1px_rgba(184,134,11,0.5)] transition-all hover:brightness-110 hover:ring-2 hover:ring-brand/25 sm:w-4"
                        style={{ height: aH, '--i': ci } as React.CSSProperties}
                      />
                    </Link>
                  ) : (
                    <div
                      className="rise w-3.5 rounded-t-md border border-dashed border-brand/50 bg-brand/15 sm:w-4"
                      style={{ height: aH, '--i': ci } as React.CSSProperties}
                      title={`${c.date} · forecast ${money(aVal)}`}
                    />
                  )
                ) : (
                  <div className="w-3.5 sm:w-4" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex justify-around gap-2 border-t border-black/10 pt-2">
        {cols.map((c) => (
          <div key={c.date} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">{weekday(c.date)}</div>
            <div className="text-[10px] text-muted">{c.date.slice(5).replace('-', '/')}</div>
            {c.delta != null ? (
              <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${c.delta >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                {c.delta >= 0 ? '▲' : '▼'}{Math.abs(c.delta).toFixed(0)}%
              </span>
            ) : c.forecast != null ? (
              <span className="text-[10px] font-semibold text-brand-600/70">forecast</span>
            ) : c.prior != null && c.actual == null ? (
              <span className="text-[10px] font-semibold text-muted">{c.priorKind === 'ly' ? 'last yr' : 'last wk'}</span>
            ) : (
              <span className="text-[11px] text-muted">—</span>
            )}
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-center text-[11px] text-muted">
        {hasLY && !hasLW
          ? 'Slate (left) = same day last year · gold (right) = this year / forecast. ▲▼ compares them.'
          : hasLW && !hasLY
            ? 'Slate (left) = same day last week · gold (right) = this year / forecast (dashed = projected). ▲▼ compares them.'
            : hasPrior
              ? 'Slate (left) = last year where that history exists, otherwise last week · gold (right) = this year / forecast.'
              : 'Comparison pillars appear once there are matching prior days.'}
      </p>
    </div>
  )
}


/**
 * FOOD FOCUS — the carousel of what the shift should be pushing: the live LTOs
 * first, then the burgers actually selling best from your product mix. Each
 * card says which it is, so "Top seller" is never mistaken for a promo.
 */
/**
 * Where a Food Focus card actually opens.
 *
 * Every card linked to /lto, including the best-selling burgers the tile
 * deliberately rotates in alongside the promo — and a burger has never been on
 * the LTO screen, so half the tile's links landed on a page that couldn't find
 * the item and quietly opened nothing.
 */
function cardLink(s: Spec): string {
  const n = encodeURIComponent(s.name)
  if (isDrink(s)) return `/drinks?spec=${n}`
  if (s.lto || s.g === 'Summer LTO' || /\bLTO\b/i.test(s.shelf)) return `/lto?item=${n}`
  return `/specs?open=${n}`
}

function LtoFocus() {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [rawDays] = usePersistentState<PmixDays>('pmix:days', {})
  const days = sanitizePmix(rawDays)
  // Matched to what the LTO screen actually holds. Not the yield line — the
  // milkshakes carry "$3.99 LTO pricing" there, so they were being pushed as
  // the shift's LTO and linking to a screen they aren't on.
  const allLtos = ACTIVE_SPECS.filter((s) => s.lto || s.g === 'Summer LTO' || /\bLTO\b/i.test(s.shelf))
  // The LTOs lead — they're what the shift is being pushed on — followed by the
  // burgers actually selling best, so the tile rotates through what's new AND
  // what's carrying the menu instead of only the promo.
  const topBurgers = useMemo(() => {
    const sold = new Map<string, number>()
    for (const d of Object.values(days))
      for (const it of d.items) {
        if (it.sales <= 0) continue
        sold.set(it.name.toLowerCase(), (sold.get(it.name.toLowerCase()) ?? 0) + it.qty)
      }
    return ACTIVE_SPECS.filter((x) => /Burger Builds/i.test(x.g))
      .map((x) => ({ spec: x, qty: sold.get(x.name.toLowerCase()) ?? 0 }))
      .filter((x) => x.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map((x) => x.spec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(days).length])
  const focus = [...allLtos, ...topBurgers.filter((b) => !allLtos.some((l) => l.name === b.name))]
  // Rotate through items that actually HAVE a photo, so the tile always shows a
  // real dish pic (falling back to everything only if no photos exist yet).
  const withPhoto = focus.filter((s) => dishPhoto(s.name))
  const ltos = withPhoto.length ? withPhoto : focus

  // Auto-scroll the food photos every few seconds (pause on hover/tap).
  useEffect(() => {
    if (paused || ltos.length <= 1) return
    const id = setInterval(() => setIdx((i) => i + 1), 5000)
    return () => clearInterval(id)
  }, [paused, ltos.length])

  if (ltos.length === 0) return null
  const s = ltos[((idx % ltos.length) + ltos.length) % ltos.length]
  const photo = dishPhoto(s.name)

  // Latest PMIX day that mentions this item, if any — honest otherwise.
  const keys = Object.keys(days).sort().reverse()
  let sold: { qty: number; sales: number; day: string } | null = null
  for (const k of keys) {
    const hit = days[k].items.find((i) => i.name.toLowerCase().includes(s.name.toLowerCase().slice(0, 12)))
    if (hit) {
      sold = { qty: hit.qty, sales: hit.sales, day: k }
      break
    }
  }

  // Prototype spec: navy card, gold FOOD FOCUS header, white serif item name,
  // gold deal chip, product photo on the right.
  return (
    <Card
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="drift [--i:4] flex h-full flex-col border-navy !bg-navy p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-[#e0b23c]">
          <Flame size={14} /> Food focus ·{' '}
          {allLtos.some((l) => l.name === s.name) ? 'LTO' : 'Top seller'}
        </div>
        <div className="flex items-center gap-1 text-xs text-white/60">
          <button onClick={() => setIdx((i) => i - 1)} aria-label="Previous" className="grid size-6 place-items-center rounded-md border border-white/15 bg-white/10 text-white">
            <ChevronLeft size={13} />
          </button>
          {(((idx % ltos.length) + ltos.length) % ltos.length) + 1} / {ltos.length}
          <button onClick={() => setIdx((i) => i + 1)} aria-label="Next" className="grid size-6 place-items-center rounded-md border border-white/15 bg-white/10 text-white">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
      <div key={s.name} className="flex min-h-0 flex-1 items-stretch gap-4 animate-[ltoFade_.5s_ease]">
        <div className="flex min-w-0 flex-1 flex-col">
          {s.yields && (
            <span className="mb-2 self-start rounded-md bg-brand px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
              {s.yields.slice(0, 34)}
            </span>
          )}
          <div className="font-display text-2xl font-semibold leading-tight text-white">{s.name}</div>
          <div className="mt-1.5 text-sm text-white/70">
            {s.ing.slice(0, 4).map(([n]) => n).join(' · ')}
            {s.ing.length > 4 ? ' · …' : ''}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
            {sold ? (
              <span className="text-sm font-semibold text-emerald-300">
                {sold.qty} sold {fmtWhen(sold.day)} · {money(sold.sales)}
              </span>
            ) : (
              <span className="text-xs text-white/50">sales fill in from your PMIX drops</span>
            )}
            <Link to={cardLink(s)} className="ml-auto text-sm font-semibold text-[#e0b23c]">
              View build →
            </Link>
          </div>
        </div>
        {photo ? (
          <img src={photo} alt={s.name} className="w-[42%] self-stretch rounded-xl object-cover shadow-sm" />
        ) : (
          <div className="grid w-[42%] place-items-center self-stretch rounded-xl bg-white/[0.06]">
            <div className="text-center">
              <Flame size={26} className="mx-auto text-[#e0b23c]/50" />
              <div className="mt-1 text-[11px] font-semibold text-white/50">photo coming soon</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * TRACKED band — tiles fed by per-day PMIX imports, scoped to the dashboard
 * toggle (handoff spec). Add any item you sell; honest "not in PMIX" states.
 */
function TrackedBand({ scope, anchor }: { scope: Scope; anchor: string }) {
  const [rawTracked] = usePersistentState<string[]>('tracked:items', [])
  const tracked = Array.isArray(rawTracked) ? rawTracked : []
  const [rawDays] = usePersistentState<PmixDays>('pmix:days', {})
  const days = sanitizePmix(rawDays)

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
        if (typeof it?.name !== 'string') continue
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
    if (typeof name !== 'string') return null
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
        <Link to="/stores" className="ml-auto text-[11px] font-semibold text-brand">
          edit in Stores &amp; Concepts →
        </Link>
      </div>
      {tracked.length === 0 ? (
        <Card className="p-4 text-center text-xs text-muted">
          Pick the items you watch under Stores &amp; Concepts → Tracked items — tiles fill from
          your PMIX drops.
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {tracked.map((name) => {
            const hit = find(name)
            return (
              <Card key={name} className="flex items-center gap-2.5 px-3.5 py-2">
                <span className="font-display text-2xl font-semibold leading-none text-brand">
                  {hit ? hit.qty : '—'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold leading-tight text-ink">{name}</span>
                  <span className="block text-[11px] leading-tight text-muted">
                    {hit
                      ? `${money(hit.sales)}${agg.net > 0 ? ` · ${((hit.sales / agg.net) * 100).toFixed(1)}%` : ''}`
                      : 'not in PMIX'}
                  </span>
                </span>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function KpiTile({
  icon,
  value,
  label,
  sub,
  compact,
  className = '',
  to,
  dot,
}: {
  icon: React.ReactNode
  value: string
  label: string
  sub?: string
  compact?: boolean
  className?: string
  to?: string
  /** Status dot colour — a live pulsing indicator (e.g. a catering today). */
  dot?: 'live' | 'soon'
}) {
  // Compact = the prototype's cream catering chip: gold number left, bold
  // label + tiny sub beside it, warm outline.
  const card = compact ? (
    <Card
      className={`flex h-full items-center gap-3 border-brand/25 !bg-brand/[0.06] px-3.5 py-2.5 ${
        to ? 'transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand/40' : ''
      } ${className}`}
    >
      {dot && <span className={`status-dot ${dot === 'live' ? 'is-live' : 'is-soon'}`} aria-hidden />}
      <span className="font-display text-2xl font-semibold leading-none text-brand">{value}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-tight text-ink">{label}</span>
        {sub && <span className="block text-[11px] leading-tight text-muted">{sub}</span>}
      </span>
    </Card>
  ) : (
    <Card
      className={`h-full p-4 ${to ? 'transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand/30' : ''} ${className}`}
    >
      <div className="mb-2 grid size-9 place-items-center rounded-xl bg-brand/10 text-brand">{icon}</div>
      <div className="font-display text-2xl font-semibold text-brand">{value}</div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Card>
  )
  return to ? (
    <Link to={to} className="block h-full">
      {card}
    </Link>
  ) : (
    card
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
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function __unusedPrev(month: string): string {
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
  // Show the year whenever it isn't this year — a June 2025 night must never
  // read like it happened this June.
  const opts: Intl.DateTimeFormatOptions =
    y === new Date().getFullYear()
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts)
}
function fmtTime(tm: string): string {
  const [h, m] = tm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'p' : 'a'}`
}

/** Local-events banner — a scrolling ticker of what's happening around town.
 *  Managers add events inline today; the email-watcher automation (backend
 *  upgrade) will feed this same list on its own. */
function EventsTicker() {
  const [tick, setTick] = useState(0)
  const t = today()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => upcomingEvents(t), [tick, t])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState(t)

  const fmtEv = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number)
    return new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const submit = () => {
    if (!name.trim() || !date) return
    addEvent(name, date)
    setName('')
    setAdding(false)
    setTick((x) => x + 1)
  }

  // Duplicate the row so the marquee loops seamlessly when it overflows.
  const row = (keyPrefix: string) => (
    <div className="flex shrink-0 items-center gap-2 pr-2">
      {events.map((e: LocalEvent) => (
        <span
          key={keyPrefix + e.id}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-signal/25 bg-signal/[0.07] py-1 pl-3 pr-1.5 text-xs font-semibold text-ink"
        >
          <span className="text-signal">{fmtEv(e.date)}</span> {e.name}
          <button
            onClick={() => { removeEvent(e.id); setTick((x) => x + 1) }}
            aria-label={`Remove ${e.name}`}
            className="rounded-full p-0.5 text-muted/50 hover:text-down"
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  )

  return (
    <div className="drift flex items-center gap-3 overflow-hidden rounded-2xl border border-signal/20 bg-gradient-to-r from-signal/[0.08] to-transparent px-4 py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-signal">
        <Megaphone size={14} className="idle-sway" /> Local events
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        {events.length === 0 ? (
          <span className="text-xs text-muted">Nothing tracked — add games, concerts, festivals that could swing business.</span>
        ) : (
          <div className={`flex ${events.length > 3 ? 'animate-[tickerscroll_28s_linear_infinite] hover:[animation-play-state:paused]' : ''}`}>
            {row('a')}
            {events.length > 3 && row('b')}
          </div>
        )}
      </div>
      {adding ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Event name"
            className="w-36 rounded-lg border border-white/10 bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-signal"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-signal"
          />
          <button onClick={submit} className="rounded-lg bg-signal/20 px-2.5 py-1.5 text-xs font-bold text-signal">Add</button>
          <button onClick={() => setAdding(false)} aria-label="Cancel" className="text-muted hover:text-ink"><X size={14} /></button>
        </span>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-bold text-muted hover:border-signal hover:text-signal"
        >
          + Add
        </button>
      )}
    </div>
  )
}

/**
 * What the catering tile should say right now.
 *
 * Three states, because "one today", "none today but one Friday" and "nothing
 * booked" all mean different things on a Tuesday morning. Only a catering that
 * is actually TODAY earns the shake and the red dot; a booking coming up gets
 * its date in the number slot and a gold dot once it is within two days.
 */
function cateringTile(
  todays: Booking[],
  next?: Booking,
): { value: string; label: string; sub: string; to: string; dot?: 'live' | 'soon'; urgent: boolean; soon?: boolean } {
  if (todays.length > 0) {
    return {
      value: String(todays.length),
      label: todays.length === 1 ? 'Catering today' : 'Caterings today',
      sub: `${todays[0].time ? `${fmtTime(todays[0].time)} · ` : ''}${todays[0].event}`.slice(0, 28),
      to: `/catering?booking=${todays[0].id}`,
      dot: 'live',
      urgent: true,
    }
  }
  if (next) {
    const days = daysUntil(next.date)
    return {
      value: fmtMD(next.date),
      label: days === 1 ? 'Catering tomorrow' : 'Next catering',
      sub: `${days === 1 ? 'tomorrow' : `in ${days} days`} · ${next.event}`.slice(0, 28),
      to: `/catering?booking=${next.id}`,
      dot: days <= 2 ? 'soon' : undefined,
      // Inside two days the tile still breathes, it just doesn't shake — the
      // shake is reserved for a catering going out TODAY.
      urgent: false,
      soon: days <= 2,
    }
  }
  return { value: '—', label: 'Catering', sub: 'nothing booked', to: '/catering', urgent: false }
}

/** "8/9" — short enough to sit in the tile's number slot. */
function fmtMD(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}
