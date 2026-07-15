import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Mail } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import { confirmDelete } from '../lib/confirm'
import { dowAverages, projectDay, periodWeek } from '../lib/forecast'
import { getPriceLog } from '../lib/catalog'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import type { Night } from '../lib/nightly'
import { sanitizePmix, type PmixDays } from '../lib/pmix'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const kfmt = (n: number) => `$${(n / 1000).toFixed(1)}k`

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return iso(new Date(y, m - 1, d + delta))
}
function fmtMD(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${m}/${d}`
}
function fmtLong(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtDow(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
}

interface Decision {
  id: string
  text: string
  done: boolean
}

/**
 * Period review — the owner one-pager (prototype): builds ITSELF from the
 * nightly closes. Navy summary, four week cards, WORKING / WATCH bullets,
 * decisions checklist for next period. Print or send.
 */
export function Period() {
  const [nights] = usePersistentState<Night[]>('nightly:log', [])
  const [rawDays] = usePersistentState<PmixDays>('pmix:days', {})
  const days = sanitizePmix(rawDays)
  const [targets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  const { concept, location } = useCurrentNames()
  const priceLog = useMemo(() => getPriceLog(), [])

  const t = today()
  const pw = periodWeek(t)
  const year = Number(t.slice(0, 4))
  const pStart = iso(new Date(year, 0, 1 + (pw.period - 1) * 28))
  const pEnd = shiftDays(pStart, 27)
  const [decisions, setDecisions] = usePersistentState<Decision[]>(`period:decisions:${year}-P${pw.period + 1}`, [])
  const [newDecision, setNewDecision] = useState('')

  const byDate = useMemo(() => new Map(nights.map((n) => [n.date, n])), [nights])
  const inPeriod = nights
    .filter((n) => n.date >= pStart && n.date <= (pEnd < t ? pEnd : t))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const netToDate = inPeriod.reduce((s, n) => s + n.netSales, 0)
  const laborSum = inPeriod.reduce((s, n) => s + (n.labor ?? 0), 0)
  const laborPct = netToDate > 0 && laborSum > 0 ? (laborSum / netToDate) * 100 : null
  const cashOU = inPeriod.reduce((s, n) => s + (n.overUnder ?? 0), 0)
  const hasOU = inPeriod.some((n) => n.overUnder != null)

  // vs LY over the same dates (only where both years have data — honest comp).
  const lyPairs = inPeriod
    .map((n) => ({ cur: n.netSales, ly: byDate.get(shiftDays(n.date, -364))?.netSales }))
    .filter((p): p is { cur: number; ly: number } => p.ly != null && p.ly > 0)
  const lyCur = lyPairs.reduce((s, p) => s + p.cur, 0)
  const lyPrev = lyPairs.reduce((s, p) => s + p.ly, 0)
  const vsLy = lyPrev > 0 ? ((lyCur - lyPrev) / lyPrev) * 100 : null

  // Projected finish = net to date + forecast for the period's remaining days.
  const avg = useMemo(() => dowAverages(nights), [nights])
  let projected = netToDate
  for (let d = shiftDays(t, 1); d <= pEnd; d = shiftDays(d, 1)) projected += projectDay(avg, d)

  // Four week slices.
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const ws = shiftDays(pStart, i * 7)
    const we = shiftDays(ws, 6)
    const wn = inPeriod.filter((n) => n.date >= ws && n.date <= we)
    const net = wn.reduce((s, n) => s + n.netSales, 0)
    const lab = wn.reduce((s, n) => s + (n.labor ?? 0), 0)
    const ou = wn.reduce((s, n) => s + (n.overUnder ?? 0), 0)
    const pairs = wn
      .map((n) => ({ cur: n.netSales, ly: byDate.get(shiftDays(n.date, -364))?.netSales }))
      .filter((p): p is { cur: number; ly: number } => p.ly != null && p.ly > 0)
    const wLyPrev = pairs.reduce((s, p) => s + p.ly, 0)
    const wVsLy = wLyPrev > 0 ? ((pairs.reduce((s, p) => s + p.cur, 0) - wLyPrev) / wLyPrev) * 100 : null
    let forecast = 0
    if (ws > t) for (let d = ws; d <= we; d = shiftDays(d, 1)) forecast += projectDay(avg, d)
    return {
      i: i + 1,
      ws,
      we,
      net,
      laborPct: net > 0 && lab > 0 ? (lab / net) * 100 : null,
      ou,
      hasOU: wn.some((n) => n.overUnder != null),
      vsLy: wVsLy,
      status: we < t ? 'final' : ws <= t ? 'progress' : 'future',
      forecast,
    }
  })

  // WORKING / WATCH — generated from the actual closes.
  const { working, watch } = useMemo(() => {
    const working: string[] = []
    const watch: string[] = []
    const withLabor = inPeriod.filter((n) => (n.laborPct ?? 0) > 0 || ((n.labor ?? 0) > 0 && n.netSales > 0))
    const lp = (n: Night) => n.laborPct ?? ((n.labor ?? 0) / n.netSales) * 100
    if (withLabor.length >= 3) {
      const best = [...withLabor].sort((a, b) => lp(a) - lp(b))[0]
      working.push(`${fmtDow(best.date)} labor ${lp(best).toFixed(2)}% — best night of the period`)
      const worst = [...withLabor].sort((a, b) => lp(b) - lp(a))[0]
      if (lp(worst) > targets.laborPct + 1.5)
        watch.push(`${fmtDow(worst.date)} labor ${lp(worst).toFixed(1)}% — schedule template needs a look`)
    }
    // Top item in the period from PMIX.
    const keys = Object.keys(days).filter((k) => k >= pStart && k <= pEnd)
    if (keys.length) {
      const byName = new Map<string, { qty: number; sales: number }>()
      let total = 0
      for (const k of keys)
        for (const it of days[k]?.items ?? []) {
          if (it.sales <= 0) continue
          total += it.sales
          const cur = byName.get(it.name)
          if (cur) {
            cur.qty += it.qty
            cur.sales += it.sales
          } else byName.set(it.name, { qty: it.qty, sales: it.sales })
        }
      const top = [...byName.entries()].sort((a, b) => b[1].sales - a[1].sales)[0]
      if (top && total > 0)
        working.push(`${top[0]} still #1 · ${money(top[1].sales)} · ${((top[1].sales / total) * 100).toFixed(1)}% of item sales`)
    }
    const bestWeek = weeks.filter((w) => w.vsLy != null && w.status !== 'future').sort((a, b) => (b.vsLy ?? 0) - (a.vsLy ?? 0))[0]
    if (bestWeek && (bestWeek.vsLy ?? 0) > 0)
      working.push(`Week ${bestWeek.i} ▲ +${bestWeek.vsLy!.toFixed(1)}% vs LY — best comp of the period`)
    for (const c of priceLog.slice(0, 2))
      if (c.pct != null && c.pct >= 5) watch.push(`${c.name} +${c.pct.toFixed(0)}% on your last ${c.vendor} import — quote due before P${pw.period + 1}`)
    if (hasOU && Math.abs(cashOU) >= 20) watch.push(`Cash ${cashOU >= 0 ? '+' : '−'}$${Math.abs(cashOU).toFixed(2)} over the period — drawer checks`)
    return { working, watch }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPeriod.length, Object.keys(days).length, priceLog.length])

  const finalWeeks = weeks.filter((w) => w.status === 'final').length
  const sendToOwner = async () => {
    const lines = [
      `${concept} · ${location} — Period ${pw.period} review (${fmtLong(pStart)} – ${fmtLong(pEnd)})`,
      '',
      `Net to date: ${money(netToDate)} · ${inPeriod.length} nights`,
      vsLy != null ? `vs LY: ${vsLy >= 0 ? '+' : ''}${vsLy.toFixed(1)}%` : '',
      laborPct != null ? `Labor: ${laborPct.toFixed(1)}% (goal ≤ ${targets.laborPct}%)` : '',
      `Projected finish: ${money(projected)}`,
      '',
      ...weeks.map((w) =>
        w.status === 'future'
          ? `W${w.i} (${fmtMD(w.ws)}–${fmtMD(w.we)}): forecast ${money(w.forecast)}`
          : `W${w.i} (${fmtMD(w.ws)}–${fmtMD(w.we)}): ${money(w.net)}${w.laborPct ? ` · labor ${w.laborPct.toFixed(1)}%` : ''}`,
      ),
      '',
      working.length ? '— Working —' : '',
      ...working,
      watch.length ? '— Watch —' : '',
      ...watch,
    ].filter(Boolean)
    const body = lines.join('\n')
    try {
      await navigator.clipboard.writeText(body)
    } catch {
      /* mailto still carries it */
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(`${location} Period ${pw.period} review`)}&body=${encodeURIComponent(body)}`
  }

  const addDecision = () => {
    if (!newDecision.trim()) return
    setDecisions((ds) => [...ds, { id: `d${Date.now()}`, text: newDecision.trim(), done: false }])
    setNewDecision('')
  }

  return (
    <>
      <PageHeader
        title={`Period ${pw.period} review · ${fmtLong(pStart)} – ${fmtLong(pEnd)}`}
        subtitle={`Owner one-pager · builds itself from the nightly closes${inPeriod.length ? ` · through ${fmtLong(inPeriod[inPeriod.length - 1].date)}` : ''}`}
        right={
          <div className="flex gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-bold text-ink"
            >
              <Printer size={13} /> Print / PDF
            </button>
            <button
              onClick={sendToOwner}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white"
            >
              <Mail size={13} /> Send to owner
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        {inPeriod.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="mx-auto max-w-md text-sm text-muted text-pretty">
              No closes in Period {pw.period} yet — the one-pager assembles itself from Nightly
              Numbers as the nights land.
            </p>
          </Card>
        ) : (
          <>
            {/* Navy summary */}
            <Card className="border-navy !bg-navy p-5 text-white">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/60">
                    P{pw.period} · {finalWeeks > 0 ? `weeks 1–${finalWeeks} final · ` : ''}week {pw.week} in progress
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-3">
                    <span className="font-display text-4xl font-semibold">{kfmt(netToDate)}</span>
                    <span className="text-sm text-white/70">net to date · {inPeriod.length} nights</span>
                    {vsLy != null && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${vsLy >= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                        {vsLy >= 0 ? '▲ +' : '▼ −'}
                        {Math.abs(vsLy).toFixed(1)}% ({vsLy >= 0 ? '+' : '−'}{kfmt(Math.abs(lyCur - lyPrev))}) vs LY
                      </span>
                    )}
                    {laborPct != null && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${laborPct <= targets.laborPct ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                        Labor {laborPct.toFixed(1)}% · goal {targets.laborPct}% {laborPct <= targets.laborPct ? '✓' : '▲'}
                      </span>
                    )}
                    {hasOU && (
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/85">
                        Cash {cashOU >= 0 ? '+' : '−'}${Math.abs(cashOU).toFixed(2)} {cashOU >= 0 ? 'over' : 'short'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/60">Projected finish</div>
                  <div className="font-display text-3xl font-semibold">{kfmt(projected)}</div>
                  <div className="text-[11px] font-bold text-emerald-300">goal +{targets.growthPct}% vs LY</div>
                </div>
              </div>
            </Card>

            {/* Week cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {weeks.map((w) => (
                <Card
                  key={w.i}
                  className={`p-4 ${w.status === 'progress' ? 'ring-2 ring-brand' : ''} ${w.status === 'future' ? 'border-dashed !shadow-none' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted">
                      Week {w.i} · {fmtMD(w.ws)}–{fmtMD(w.we)}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-bold ${
                        w.status === 'final' ? 'text-up' : w.status === 'progress' ? 'text-brand-600' : 'text-muted'
                      }`}
                    >
                      {w.status === 'final' ? '✓ final' : w.status === 'progress' ? '● in progress' : 'not started'}
                    </span>
                  </div>
                  {w.status === 'future' ? (
                    <>
                      <div className="mt-1 font-display text-2xl font-semibold text-muted">—</div>
                      <div className="mt-1 text-xs text-muted">forecast {kfmt(w.forecast)}</div>
                      <Link to="/forecast" className="text-xs font-bold text-brand">
                        week at a glance →
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 font-display text-2xl font-semibold text-ink">{money(w.net)}</div>
                      <div className="mt-1 space-y-0.5 text-xs text-muted">
                        {w.laborPct != null && (
                          <div>
                            Labor {w.laborPct.toFixed(1)}%{' '}
                            {w.laborPct <= targets.laborPct ? (
                              <span className="font-bold text-up">✓</span>
                            ) : (
                              <span className="font-bold text-down">▲ {(w.laborPct - targets.laborPct).toFixed(1)} over</span>
                            )}
                          </div>
                        )}
                        {w.hasOU && <div>O/U {w.ou >= 0 ? '+' : '−'}${Math.abs(w.ou).toFixed(2)}</div>}
                        {w.vsLy != null && (
                          <div className={w.vsLy >= 0 ? 'font-bold text-up' : 'font-bold text-down'}>
                            vs LY {w.vsLy >= 0 ? '▲ +' : '▼ −'}
                            {Math.abs(w.vsLy).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              ))}
            </div>

            {/* Working / Watch */}
            {(working.length > 0 || watch.length > 0) && (
              <div className="grid items-start gap-5 lg:grid-cols-2">
                <Card className="border-up/25 bg-up/[0.05] p-4">
                  <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-up">Working</div>
                  {working.length === 0 ? (
                    <p className="text-xs text-muted">Fills in as the period builds.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {working.map((w, i) => (
                        <li key={i} className="text-sm leading-relaxed text-ink/85">
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card className="border-down/25 bg-down/[0.04] p-4">
                  <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-down">Watch</div>
                  {watch.length === 0 ? (
                    <p className="text-xs text-muted">Nothing flagged — clean period so far.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {watch.map((w, i) => (
                        <li key={i} className="text-sm leading-relaxed text-ink/85">
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}

            {/* Decisions for next period */}
            <Card className="p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-lg font-semibold text-ink">
                  Decisions for P{pw.period + 1}
                  <span className="ml-2 text-xs font-normal text-muted">check off as you commit — your action plan</span>
                </span>
                <span className="text-[10px] text-muted">auto-updates nightly</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {decisions.map((d) => (
                  <label
                    key={d.id}
                    className={`group inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                      d.done ? 'border-up/40 bg-up/5 text-ink' : 'border-black/10 bg-white text-ink'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={d.done}
                      onChange={() => setDecisions((ds) => ds.map((x) => (x.id === d.id ? { ...x, done: !x.done } : x)))}
                    />
                    {d.text}
                    <button
                      onClick={async (e) => {
                        e.preventDefault()
                        if (await confirmDelete(`Remove "${d.text}"?`)) setDecisions((ds) => ds.filter((x) => x.id !== d.id))
                      }}
                      className="text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100 print:hidden"
                    >
                      ✕
                    </button>
                  </label>
                ))}
                <span className="inline-flex items-center gap-1 print:hidden">
                  <input
                    value={newDecision}
                    onChange={(e) => setNewDecision(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDecision()}
                    placeholder="Add a decision…"
                    className="w-52 rounded-lg border border-dashed border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button onClick={addDecision} className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white">
                    +
                  </button>
                </span>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
