import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { useCurrentNames } from '../lib/scope'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import type { Booking } from '../lib/catering'
import type { Night } from '../lib/nightly'
import type { PmixDays } from '../lib/pmix'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { PartyPopper, CalendarClock, Banknote, PieChart, Bell, Plus, Moon, X, ChevronLeft, ChevronRight, Flame } from 'lucide-react'
import { dowAverages, projectDay, periodWeek } from '../lib/forecast'
import { SPECS } from '../lib/specs'

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

  const wtd = sorted.slice(-7).reduce((s, n) => s + n.netSales, 0)

  const pw = periodWeek(t)

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${concept} · ${location} · ${todayLong()} · Period ${pw.period}, Week ${pw.week}`}
      />
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
                    {vsPrior >= 0 ? '▲ +' : '▼ −'}{Math.abs(vsPrior).toFixed(1)}% ({net - priorNet >= 0 ? '+' : '−'}
                    {money(Math.abs(net - priorNet))}) vs prior · goal +{targets.growthPct}%
                  </span>
                )}
                {laborPct != null && (
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${laborPct <= targets.laborPct ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                    labor {laborPct.toFixed(1)}% · goal ≤ {targets.laborPct}%
                  </span>
                )}
              </div>
            </Card>

            <TrackedBand scope={scope} anchor={latest?.date ?? t} />

            {/* Weekly column chart — slim pillars, ▲▼ vs same day last year beneath */}
            <Card className="p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">
                  Recent nights · net sales
                </div>
                <div className="text-xs text-muted">
                  Last {Math.min(7, sorted.length)} nights <b className="font-mono text-ink">{money(wtd)}</b>
                </div>
              </div>
              <WeekBars nights={sorted} />
            </Card>

            {/* Category rows + Food Focus — two squares, side by side */}
            <div className="grid gap-6 lg:grid-cols-2">
              {cats.total > 0 && (
                <Card className="h-full p-5">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                    Sales by category · {win.label}
                  </div>
                  <div className="space-y-3">
                    {[...cats.parts]
                      .sort((a, b) => b.v - a.v)
                      .map((p) => {
                        const pct = (p.v / cats.total) * 100
                        return (
                          <div key={p.l} className="flex items-center gap-3">
                            <span className="w-16 shrink-0 text-xs font-semibold text-ink">{p.l}</span>
                            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: p.c }} />
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
 * Weekly column chart (prototype spec): slim gold pillars centered over each
 * day, dollar value on top, and a green/red +/- underneath comparing to the
 * SAME DAY LAST YEAR — falling back to the same weekday last week until a
 * year of history builds up.
 */
function WeekBars({ nights }: { nights: Night[] }) {
  if (nights.length === 0) return null
  const byDate = new Map(nights.map((n) => [n.date, n]))
  const H = 168 // px, plot height
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
        {cols.map((c) => {
          const h = Math.max(6, (c.value / max) * H)
          return (
            <div key={c.date} className="flex flex-1 flex-col items-center justify-end">
              {c.kind === 'none' ? (
                <div className="mb-1 text-[9px] text-muted/60">no data</div>
              ) : (
                <div className={`mb-1 font-mono text-[10px] font-semibold ${c.kind === 'forecast' ? 'text-muted' : 'text-ink/70'}`}>
                  {c.kind === 'forecast' ? '~' : ''}${(c.value / 1000).toFixed(1)}k
                </div>
              )}
              {c.kind === 'actual' && (
                <div className="w-6 rounded-t-[4px] bg-brand sm:w-7" style={{ height: h }} title={`${c.date} · ${money(c.value)}`} />
              )}
              {c.kind === 'forecast' && (
                <div
                  className="w-6 rounded-t-[4px] border-2 border-dashed border-brand/50 bg-brand/10 sm:w-7"
                  style={{ height: h }}
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

// Real product photos, recovered from the owner's prototype bundle.
const LTO_PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/lto/*.jpg', { eager: true, query: '?url', import: 'default' })).map(
    ([path, url]) => [path.split('/').pop()!.replace('.jpg', ''), url as string],
  ),
)
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

/** FOOD FOCUS — LTO carousel card (prototype spec): cycle the live LTOs. */
function LtoFocus() {
  const [idx, setIdx] = useState(0)
  const [days] = usePersistentState<PmixDays>('pmix:days', {})
  const ltos = SPECS.filter((s) => s.g === 'Summer LTO' || /LTO/i.test(s.shelf) || /LTO/i.test(s.yields))
  if (ltos.length === 0) return null
  const s = ltos[((idx % ltos.length) + ltos.length) % ltos.length]
  const photo = LTO_PHOTOS[slugify(s.name)]

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

  return (
    <Card className="flex h-full flex-col border-brand/25 bg-gradient-to-br from-white to-brand/5 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-brand">
          <Flame size={14} /> Food focus · LTO
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <button onClick={() => setIdx((i) => i - 1)} aria-label="Previous" className="grid size-6 place-items-center rounded-md border border-black/10 bg-white">
            <ChevronLeft size={13} />
          </button>
          {(((idx % ltos.length) + ltos.length) % ltos.length) + 1} / {ltos.length}
          <button onClick={() => setIdx((i) => i + 1)} aria-label="Next" className="grid size-6 place-items-center rounded-md border border-black/10 bg-white">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
      {photo && (
        <img src={photo} alt={s.name} className="mb-3 h-44 w-full rounded-xl object-cover shadow-sm" />
      )}
      <div className="font-display text-xl font-semibold text-ink">{s.name}</div>
      <div className="mt-0.5 text-sm text-ink/70">
        {s.ing.slice(0, 4).map(([n]) => n).join(' · ')}
        {s.ing.length > 4 ? ' · …' : ''}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
        {sold ? (
          <span className="text-sm font-semibold text-up">
            {sold.qty} sold {fmtWhen(sold.day)} · {money(sold.sales)}
          </span>
        ) : (
          <span className="text-xs text-muted">sales fill in from your PMIX drops</span>
        )}
        <Link to={`/lto?item=${encodeURIComponent(s.name)}`} className="ml-auto text-sm font-semibold text-brand">
          View build →
        </Link>
      </div>
    </Card>
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
