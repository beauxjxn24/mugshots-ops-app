import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Mail, Check, FileDown } from 'lucide-react'
import { periodWeek } from '../lib/forecast'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import { catMixSplit, type Night, type BreakdownRow } from '../lib/nightly'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { DEFAULT_USERS, type User } from '../lib/users'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const money2 = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const int = (n: number) => (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const f = (s: string) => parseFloat(s) || 0

/**
 * Nightly Numbers — a clean, read-only mirror of the four Toast reports the
 * manager closes on: Net Sales Summary, Sales Category Summary, Dining Option
 * Summary, and Discount Summary. Everything on these cards is imported (drop the
 * Toast export on Imports) — nothing is typed. The only manual step left is
 * counting the drawer, so the Over/Under can reconcile itself.
 */
export function Nightly() {
  const [rawLog, setLog] = usePersistentState<Night[]>('nightly:log', [])
  const log = Array.isArray(rawLog) ? rawLog : []
  const [targets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  const [params] = useSearchParams()
  const focusDate = params.get('date')

  const sorted = useMemo(() => [...log].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [log])
  const byDate = useMemo(() => new Map(log.map((n) => [n.date, n])), [log])
  // The night on screen: a deep-linked date, else the most recent logged night.
  const [date, setDate] = useState<string>(() => focusDate ?? sorted[0]?.date ?? today())
  // Follow the newest night automatically — until the manager deliberately picks
  // a date — so a fresh import shows on sight instead of leaving the page pinned
  // to whatever was latest when it first loaded.
  const picked = useRef(false)
  const latestDate = sorted[0]?.date
  useEffect(() => {
    if (!picked.current && !focusDate && latestDate && latestDate !== date) setDate(latestDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestDate, focusDate])
  const chooseDate = (d: string) => {
    if (!d) return
    picked.current = true
    setDate(d)
  }
  const vn = byDate.get(date) ?? null

  // The only manual entry left — the counted drawer + a note. Loaded from the
  // viewed night, editable, saved back onto it.
  const [cash, setCash] = useState('')
  const [notes, setNotes] = useState('')
  useEffect(() => {
    setCash(vn?.deposit ? String(Math.round(vn.deposit * 100) / 100) : '')
    setNotes(vn?.notes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, vn?.id])

  useEffect(() => {
    if (!focusDate) return
    const el = document.getElementById(`night-${focusDate}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusDate])

  const [lookup, setLookup] = useState('')
  const [showAll, setShowAll] = useState(false)

  const net = vn?.netSales ?? 0
  const gross = vn?.gross ?? 0
  const laborPct = vn?.laborPct ?? (vn?.labor && net > 0 ? (vn.labor / net) * 100 : 0)
  const expected = vn?.expected
  const overUnder = cash !== '' && expected != null ? Math.round((f(cash) - expected) * 100) / 100 : null

  const pw = periodWeek(date)
  const weekTotal = useMemo(() => sorted.slice(0, 7).reduce((s, n) => s + n.netSales, 0), [sorted])

  const shiftD = (isoDate: string, delta: number) => {
    const [y, m, d] = (isoDate ?? '').split('-').map(Number)
    const dt = new Date(y, m - 1, d + delta)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }
  const lyNight = byDate.get(shiftD(date, -364)) ?? null
  const lwNight = byDate.get(shiftD(date, -7)) ?? null
  const cmpNight = lyNight ?? lwNight

  const saveDrawer = () => {
    if (!vn) return
    const overUnderVal =
      cash !== '' && expected != null ? Math.round((f(cash) - expected) * 100) / 100 : vn.overUnder
    const updated: Night = {
      ...vn,
      deposit: f(cash),
      notes: notes.trim(),
      overUnder: overUnderVal,
    }
    setLog((l) => l.map((x) => (x.date === date ? updated : x)))
  }

  const visibleNights = useMemo(() => {
    if (lookup) return sorted.filter((n) => n.date === lookup)
    if (showAll) return sorted
    const recent = sorted.slice(0, 7)
    if (focusDate && !recent.some((n) => n.date === focusDate)) {
      const focused = sorted.find((n) => n.date === focusDate)
      if (focused) return [...recent, focused]
    }
    return recent
  }, [sorted, lookup, showAll, focusDate])

  return (
    <>
      <PageHeader
        title="Nightly Numbers"
        subtitle={`Period ${pw.period} · Week ${pw.week} · last 7 nights ${money(weekTotal)} net`}
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[10px] font-extrabold text-brand-600">
              Labor ≤ {targets.laborPct}%
            </span>
            <span className="rounded-full bg-navy px-2.5 py-1 text-[10px] font-extrabold text-white">
              Growth +{targets.growthPct}% vs LY
            </span>
            <Link to="/period" className="ml-1 text-xs font-bold text-brand">
              Period review →
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Date selector — which night's reports are on screen */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-sans text-2xl font-bold tracking-tight text-ink">{fmtDate(date)}</div>
            <div className="text-xs font-medium text-muted">
              {vn ? 'Imported from Toast — read-only' : 'No reports imported for this day yet'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sorted.some((n) => n.date === date) ? date : ''}
              onChange={(e) => e.target.value && chooseDate(e.target.value)}
              className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs font-semibold text-ink outline-none focus:border-brand"
            >
              {!sorted.some((n) => n.date === date) && <option value="">{fmtDate(date)}</option>}
              {sorted.map((n) => (
                <option key={n.date} value={n.date}>
                  {fmtDate(n.date)} · {money(n.netSales)}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && chooseDate(e.target.value)}
              className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs font-semibold outline-none focus:border-brand"
            />
          </div>
        </div>

        {!vn ? (
          <Card className="p-10 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
              <FileDown size={24} />
            </div>
            <div className="font-sans text-lg font-bold text-ink">Nothing to show for {fmtDate(date)}</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">
              Export the day's reports from Toast and drop them on the Imports screen — the four
              summaries fill themselves here.
            </p>
            <Link
              to="/imports"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white"
            >
              <FileDown size={15} /> Go to Imports
            </Link>
          </Card>
        ) : (
          <>
            {/* vs last year / last week */}
            {cmpNight && cmpNight.netSales > 0 && net > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm shadow-[0_10px_30px_-22px_rgba(23,32,55,0.3)]">
                <span className="font-semibold text-muted">
                  Net vs last {lyNight ? 'year' : 'week'} ·{' '}
                  {fmtDate(lyNight ? shiftD(date, -364) : shiftD(date, -7)).split(',')[0]}{' '}
                  {money(cmpNight.netSales)}
                </span>
                <span className={`font-bold ${net >= cmpNight.netSales ? 'text-up' : 'text-down'}`}>
                  {net >= cmpNight.netSales ? '▲ +' : '▼ −'}
                  {Math.abs(((net - cmpNight.netSales) / cmpNight.netSales) * 100).toFixed(1)}% ·{' '}
                  {net >= cmpNight.netSales ? '+' : '−'}
                  {money(Math.abs(net - cmpNight.netSales))}
                </span>
              </div>
            )}

            {/* Net Sales + Labor */}
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              <NetSalesCard n={vn} />
              <ReportCard title="Labor" subtitle={`target ≤ ${targets.laborPct}% of net`}>
                <div>
                  <LineRow label="Net sales" value={money2(net)} zebra />
                  <LineRow label="Labor cost" value={vn.labor != null ? money2(vn.labor) : '—'} />
                  <div className="flex items-baseline justify-between border-t border-white/10 px-4 py-3">
                    <span className="font-sans text-base font-bold text-ink">Labor %</span>
                    <span
                      className={`font-sans text-2xl font-bold tabular-nums ${
                        laborPct === 0 ? 'text-muted' : laborPct <= targets.laborPct ? 'text-up' : 'text-down'
                      }`}
                    >
                      {laborPct > 0 ? `${laborPct.toFixed(2)}%` : '—'}
                    </span>
                  </div>
                </div>
                {vn.labor == null && (
                  <p className="px-4 pb-3 text-[11px] text-muted">Drop the Toast <b>Labor</b> report on Imports to fill this.</p>
                )}
              </ReportCard>
            </div>

            {/* Wide expandable breakdowns */}
            <CategoryCard n={vn} />
            <DiningCard n={vn} />

            {/* Discount + Cash */}
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              <DiscountCard n={vn} />
              {vn.cash ? (
                <CashCard n={vn} />
              ) : (
                <ReportCard title="Cash Summary" subtitle="count the drawer">
                  <div>
                    <LineRow label="Expected cash (POS)" value={expected != null ? money2(expected) : '—'} zebra />
                    <label className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-sm font-semibold text-ink">Actual cash counted</span>
                      <span className="w-36 shrink-0">
                        <MoneyInput value={cash} onChange={setCash} allowNegative highlight />
                      </span>
                    </label>
                    {overUnder != null && (
                      <div className="flex items-baseline justify-between border-t border-white/10 px-4 py-3">
                        <span className="font-sans text-base font-bold text-ink">Over / Under</span>
                        <span className={`font-sans text-2xl font-bold tabular-nums ${Math.abs(overUnder) < 5 ? 'text-up' : 'text-down'}`}>
                          {overUnder >= 0 ? '+' : '−'}${Math.abs(overUnder).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  {expected == null && (
                    <p className="px-4 pb-3 text-[11px] text-muted">Drop the Toast <b>Cash summary</b> on Imports and this whole card fills itself.</p>
                  )}
                </ReportCard>
              )}
            </div>

            {/* Notes + save the night */}
            <Card className="p-4">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes — weather, events, callouts, 86'd items…"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button onClick={saveDrawer} className="mt-3 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white">
                Save night ✓
              </button>
            </Card>
          </>
        )}

        <NightlyLog log={log} targets={targets} initialDate={focusDate ?? undefined} />

        {sorted.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-black/[0.02] px-4 py-3">
              <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Night history</span>
              <span className="text-[11px] text-muted">
                {lookup
                  ? `showing ${fmtDate(lookup)}`
                  : showAll
                    ? `all ${sorted.length} nights`
                    : `last 7 of ${sorted.length} — older nights are tucked away`}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="date"
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value)}
                  title="Jump to any saved night by date"
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
                {lookup ? (
                  <button
                    onClick={() => setLookup('')}
                    className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink"
                  >
                    Back to recent
                  </button>
                ) : (
                  <button
                    onClick={() => setShowAll((v) => !v)}
                    className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink"
                  >
                    {showAll ? 'Show recent' : `Show all (${sorted.length})`}
                  </button>
                )}
              </div>
            </div>
            {visibleNights.length === 0 && <p className="p-4 text-sm text-muted">No night saved for that date.</p>}
            {visibleNights.map((n) => {
              const lp = n.laborPct ?? (n.labor && n.netSales ? (n.labor / n.netSales) * 100 : 0)
              const focused = n.date === focusDate
              return (
                <div
                  key={n.id}
                  id={`night-${n.date}`}
                  onClick={() => {
                    chooseDate(n.date)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  title="Open this night's reports above"
                  className={`cursor-pointer border-b border-black/5 p-4 last:border-0 hover:bg-brand/5 ${
                    focused || n.date === date ? 'bg-brand/5 ring-2 ring-inset ring-brand' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-ink">{fmtDate(n.date)}</span>
                    <span className="font-sans text-lg font-bold tabular-nums text-brand">{money(n.netSales)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                    {n.gross != null && <span>gross {money(n.gross)}</span>}
                    {lp > 0 && (
                      <span className={lp <= targets.laborPct ? 'text-up' : 'text-down'}>labor {lp.toFixed(1)}%</span>
                    )}
                    {n.overUnder != null && (
                      <span className={Math.abs(n.overUnder) < 5 ? '' : 'text-down'}>
                        drawer {n.overUnder >= 0 ? '+' : ''}
                        {money2(n.overUnder)}
                      </span>
                    )}
                    {n.covers > 0 && <span>{n.covers} covers</span>}
                    {(n.togo ?? 0) > 0 && <span>togo {money(n.togo!)}</span>}
                  </div>
                  {(n.food ?? 0) > 0 && <CatBar n={n} />}
                  {n.notes && <div className="mt-1 text-sm text-ink/70">{n.notes}</div>}
                </div>
              )
            })}
          </Card>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Toast-style report cards — clean header, zebra rows, bold total.
// ---------------------------------------------------------------------------

function ReportCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-baseline justify-between gap-2 bg-navy px-4 py-2.5">
        <h3 className="font-sans text-sm font-bold tracking-wide text-white">{title}</h3>
        {subtitle && <span className="text-[11px] font-medium text-white/55">{subtitle}</span>}
      </div>
      {children}
    </Card>
  )
}

/** A single label→value line (Net Sales + Cash cards), zebra-striped. */
function LineRow({ label, value, tone, strong, zebra, info }: { label: string; value: string; tone?: 'blue' | 'muted' | 'up' | 'down'; strong?: boolean; zebra?: boolean; info?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-4 py-2.5 ${zebra ? 'bg-white/[0.02]' : ''}`}>
      <span className={`flex items-center gap-1.5 text-sm ${strong ? 'font-bold text-ink' : 'text-ink/85'}`}>
        {label}
        {info && <span className="grid size-3.5 place-items-center rounded-full border border-white/25 text-[8px] text-muted">i</span>}
      </span>
      <span
        className={`font-sans tabular-nums ${strong ? 'text-lg font-bold' : 'text-sm font-semibold'} ${
          tone === 'blue' ? 'text-[#7aa2ff]' : tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'muted' ? 'text-muted' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

const dh = 'px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-wide text-muted'
const dc = 'px-3 py-2 text-right font-sans tabular-nums'

/** Net Sales Summary — Gross − discounts − refunds = Net (blue negatives). */
function NetSalesCard({ n }: { n: Night }) {
  const discounts =
    n.salesDiscounts ??
    ((n.dineBreakdown?.reduce((s, r) => s + r.disc, 0)) ||
      (n.discountLines?.reduce((s, l) => s + l.amount, 0) ||
        (n.rewards ?? 0) + (n.promos ?? 0) + (n.comps ?? 0) + (n.staffDisc ?? 0)))
  const refunds = n.refunds ?? 0
  const gross = n.gross ?? n.netSales + discounts + refunds
  return (
    <ReportCard title="Net Sales Summary">
      <div>
        <LineRow label="Gross sales" value={money2(gross)} info />
        <LineRow label="Sales discounts" value={discounts > 0 ? `−${money2(discounts)}` : money2(0)} tone="blue" zebra />
        <LineRow label="Sales refunds" value={refunds > 0 ? `−${money2(refunds)}` : money2(0)} tone="blue" />
      </div>
      <div className="border-t border-white/10">
        <LineRow label="Net sales" value={money2(n.netSales)} strong />
      </div>
    </ReportCard>
  )
}

/** Expandable Toast breakdown table (Category or Dining), with the `>` rows. */
function BreakdownCard({ title, firstCol, rows, empty }: { title: string; firstCol: string; rows: BreakdownRow[]; empty: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (name: string) =>
    setOpen((p) => { const s = new Set(p); s.has(name) ? s.delete(name) : s.add(name); return s })
  const tot = rows.reduce((a, r) => ({ qty: a.qty + r.qty, net: a.net + r.net, disc: a.disc + r.disc, gross: a.gross + r.gross, tax: a.tax + r.tax }), { qty: 0, net: 0, disc: 0, gross: 0, tax: 0 })
  return (
    <ReportCard title={title}>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-2 text-left text-[10px] font-extrabold uppercase tracking-wide text-muted">{firstCol}</th>
                <th className={dh}>Item Qty</th>
                <th className={dh}>Net Sales</th>
                <th className={dh}>Discount</th>
                <th className={dh}>Gross Sales</th>
                <th className={`${dh} pr-4`}>Tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const kids = r.children ?? []
                const isOpen = open.has(r.name)
                return (
                  <Fragment key={r.name}>
                    <tr
                      onClick={() => kids.length && toggle(r.name)}
                      className={`border-b border-white/5 ${kids.length ? 'cursor-pointer hover:bg-white/[0.04]' : ''} ${ri % 2 ? 'bg-white/[0.02]' : ''}`}
                    >
                      <td className="px-4 py-2 text-ink/90">
                        <span className="inline-flex items-center gap-1.5">
                          {kids.length ? (
                            <span className={`text-[9px] text-signal transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                          ) : (
                            <span className="inline-block w-[9px]" />
                          )}
                          {r.name}
                        </span>
                      </td>
                      <td className={`${dc} text-ink`}>{int(r.qty)}</td>
                      <td className={`${dc} text-ink`}>{money2(r.net)}</td>
                      <td className={`${dc} ${r.disc > 0 ? 'text-[#7aa2ff]' : 'text-muted'}`}>{money2(r.disc)}</td>
                      <td className={`${dc} text-ink`}>{money2(r.gross)}</td>
                      <td className={`${dc} pr-4 text-muted`}>{money2(r.tax)}</td>
                    </tr>
                    {isOpen &&
                      kids.map((k) => (
                        <tr key={r.name + k.name} className="border-b border-white/5 bg-black/25 text-[13px]">
                          <td className="py-1.5 pl-9 pr-4 text-muted">{k.name}</td>
                          <td className={`${dc} py-1.5 text-muted`}>{int(k.qty)}</td>
                          <td className={`${dc} py-1.5 text-ink/70`}>{money2(k.net)}</td>
                          <td className={`${dc} py-1.5 ${k.disc > 0 ? 'text-[#7aa2ff]' : 'text-muted'}`}>{k.disc > 0 ? money2(k.disc) : ''}</td>
                          <td className={`${dc} py-1.5 text-ink/70`}>{money2(k.gross)}</td>
                          <td className={`${dc} py-1.5 pr-4 text-muted`}>{money2(k.tax)}</td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/15 bg-white/[0.04] font-bold text-ink">
                <td className="px-4 py-2.5">Total</td>
                <td className={`${dc}`}>{int(tot.qty)}</td>
                <td className={`${dc}`}>{money2(tot.net)}</td>
                <td className={`${dc}`}>{money2(tot.disc)}</td>
                <td className={`${dc}`}>{money2(tot.gross)}</td>
                <td className={`${dc} pr-4`}>{money2(tot.tax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportCard>
  )
}

/** Category rows for the card — prefer the rich breakdown, else legacy fields. */
function categoryRowsFor(n: Night): BreakdownRow[] {
  if (n.catBreakdown?.length) return n.catBreakdown
  if (n.categoryRows?.length) return n.categoryRows.map((c) => ({ name: c.name, qty: c.items, net: c.net, disc: 0, gross: c.gross, tax: 0 }))
  const split: [string, number][] = [['Food', n.food ?? 0], ['NA Beverage', n.na ?? 0], ['Liquor', n.liquor ?? 0], ['Beer', n.beer ?? 0], ['Wine', n.wine ?? 0]]
  return split.filter(([, v]) => v > 0).map(([name, net]) => ({ name, qty: 0, net, disc: 0, gross: 0, tax: 0 }))
}
function diningRowsFor(n: Night): BreakdownRow[] {
  if (n.dineBreakdown?.length) return n.dineBreakdown
  if (n.diningRows?.length) return n.diningRows.map((d) => ({ name: d.name, qty: d.orders, net: d.net, disc: 0, gross: d.gross, tax: 0 }))
  return []
}
function CategoryCard({ n }: { n: Night }) {
  return <BreakdownCard title="Sales by Sales Category" firstCol="Sales Category" rows={categoryRowsFor(n)} empty="Drop the Toast Sales breakdown (or Sales category summary) on Imports to fill this." />
}
function DiningCard({ n }: { n: Night }) {
  return <BreakdownCard title="Sales by Dining Option" firstCol="Dining Option" rows={diningRowsFor(n)} empty="Drop the Toast Sales breakdown (or Dining options summary) on Imports to fill this." />
}

/** Discount Summary — Discount Name · Count · Amount · % of net. */
function DiscountCard({ n }: { n: Night }) {
  const lines = useMemo(() => {
    if (n.discountLines?.length) return n.discountLines.map((l) => ({ name: l.name, count: l.count, amount: l.amount }))
    const buckets: [string, number][] = [['Rewards', n.rewards ?? 0], ['Promos', n.promos ?? 0], ['Comps', n.comps ?? 0], ['Staff meals', n.staffDisc ?? 0]]
    return buckets.filter(([, v]) => v > 0).map(([name, amount]) => ({ name, count: undefined as number | undefined, amount }))
  }, [n])
  const net = n.netSales || 1
  const totAmt = lines.reduce((s, l) => s + l.amount, 0)
  const totCount = lines.reduce((s, l) => s + (l.count ?? 0), 0)
  return (
    <ReportCard title="Discount Summary">
      {lines.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted">Drop the Toast Menu item / Check discounts on Imports to fill this.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-2 text-left text-[10px] font-extrabold uppercase tracking-wide text-muted">Discount Name</th>
                <th className={dh}>Count</th>
                <th className={dh}>Discount Amount</th>
                <th className={`${dh} pr-4`}>% of Net</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.name + i} className={`border-b border-white/5 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                  <td className="px-4 py-2 text-ink/90">{l.name}</td>
                  <td className={`${dc} text-ink`}>{l.count != null ? int(l.count) : '—'}</td>
                  <td className={`${dc} text-ink`}>{money2(l.amount)}</td>
                  <td className={`${dc} pr-4 text-muted`}>{((l.amount / net) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/15 bg-white/[0.04] font-bold text-ink">
                <td className="px-4 py-2.5">Total</td>
                <td className={dc}>{int(totCount)}</td>
                <td className={dc}>{money2(totAmt)}</td>
                <td className={`${dc} pr-4`}>{((totAmt / net) * 100).toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportCard>
  )
}

/** Cash Summary — Toast's six rows (closeout + deposit + over/short). */
function CashCard({ n }: { n: Night }) {
  const c = n.cash
  if (!c) return null
  const os = (v: number) => (v === 0 ? 'muted' : v > 0 ? 'up' : 'down') as 'muted' | 'up' | 'down'
  return (
    <ReportCard title="Cash Summary">
      <div>
        <LineRow label="Expected closeout cash" value={money2(c.expClose)} info zebra />
        <LineRow label="Actual closeout cash" value={money2(c.actClose)} info />
        <LineRow label="Cash overage / shortage" value={money2(c.cashOS)} tone={os(c.cashOS)} zebra />
        <LineRow label="Expected deposit" value={money2(c.expDep)} info />
        <LineRow label="Actual deposit" value={money2(c.actDep)} info zebra />
        <LineRow label="Deposit overage / shortage" value={`${c.depOS >= 0 ? '+' : '−'}${money2(Math.abs(c.depOS))}`} tone={os(c.depOS)} strong />
      </div>
    </ReportCard>
  )
}

// ---- Nightly Log — the single shift-notes home; composes the manager email ----

interface LogEntry {
  mod: string
  recap: string
  kitchen: string
  staffing: string
  maintenance: string
  comps: string
  wins: string
}
const EMPTY_LOG: LogEntry = { mod: '', recap: '', kitchen: '', staffing: '', maintenance: '', comps: '', wins: '' }
const LOG_FIELDS: Array<{ key: keyof LogEntry; label: string; ph: string }> = [
  { key: 'recap', label: 'Shift recap', ph: 'How did the night go?' },
  { key: 'kitchen', label: 'Kitchen', ph: '86’d items, ticket times, food notes…' },
  { key: 'staffing', label: 'Staffing', ph: 'Callouts, cuts, who crushed it…' },
  { key: 'maintenance', label: 'Maintenance', ph: 'Anything broken or fixed…' },
  { key: 'comps', label: 'Comps / voids', ph: 'What was comped and why…' },
  { key: 'wins', label: 'Wins', ph: 'Big tables, reviews, milestones…' },
]

function NightlyLog({ log, targets, initialDate }: { log: Night[]; targets: Targets; initialDate?: string }) {
  const [entries, setEntries] = usePersistentState<Record<string, LogEntry>>('nightlog:entries', {})
  const [sent, setSent] = usePersistentState<Record<string, { lunch?: string; dinner?: string }>>('nightlog:sent', {})
  const [users] = usePersistentState<User[]>('users:list', DEFAULT_USERS)
  const [date, setDate] = useState(initialDate ?? today())
  const { concept, location } = useCurrentNames()

  const entry = entries[date] ?? EMPTY_LOG
  const setField = (k: keyof LogEntry, v: string) =>
    setEntries((e) => ({ ...e, [date]: { ...(e[date] ?? EMPTY_LOG), [k]: v } }))

  const todaySent = sent[today()] ?? {}

  const compose = async (meal: 'lunch' | 'dinner') => {
    const n = log.find((x) => x.date === date)
    const weekNet = log
      .filter((x) => x.date <= date)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 7)
      .reduce((s, x) => s + x.netSales, 0)
    const lp = n?.laborPct ?? (n?.labor && n.netSales ? (n.labor / n.netSales) * 100 : undefined)

    const lines: string[] = [
      `${concept} · ${location} — ${meal === 'lunch' ? 'Lunch' : 'Nightly'} recap, ${fmtDate(date)}`,
      entry.mod ? `MOD: ${entry.mod}` : '',
      '',
    ]
    if (n) {
      lines.push('— The numbers —')
      if (n.gross != null) lines.push(`Gross: ${money2(n.gross)}`)
      lines.push(`Net: ${money2(n.netSales)}`)
      lines.push(`Week net (7 nights): ${money2(weekNet)}`)
      if (n.labor != null) lines.push(`Labor: ${money2(n.labor)}${lp ? ` (${lp.toFixed(1)}% — target ≤ ${targets.laborPct}%)` : ''}`)
      if (n.deposit > 0) lines.push(`Deposit: ${money2(n.deposit)}`)
      if (n.overUnder != null) lines.push(`Drawer over/under: ${n.overUnder >= 0 ? '+' : ''}${money2(n.overUnder)}`)
      lines.push('')
    } else {
      lines.push('(No numbers saved for this date yet — see Nightly Numbers.)', '')
    }
    for (const fld of LOG_FIELDS) {
      const v = entry[fld.key].trim()
      if (v) lines.push(`— ${fld.label} —`, v, '')
    }
    const body = lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
    const subject = `${location} ${meal === 'lunch' ? 'lunch' : 'nightly'} recap — ${fmtDate(date)}`

    try {
      await navigator.clipboard.writeText(body)
    } catch {
      /* clipboard unavailable — mailto still carries the body */
    }
    const stamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    setSent((s) => ({ ...s, [date]: { ...(s[date] ?? {}), [meal]: stamp } }))
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-ink">Nightly Log</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${todaySent.lunch ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'}`}>
          LUNCH {todaySent.lunch ? `✓ ${todaySent.lunch}` : '· due'}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${todaySent.dinner ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'}`}>
          DINNER {todaySent.dinner ? `✓ ${todaySent.dinner}` : '· due'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
          />
          <select
            value={entry.mod}
            onChange={(e) => setField('mod', e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
          >
            <option value="">MOD…</option>
            {users.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {LOG_FIELDS.map((f2) => (
          <label key={f2.key} className="block">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">{f2.label}</span>
            <textarea
              value={entry[f2.key]}
              onChange={(e) => setField(f2.key, e.target.value)}
              placeholder={f2.ph}
              rows={2}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => compose('lunch')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink"
        >
          {todaySent.lunch ? <Check size={14} className="text-up" /> : <Mail size={14} />} Lunch email
        </button>
        <button
          onClick={() => compose('dinner')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          {todaySent.dinner ? <Check size={14} /> : <Mail size={14} />} Dinner email
        </button>
        <span className="self-center text-xs text-muted">
          Builds the full recap with tonight's numbers, copies it, and opens your mail app.
        </span>
      </div>
    </Card>
  )
}

/** Thin category mix bar: food / beer / liquor / wine / N-A. */
function CatBar({ n }: { n: Night }) {
  const parts = [
    { v: n.food ?? 0, c: '#E4B84C', l: 'Food' },
    { v: n.beer ?? 0, c: '#F0A94C', l: 'Beer' },
    { v: n.liquor ?? 0, c: '#F472B6', l: 'Liquor' },
    { v: n.wine ?? 0, c: '#A78BFA', l: 'Wine' },
    { v: n.na ?? 0, c: '#60A5FA', l: 'N/A' },
  ].filter((p) => p.v > 0)
  const total = parts.reduce((s, p) => s + p.v, 0)
  if (total <= 0) return null
  return (
    <div className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full">
      {parts.map((p) => (
        <div key={p.l} title={`${p.l} $${p.v.toFixed(0)}`} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />
      ))}
    </div>
  )
}

function MoneyInput({
  value,
  onChange,
  allowNegative,
  highlight,
}: {
  value: string
  onChange: (v: string) => void
  allowNegative?: boolean
  highlight?: boolean
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
      <input
        type="number"
        inputMode="decimal"
        min={allowNegative ? undefined : 0}
        value={value}
        placeholder="0.00"
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md py-1.5 pl-6 pr-3 text-right font-mono text-sm tabular-nums outline-none transition-colors placeholder:text-muted/40 ${
          highlight ? 'border border-up/50 bg-up/5 focus:border-up' : 'border border-black/10 bg-white focus:border-brand'
        }`}
      />
    </div>
  )
}

function fmtDate(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
