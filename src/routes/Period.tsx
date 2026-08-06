import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Mail } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import { confirmDelete } from '../lib/confirm'
import { laborRangeFor } from '../lib/laborRange'
import { coverageFor, categoryTotals, type Coverage, type Grain } from '../lib/coverage'
import { dowAverages, projectDay, periodWeek, periodStart } from '../lib/forecast'
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

/**
 * Period review — the owner one-pager (prototype): builds ITSELF from the
 * nightly closes. Navy summary, four week cards, WORKING / WATCH bullets,
 * Print or send.
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
  const pStart = periodStart(t)
  const pEnd = shiftDays(pStart, 27)

  const byDate = useMemo(() => new Map(nights.map((n) => [n.date, n])), [nights])
  const inPeriod = nights
    .filter((n) => n.date >= pStart && n.date <= (pEnd < t ? pEnd : t))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const netToDate = inPeriod.reduce((s, n) => s + n.netSales, 0)
  // Labor % over nights that have BOTH labor and net (never total labor ÷ a
  // smaller net from days that only imported sales — that inflates the rate).
  const laborNights = inPeriod.filter((n) => (n.labor ?? 0) > 0 && n.netSales > 0)
  const laborSum = laborNights.reduce((s, n) => s + (n.labor ?? 0), 0)
  const laborNet = laborNights.reduce((s, n) => s + n.netSales, 0)
  const laborPct = laborNet > 0 && laborSum > 0 ? (laborSum / laborNet) * 100 : null
  // A range labor export covering this period is the REAL period rate (Toast's
  // own total for the span). Prefer it over a rate stitched from partial nights.
  const rangeLabor = useMemo(() => laborRangeFor(pStart, pEnd < t ? pEnd : t), [pStart, pEnd, t])
  // What the app actually has for this period, and at what grain — drives the
  // category card and the "What's on file" panel below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cov = useMemo(() => coverageFor(pStart, pEnd), [pStart, pEnd, nights.length])
  const periodLaborPct = rangeLabor?.pct ?? laborPct
  const laborFromRange = rangeLabor?.pct != null
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
    const labWn = wn.filter((n) => (n.labor ?? 0) > 0 && n.netSales > 0)
    const lab = labWn.reduce((s, n) => s + (n.labor ?? 0), 0)
    const labNet = labWn.reduce((s, n) => s + n.netSales, 0)
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
      laborPct: labNet > 0 && lab > 0 ? (lab / labNet) * 100 : null,
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
                    {periodLaborPct != null && (
                      <span
                        title={laborFromRange ? `Toast's own labor total for ${rangeLabor?.start} → ${rangeLabor?.end}` : undefined}
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${periodLaborPct <= targets.laborPct ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}
                      >
                        Labor {periodLaborPct.toFixed(1)}% · goal {targets.laborPct}% {periodLaborPct <= targets.laborPct ? '✓' : '▲'}
                        {laborFromRange && <span className="ml-1 opacity-75">· period total</span>}
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
                      {/* Up or down vs last year — the headline for the week, always
                          shown so a blank never reads as "flat". */}
                      <div
                        className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                          w.vsLy == null
                            ? 'bg-white/[0.06] text-muted'
                            : w.vsLy >= 0
                              ? 'bg-up/15 text-up'
                              : 'bg-down/15 text-down'
                        }`}
                      >
                        {w.vsLy == null ? (
                          'vs LY — no data'
                        ) : (
                          <>
                            {w.vsLy >= 0 ? '▲' : '▼'} {w.vsLy >= 0 ? '+' : '−'}
                            {Math.abs(w.vsLy).toFixed(1)}% vs LY
                          </>
                        )}
                      </div>
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
                      </div>
                    </>
                  )}
                </Card>
              ))}
            </div>

            <SalesCategory cov={cov} start={pStart} end={pEnd} />
            <WhatsOnFile cov={cov} />

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

          </>
        )}
      </div>
    </>
  )
}

/**
 * Sales by category for the period — the REAL totals from Toast's category
 * summary, shown against the span they were imported for. A date-range export
 * only carries a period-wide category total, so that's exactly how it's
 * presented: no per-night split, no invented detail.
 */
function SalesCategory({ cov, start, end }: { cov: Coverage; start: string; end: string }) {
  const mix = cov.catMix
  const rows = useMemo(() => (mix && mix.net > 0 ? categoryTotals(mix) : []), [mix])
  if (!mix || rows.length === 0) {
    return (
      <Card className="p-5">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Sales by category</div>
        <p className="mt-2 text-sm text-muted text-pretty">
          Not imported yet. Drop a Toast <b>Sales Summary</b> on Imports — its “Sales category summary” fills this in.
        </p>
      </Card>
    )
  }

  const total = rows.reduce((s, r) => s + r.net, 0)
  const max = Math.max(...rows.map((r) => r.net))
  // Say plainly when the imported span isn't this period — the number is still
  // real, it just belongs to different dates.
  const spanNote =
    mix.from && mix.to
      ? cov.catMixCovers
        ? `${fmtMD(mix.from)} – ${fmtMD(mix.to)}`
        : `imported for ${fmtMD(mix.from)} – ${fmtMD(mix.to)} — not this period (${fmtMD(start)} – ${fmtMD(end)})`
      : 'span not stated in the export'

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Sales by category</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
          period total
        </span>
        <span className="text-[11px] text-muted">{spanNote}</span>
        {/* When the mix belongs to other dates, its total is NOT this period's
            number — keep it visibly secondary so it can't be misread. */}
        <span
          className={`ml-auto font-display text-lg font-semibold tabular-nums ${
            cov.catMixCovers ? 'text-ink' : 'text-muted'
          }`}
        >
          {money(total)}
          {!cov.catMixCovers && <span className="ml-1 text-[11px] font-normal">for that span</span>}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
            <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.max(2, (r.net / max) * 100)}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-sm text-muted tabular-nums">
              {money(r.net)} <span className="text-ink/70">· {r.pct.toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted text-pretty">
        Toast reports categories for the whole span, not per night — so this is the period figure, not a nightly one.
        Drop a single-day Sales Summary to get a category breakdown for that night.
      </p>
    </Card>
  )
}

/**
 * What's on file — the honest inventory of this period's data and its grain.
 *
 * Written for the first week at a NEW store: a backlog import is mostly
 * date-range exports, so some things land per-night and some only as period
 * totals. Saying which is which up front is the difference between "the app
 * knows what it has" and "these numbers look wrong."
 */
function WhatsOnFile({ cov }: { cov: Coverage }) {
  const chip = (grain: Grain, text: string) => {
    const tone =
      grain === 'nightly'
        ? 'bg-up/15 text-up'
        : grain === 'period'
          ? 'bg-brand/15 text-brand-600'
          : grain === 'partial'
            ? 'bg-warn/15 text-warn'
            : 'bg-white/[0.06] text-muted'
    return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{text}</span>
  }

  const rows: { label: string; grain: Grain; chip: string; note: string }[] = [
    {
      label: 'Sales',
      grain: cov.salesGrain,
      chip:
        cov.salesGrain === 'none' ? 'none yet' : `${cov.salesDays} of ${cov.days} night${cov.days === 1 ? '' : 's'}`,
      note: cov.salesGrain === 'nightly' ? 'every night, per night' : 'per night — drop the missing days to complete it',
    },
    {
      label: 'Labor',
      grain: cov.laborGrain,
      chip:
        cov.laborGrain === 'period'
          ? 'period total'
          : cov.laborGrain === 'none'
            ? 'none yet'
            : `${cov.laborDays} of ${cov.days} nights`,
      note:
        cov.laborGrain === 'period'
          ? `Toast's own total for ${cov.laborRange ? `${fmtMD(cov.laborRange.start)} – ${fmtMD(cov.laborRange.end)}` : 'the imported span'} — real, but not split by night`
          : cov.laborGrain === 'none'
            ? 'drop a Labor cost breakdown export'
            : 'per night, from single-day exports',
    },
    {
      label: 'Sales category',
      grain: cov.categoryGrain,
      chip: cov.categoryGrain === 'period' ? 'period total' : 'none yet',
      note:
        cov.categoryGrain === 'period'
          ? cov.catMixCovers
            ? 'covers this period'
            : 'imported for a different span'
          : 'comes with the Sales Summary',
    },
    {
      label: 'Product mix',
      grain: cov.pmixGrain,
      chip: cov.pmixGrain === 'none' ? 'none yet' : `${cov.pmixDays} of ${cov.days} days`,
      note: cov.pmixGrain === 'none' ? 'drop a PMIX export' : 'per day, per item',
    },
  ]

  return (
    <Card className="p-5">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">What&rsquo;s on file · this period</div>
      <p className="mt-1 text-xs text-muted text-pretty">
        Toast sends some reports per night and some as one total for a whole span. Nothing here is estimated — each line
        says what was imported and at what level.
      </p>
      <div className="mt-3 divide-y divide-white/[0.06]">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="w-32 shrink-0 text-sm font-semibold text-ink">{r.label}</span>
            {chip(r.grain, r.chip)}
            <span className="min-w-0 flex-1 text-xs text-muted">{r.note}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
