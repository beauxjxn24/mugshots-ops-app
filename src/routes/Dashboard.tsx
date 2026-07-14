import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { useCurrentNames } from '../lib/scope'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import type { Booking } from '../lib/catering'
import type { Night } from '../lib/nightly'
import type { PmixDays } from '../lib/pmix'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { PartyPopper, CalendarClock, Plus, Moon, ChevronLeft, ChevronRight, Flame } from 'lucide-react'
import { dowAverages, projectDay, periodWeek } from '../lib/forecast'
import { SPECS } from '../lib/specs'
import { dishPhoto } from '../lib/photos'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
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
  const displayNet = useCountUp(net)
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

  const wtd = sorted.slice(-7).reduce((s, n) => s + n.netSales, 0)

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
            {/* Weekly chart across the top — trimmed height (owner spec) */}
            <Card className="drift [--i:0] p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">
                  Recent nights · net sales
                </div>
                <div className="text-xs text-muted">
                  Last {Math.min(7, sorted.length)} nights <b className="font-mono text-ink">{money(wtd)}</b>
                </div>
              </div>
              <WeekBars nights={sorted} h={108} />
            </Card>

            <TrackedBand scope={scope} anchor={latest?.date ?? t} />

            {/* Gold rule — the prototype's section divider */}
            <div className="h-[3px] rounded-full bg-gradient-to-r from-brand via-brand/40 to-transparent" />

            {/* Catering tiles (far left, by the nav) + hero — the tiles
                themselves blink & shake when a catering is coming up */}
            <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(160px,1fr)_minmax(0,3.2fr)]">
              <div className="drift [--i:1] grid grid-cols-2 gap-4 lg:grid-cols-1 lg:grid-rows-2">
                <KpiTile
                  compact
                  className={todays.length > 0 ? 'tile-alert urgent' : ''}
                  to={todays.length ? `/catering?booking=${todays[0].id}` : '/catering'}
                  icon={<PartyPopper size={15} />}
                  value={String(todays.length)}
                  label="Caterings today"
                  sub={todays.length ? todays[0].event.slice(0, 20) : 'none today'}
                />
                <KpiTile
                  compact
                  className={next && todays.length === 0 && daysUntil(next.date) <= 7 ? 'tile-alert' : ''}
                  to={next ? `/catering?booking=${next.id}` : '/catering'}
                  icon={<CalendarClock size={15} />}
                  value={next ? String(next.guests || '—') : '—'}
                  label="Next booking"
                  sub={next ? `${fmtWhen(next.date)}${next.time ? ` · ${fmtTime(next.time)}` : ''}` : 'none scheduled'}
                />
              </div>
              <Card className="drift [--i:2] relative flex flex-col overflow-hidden p-5">
                <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand/10 blur-2xl" />
                <div className="relative mb-4 flex">
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
                <div className="relative flex flex-1 flex-col justify-center">
                  <span className="self-start border-b-[3px] border-brand pb-1 font-display text-[clamp(2.2rem,4.5vw,3rem)] font-semibold leading-none text-ink">
                    {money(displayNet)}
                  </span>
                  <div className="mt-2 text-sm text-muted">net · {win.label}</div>
                </div>
                <div className="relative mt-4 flex flex-col items-start gap-1.5">
                  {vsPrior != null && (
                    <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${vsPrior >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                      {vsPrior >= 0 ? '▲ +' : '▼ −'}{Math.abs(vsPrior).toFixed(1)}% ({net - priorNet >= 0 ? '+' : '−'}
                      {money(Math.abs(net - priorNet))}) vs prior · goal +{targets.growthPct}%
                    </span>
                  )}
                  {laborPct != null && (
                    <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${laborPct <= targets.laborPct ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                      labor {laborPct.toFixed(1)}% · goal ≤ {targets.laborPct}%
                    </span>
                  )}
                </div>
              </Card>
            </div>

            {/* Category rows + Food Focus — two squares, side by side */}
            <div className="grid gap-6 lg:grid-cols-2">
              {cats.total > 0 && (
                <Card className="drift [--i:3] h-full p-5">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                    Sales by category · {win.label}
                  </div>
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
                </Card>
              )}
              <LtoFocus />
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
            <TrackedBand scope={scope} anchor={t} />
            <LtoFocus />
          </>
        )}

        {/* Catering tiles live beside the hero once sales exist — until then, here. */}
        {!hasReal && (
          <div className="grid grid-cols-2 gap-4">
            <KpiTile
              to={todays.length ? `/catering?booking=${todays[0].id}` : '/catering'}
              icon={<PartyPopper size={18} />}
              value={String(todays.length)}
              label="Caterings today"
              sub={todays.length ? todays[0].event.slice(0, 20) : 'none today'}
            />
            <KpiTile
              to={next ? `/catering?booking=${next.id}` : '/catering'}
              icon={<CalendarClock size={18} />}
              value={next ? String(next.guests || '—') : '—'}
              label="Next booking"
              sub={next ? `${fmtWhen(next.date)}${next.time ? ` · ${fmtTime(next.time)}` : ''}` : 'none scheduled'}
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

  // Current-week mode (prototype): Mon–Sun of this week — real bars where
  // nights exist, dashed ~forecast bars for the days still ahead. If this week
  // has no data yet, fall back to the last 7 logged nights.
  const monday = mondayOf(t)
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftDays(monday, i))
  const weekActuals = weekDates.filter((d) => byDate.has(d))
  const currentWeekMode = weekActuals.length > 0
  const avg = dowAverages(nights)

  type Col = { date: string; value: number; kind: 'actual' | 'forecast' | 'none'; delta: number | null; deltaAbs: number | null }
  let usedLY = false
  let usedLW = false
  const mkCol = (date: string): Col => {
    const n = byDate.get(date)
    if (n) {
      const ly = byDate.get(shiftDays(date, -364))
      const lw = byDate.get(shiftDays(date, -7))
      const base = ly ?? lw
      if (ly) usedLY = true
      else if (lw) usedLW = true
      const delta = base && base.netSales > 0 ? ((n.netSales - base.netSales) / base.netSales) * 100 : null
      return { date, value: n.netSales, kind: 'actual', delta, deltaAbs: base ? n.netSales - base.netSales : null }
    }
    if (date >= t) {
      const proj = projectDay(avg, date)
      return { date, value: proj, kind: proj > 0 ? 'forecast' : 'none', delta: null, deltaAbs: null }
    }
    return { date, value: 0, kind: 'none', delta: null, deltaAbs: null }
  }

  const cols: Col[] = currentWeekMode
    ? weekDates.map(mkCol)
    : nights.slice(-7).map((n) => mkCol(n.date))

  const max = Math.max(...cols.map((c) => c.value), 1)
  const wtd = cols.filter((c) => c.kind === 'actual').reduce((s, c) => s + c.value, 0)
  const pacing = cols.reduce((s, c) => s + (c.kind === 'none' ? 0 : c.value), 0)
  const lwTotal = weekDates.reduce((s, d) => s + (byDate.get(shiftDays(d, -7))?.netSales ?? 0), 0)

  return (
    <div>
      {currentWeekMode && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
          <span>
            WTD <b className="font-mono text-ink">{money(wtd)}</b>
          </span>
          {pacing > wtd && (
            <span>
              pacing <b className="font-mono text-ink">${(pacing / 1000).toFixed(1)}k</b>
            </span>
          )}
          {lwTotal > 0 && (
            <span>
              LW <b className="font-mono">${(lwTotal / 1000).toFixed(1)}k</b>
            </span>
          )}
        </div>
      )}
      <div className="flex items-end justify-around gap-2" style={{ height: H + 22 }}>
        {cols.map((c, ci) => {
          const h = Math.max(6, (c.value / max) * H)
          if (c.kind === 'actual') {
            // Clickable bar → the nightly report for that day
            return (
              <Link
                key={c.date}
                to={`/nightly?date=${c.date}`}
                title={`${c.date} · ${money(c.value)} — open nightly report`}
                className="group flex min-w-0 flex-1 flex-col items-center justify-end"
              >
                <div className="mb-1 font-mono text-[10px] font-semibold text-ink/70 group-hover:text-ink">
                  ${(c.value / 1000).toFixed(1)}k
                </div>
                <div
                  className="rise w-6 rounded-t-[4px] bg-brand transition-all group-hover:bg-brand-600 group-hover:ring-2 group-hover:ring-brand/30 sm:w-7"
                  style={{ height: h, '--i': ci } as React.CSSProperties}
                />
              </Link>
            )
          }
          return (
            <div key={c.date} className="flex flex-1 flex-col items-center justify-end">
              {c.kind === 'none' ? (
                <div className="mb-1 text-[9px] text-muted/60">no data</div>
              ) : (
                <div className="mb-1 font-mono text-[10px] font-semibold text-muted">
                  ~${(c.value / 1000).toFixed(1)}k
                </div>
              )}
              {c.kind === 'forecast' && (
                <div
                  className="rise w-6 rounded-t-[4px] border-2 border-dashed border-brand/50 bg-brand/10 sm:w-7"
                  style={{ height: h, '--i': ci } as React.CSSProperties}
                  title={`${c.date} · forecast ${money(c.value)}`}
                />
              )}
              {c.kind === 'none' && <div className="w-6 border-b-2 border-black/10 sm:w-7" />}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-around gap-2 border-t border-black/5 pt-1.5">
        {cols.map((c) => (
          <div key={c.date} className="flex-1 text-center">
            <div className="text-[9px] font-bold text-muted">{weekday(c.date)}</div>
            <div className="text-[8.5px] text-muted/70">{c.date.slice(5).replace('-', '/')}</div>
            {c.kind === 'forecast' ? (
              <div className="text-[9px] font-semibold text-muted">forecast</div>
            ) : c.delta != null ? (
              <div className={`text-[10px] font-bold ${c.delta >= 0 ? 'text-up' : 'text-down'}`}>
                {c.delta >= 0 ? '▲ +' : '▼ −'}
                {Math.abs(c.delta).toFixed(0)}%
                {c.deltaAbs != null && (
                  <span className="font-semibold"> · {c.deltaAbs >= 0 ? '+' : '−'}${(Math.abs(c.deltaAbs) / 1000).toFixed(1)}k</span>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-muted">—</div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted">
        {usedLY
          ? '▲▼ vs the same day last year'
          : usedLW
            ? '▲▼ vs the same day last week — switches to last year once that history exists (drop old Toast sales summaries on Imports to backfill)'
            : 'Comparisons appear once there are matching prior days'}
      </p>
    </div>
  )
}


/** FOOD FOCUS — LTO carousel card (prototype spec): cycle the live LTOs. */
function LtoFocus() {
  const [idx, setIdx] = useState(0)
  const [days] = usePersistentState<PmixDays>('pmix:days', {})
  const ltos = SPECS.filter((s) => s.g === 'Summer LTO' || /LTO/i.test(s.shelf) || /LTO/i.test(s.yields))
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
    <Card className="drift [--i:4] flex h-full flex-col border-navy !bg-navy p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-[#e0b23c]">
          <Flame size={14} /> Food focus · LTO
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
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
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
            <Link to={`/lto?item=${encodeURIComponent(s.name)}`} className="ml-auto text-sm font-semibold text-[#e0b23c]">
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
  const [tracked] = usePersistentState<string[]>('tracked:items', [])
  const [days] = usePersistentState<PmixDays>('pmix:days', {})

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
}: {
  icon: React.ReactNode
  value: string
  label: string
  sub?: string
  compact?: boolean
  className?: string
  to?: string
}) {
  // Compact = the prototype's cream catering chip: gold number left, bold
  // label + tiny sub beside it, warm outline.
  const card = compact ? (
    <Card
      className={`flex h-full items-center gap-3 border-brand/40 !bg-[#fbf3df] px-3.5 py-2.5 ${
        to ? 'transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand/40' : ''
      } ${className}`}
    >
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
