import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Mail, Check } from 'lucide-react'
import { periodWeek } from '../lib/forecast'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import type { Night } from '../lib/nightly'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { DEFAULT_USERS, type User } from '../lib/users'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const money2 = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Form = {
  date: string
  gross: string
  // The net Toast reported for the day (authoritative). Toast's "Sales by day"
  // gives net directly with no gross, so we keep it instead of faking gross=net.
  netImported: string
  rewards: string
  promos: string
  comps: string
  staffDisc: string
  labor: string
  deposit: string
  expected: string
  overUnder: string
  covers: string
  notes: string
  food: string
  beer: string
  liquor: string
  wine: string
  na: string
}
const EMPTY: Form = {
  date: today(), gross: '', netImported: '', rewards: '', promos: '', comps: '', staffDisc: '',
  labor: '', deposit: '', expected: '', overUnder: '', covers: '', notes: '',
  food: '', beer: '', liquor: '', wine: '', na: '',
}
const f = (s: string) => parseFloat(s) || 0

/** Build the entry form from a saved night (imported or hand-entered). */
function formFromNight(n: Night): Form {
  return {
    date: n.date,
    // Real gross only — never fake gross = net (Toast's sales-by-day has no gross).
    gross: n.gross != null ? String(n.gross) : '',
    netImported: n.netSales != null ? String(n.netSales) : '',
    rewards: n.rewards != null ? String(n.rewards) : '',
    promos: n.promos != null ? String(n.promos) : '',
    comps: n.comps != null ? String(n.comps) : '',
    staffDisc: n.staffDisc != null ? String(n.staffDisc) : '',
    labor: n.labor != null ? String(n.labor) : '',
    deposit: n.deposit ? String(n.deposit) : '',
    expected: n.expected != null ? String(n.expected) : '',
    overUnder: n.overUnder != null ? String(n.overUnder) : '',
    covers: n.covers ? String(n.covers) : '',
    notes: n.notes ?? '',
    food: n.food != null ? String(n.food) : '',
    beer: n.beer != null ? String(n.beer) : '',
    liquor: n.liquor != null ? String(n.liquor) : '',
    wine: n.wine != null ? String(n.wine) : '',
    na: n.na != null ? String(n.na) : '',
  }
}

/** Where the sheet opens: a deep-linked date, else the most recent logged night
 *  (so a fresh import shows its numbers on sight), else a blank today. */
function initialForm(focusDate: string | null, log: Night[]): Form {
  if (focusDate) {
    const n = log.find((x) => x.date === focusDate)
    return n ? formFromNight(n) : { ...EMPTY, date: focusDate }
  }
  const latest = [...log].filter((n) => n?.date).sort((a, b) => b.date.localeCompare(a.date))[0]
  return latest ? formFromNight(latest) : EMPTY
}

/**
 * Nightly Numbers — the prototype's close-out math, ported:
 * gross − (rewards + promos + comps + staff) = net · labor$ → labor % of net
 * (flagged against the store's target) · deposit over/under.
 */
export function Nightly() {
  const [rawLog, setLog] = usePersistentState<Night[]>('nightly:log', [])
  const log = Array.isArray(rawLog) ? rawLog : []
  const [targets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  // Deep link from the dashboard chart: /nightly?date=YYYY-MM-DD highlights
  // that night's summary (and pre-fills the form if it hasn't been saved yet).
  const [params] = useSearchParams()
  const focusDate = params.get('date')
  const [form, setForm] = useState<Form>(() => initialForm(focusDate, log))
  const [showCats, setShowCats] = useState(false)
  // History stays out of the way: last 7 nights show; anything older is
  // hidden until looked up by date (or expanded).
  const [lookup, setLookup] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!focusDate) return
    const el = document.getElementById(`night-${focusDate}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusDate])

  const discounts = f(form.rewards) + f(form.promos) + f(form.comps) + f(form.staffDisc)
  // Net is what Toast reported (authoritative). Only when there's no imported net
  // — a hand-built night — do we derive it from gross − discounts.
  const net = f(form.netImported) > 0 ? f(form.netImported) : Math.max(0, f(form.gross) - discounts)
  const laborPct = net > 0 && f(form.labor) > 0 ? (f(form.labor) / net) * 100 : 0
  // Deposit reconciles itself: cash counted − expected drawer (POS). The manager
  // types only the counted cash; over/under computes, no mental math.
  const overUnder =
    form.deposit !== '' && form.expected !== '' ? Math.round((f(form.deposit) - f(form.expected)) * 100) / 100 : null
  // A night that arrived from an import/seed (has gross or an imported net) is auto-filled.
  const autoFilled = f(form.gross) > 0 || f(form.netImported) > 0

  const sorted = useMemo(() => [...log].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [log])
  const weekTotal = useMemo(() => sorted.slice(0, 7).reduce((s, n) => s + n.netSales, 0), [sorted])

  // Prototype context: period/week chips + same-day-last-year comparison.
  const pw = periodWeek(form.date)
  const byDate = useMemo(() => new Map(log.map((n) => [n.date, n])), [log])
  const shiftD = (isoDate: string, delta: number) => {
    const [y, m, d] = (isoDate ?? '').split('-').map(Number)
    const dt = new Date(y, m - 1, d + delta)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }
  const lyNight = byDate.get(shiftD(form.date, -364)) ?? null
  const lwNight = byDate.get(shiftD(form.date, -7)) ?? null
  const cmpNight = lyNight ?? lwNight
  const catTotal = f(form.food) + f(form.beer) + f(form.liquor) + f(form.wine) + f(form.na)
  const catDiff = catTotal - net

  // Clicking a history row loads that night back into the sheet for review.
  const loadNight = (n: Night) => {
    setForm(formFromNight(n))
    if ((n.food ?? 0) > 0) setShowCats(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Picking a date jumps to that day: load its saved numbers if we have them,
  // else a blank sheet ready for entry. (The picker used to only relabel the
  // date, leaving the previous day's figures on screen — the "not updating" bug.)
  const pickDate = (d: string) => {
    if (!d) return
    const n = byDate.get(d)
    setForm(n ? formFromNight(n) : { ...EMPTY, date: d })
    setShowCats(!!(n && (n.food ?? 0) > 0))
  }

  // Which history rows are visible right now.
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

  const save = () => {
    if (!form.date || (f(form.gross) === 0 && net === 0)) return
    const n: Night = {
      id: `n${Date.now()}`,
      date: form.date,
      netSales: net,
      deposit: f(form.deposit),
      covers: parseInt(form.covers) || 0,
      notes: form.notes.trim(),
      gross: f(form.gross) || undefined,
      rewards: f(form.rewards) || undefined,
      promos: f(form.promos) || undefined,
      comps: f(form.comps) || undefined,
      staffDisc: f(form.staffDisc) || undefined,
      labor: f(form.labor) || undefined,
      laborPct: laborPct > 0 ? Math.round(laborPct * 100) / 100 : undefined,
      expected: f(form.expected) || undefined,
      overUnder: overUnder != null ? overUnder : undefined,
      food: f(form.food) || undefined,
      beer: f(form.beer) || undefined,
      liquor: f(form.liquor) || undefined,
      wine: f(form.wine) || undefined,
      na: f(form.na) || undefined,
    }
    setLog((l) => [...l.filter((x) => x.date !== form.date), n])
    setForm(EMPTY)
    setShowCats(false)
  }

  return (
    <>
      <PageHeader
        title={`Nightly Numbers · ${fmtDate(form.date)}`}
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
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2.4fr)]">
          {/* SALES + LABOR / DEPOSIT — the prototype's close-out sheet */}
          <div className="space-y-5">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Sales</span>
                  {autoFilled && (
                    <span className="rounded-full bg-up/10 px-2 py-0.5 text-[10px] font-extrabold text-up">auto-filled</span>
                  )}
                </span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => pickDate(e.target.value)}
                  className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-brand"
                />
              </div>
              <SheetRow label="Gross Sales" strong>
                <MoneyInput value={form.gross} onChange={(v) => setForm({ ...form, gross: v })} />
              </SheetRow>
              <SheetRow label="− Rewards">
                <MoneyInput value={form.rewards} onChange={(v) => setForm({ ...form, rewards: v })} />
              </SheetRow>
              <SheetRow label="− Promos">
                <MoneyInput value={form.promos} onChange={(v) => setForm({ ...form, promos: v })} />
              </SheetRow>
              <SheetRow label="− Comps">
                <MoneyInput value={form.comps} onChange={(v) => setForm({ ...form, comps: v })} />
              </SheetRow>
              <SheetRow label="− Staff meals">
                <MoneyInput value={form.staffDisc} onChange={(v) => setForm({ ...form, staffDisc: v })} />
              </SheetRow>
              <SheetRow label="Covers">
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.covers}
                  onChange={(e) => setForm({ ...form, covers: e.target.value })}
                  className={`w-full ${cls()}`}
                />
              </SheetRow>
              <div className="mt-2 flex items-baseline justify-between border-t border-black/10 pt-3">
                <span className="font-display text-lg font-semibold text-ink">Net Sales</span>
                <span className="border-b-[3px] border-brand pb-0.5 font-display text-3xl font-semibold text-ink">
                  {money2(net)}
                </span>
              </div>
              {cmpNight && cmpNight.netSales > 0 && net > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-black/[0.04] px-3 py-2 text-xs">
                  <span className="font-semibold text-muted">
                    vs last {lyNight ? 'year' : 'week'} ({fmtDate(lyNight ? shiftD(form.date, -364) : shiftD(form.date, -7)).split(',')[0]} {money(cmpNight.netSales)})
                  </span>
                  <span className={`font-bold ${net >= cmpNight.netSales ? 'text-up' : 'text-down'}`}>
                    {net >= cmpNight.netSales ? '▲ +' : '▼ −'}
                    {Math.abs(((net - cmpNight.netSales) / cmpNight.netSales) * 100).toFixed(1)}% ·{' '}
                    {net >= cmpNight.netSales ? '+' : '−'}
                    {money(Math.abs(net - cmpNight.netSales))}
                  </span>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-3 text-xs font-extrabold uppercase tracking-wide text-muted">Labor</div>
              <SheetRow label="Labor $">
                <MoneyInput value={form.labor} onChange={(v) => setForm({ ...form, labor: v })} />
              </SheetRow>
              <div className="flex items-baseline justify-between py-1.5">
                <span className="text-sm font-bold text-ink">Labor %</span>
                <span className={`font-display text-xl font-semibold ${laborPct === 0 ? 'text-muted' : laborPct <= targets.laborPct ? 'text-up' : 'text-down'}`}>
                  {laborPct > 0 ? `${laborPct.toFixed(2)}%` : '—'}
                </span>
              </div>
              <p className="text-[11px] text-muted">Drop the Toast Labor report (by day) on Imports to fill this automatically.</p>
              <div className="my-3 border-t border-black/10" />
              <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">Deposit</div>
              <SheetRow label="Expected cash (POS)">
                <MoneyInput value={form.expected} onChange={(v) => setForm({ ...form, expected: v })} allowNegative />
              </SheetRow>
              <SheetRow label="Actual cash counted" highlight>
                <MoneyInput value={form.deposit} onChange={(v) => setForm({ ...form, deposit: v })} allowNegative highlight />
              </SheetRow>
              {overUnder != null && (
                <div className="flex items-baseline justify-between pt-1">
                  <span className="font-display text-base font-semibold text-ink">Over / Under</span>
                  <span className={`font-display text-2xl font-semibold ${Math.abs(overUnder) < 5 ? 'text-up' : 'text-down'}`}>
                    {overUnder >= 0 ? '+' : '−'}${Math.abs(overUnder).toFixed(2)}
                  </span>
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted">
                Type only the <b className="text-ink/70">cash you counted</b> — over/under does the math.
              </p>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes — weather, events, callouts, 86'd items…"
                className={`mt-3 w-full ${cls()}`}
              />
              <div className="mt-3 flex gap-2">
                <button onClick={save} className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white">
                  Save night ✓
                </button>
                <button
                  onClick={() => {
                    setForm(EMPTY)
                    setShowCats(false)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  title="Start a fresh entry for today"
                  className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm font-bold text-ink"
                >
                  + New night
                </button>
              </div>
            </Card>
          </div>

          {/* CATEGORIES + DISCOUNTS — right rail, checked against net */}
          <div className="space-y-5">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Categories</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    catTotal === 0 ? 'bg-black/5 text-muted' : Math.abs(catDiff) < 1 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                  }`}
                >
                  {catTotal === 0 ? 'from your sheet' : Math.abs(catDiff) < 1 ? '✓ check = 0' : `${catDiff > 0 ? '+' : '−'}${money2(Math.abs(catDiff))} vs net`}
                </span>
              </div>
              {(
                [
                  ['food', 'Food (incl. shakes)'],
                  ['na', 'NA Bev'],
                  ['beer', 'Beer'],
                  ['liquor', 'Liquor'],
                  ['wine', 'Wine'],
                ] as const
              ).map(([k, label]) => (
                <SheetRow key={k} label={label}>
                  <MoneyInput value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />
                </SheetRow>
              ))}
              <div className="mt-2 flex items-baseline justify-between border-t border-black/10 pt-2.5">
                <span className="text-sm font-bold text-ink">Category total</span>
                <span className="font-display text-xl font-semibold text-ink">{money2(catTotal)}</span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Mapped from Toast sales categories on import — check must equal net, same as your sheet.
              </p>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Discounts</span>
                <span className={`rounded-lg px-2 py-0.5 font-mono text-xs font-bold ${discounts > 0 ? 'bg-down/10 text-down' : 'bg-black/5 text-muted'}`}>
                  ${discounts.toFixed(2)}
                </span>
              </div>
              {(
                [
                  ['rewards', 'Rewards'],
                  ['promos', 'Promos'],
                  ['comps', 'Comps'],
                  ['staffDisc', 'Staff meals'],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-black/5 py-1.5 text-sm last:border-0">
                  <span className="text-ink/80">{label}</span>
                  <span className="font-mono text-xs font-semibold text-ink">${f(form[k]).toFixed(2)}</span>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-muted">
                Every deduction from the Sales card — imports fill these from Toast's Check + Menu Item
                Discounts, nothing typed.
              </p>
            </Card>
          </div>
        </div>

        <NightlyLog log={log} targets={targets} initialDate={focusDate ?? undefined} />

        {sorted.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-black/[0.02] px-4 py-3">
              <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Night history</span>
              <span className="text-[11px] text-muted">
                {lookup ? `showing ${fmtDate(lookup)}` : showAll ? `all ${sorted.length} nights` : `last 7 of ${sorted.length} — older nights are tucked away`}
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
            {visibleNights.length === 0 && (
              <p className="p-4 text-sm text-muted">No night saved for that date.</p>
            )}
            {visibleNights.map((n) => {
              const lp = n.laborPct ?? (n.labor && n.netSales ? (n.labor / n.netSales) * 100 : 0)
              const focused = n.date === focusDate
              return (
                <div
                  key={n.id}
                  id={`night-${n.date}`}
                  onClick={() => loadNight(n)}
                  title="Open this night in the sheet above"
                  className={`cursor-pointer border-b border-black/5 p-4 last:border-0 hover:bg-brand/5 ${focused ? 'bg-brand/5 ring-2 ring-inset ring-brand' : ''}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-ink">{fmtDate(n.date)}</span>
                    <span className="font-display text-lg font-semibold text-brand">{money(n.netSales)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                    {n.gross != null && <span>gross {money(n.gross)}</span>}
                    {lp > 0 && (
                      <span className={lp <= targets.laborPct ? 'text-up' : 'text-down'}>
                        labor {lp.toFixed(1)}%
                      </span>
                    )}
                    {n.overUnder != null && (
                      <span className={Math.abs(n.overUnder) < 5 ? '' : 'text-down'}>
                        drawer {n.overUnder >= 0 ? '+' : ''}{money2(n.overUnder)}
                      </span>
                    )}
                    {n.covers > 0 && <span>{n.covers} covers</span>}
                    {n.deposit > 0 && <span>deposit {money(n.deposit)}</span>}
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
    for (const f of LOG_FIELDS) {
      const v = entry[f.key].trim()
      if (v) lines.push(`— ${f.label} —`, v, '')
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

function Pill({ label, value, tone, strong }: { label: string; value: string; tone?: 'up' | 'down'; strong?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</span>
      <span className={`font-display font-semibold ${strong ? 'text-lg text-ink' : 'text-sm'} ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : strong ? '' : 'text-ink'}`}>
        {value}
      </span>
    </span>
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
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${cls(highlight)} pl-6`}
      />
    </div>
  )
}

// Manager-entered fields (the two on the sheet) get a green tint, like the
// prototype — a cue that everything else is filled automatically.
function cls(highlight?: boolean): string {
  const base = 'rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand'
  return highlight ? `${base} border-up/40 bg-up/5` : `${base} border-black/10 bg-white`
}

/** One line of the close-out sheet: label left, slim input right. */
function SheetRow({ label, strong, highlight, children }: { label: string; strong?: boolean; highlight?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 border-b border-black/5 py-1.5 last:border-0">
      <span className={`text-sm ${strong ? 'font-bold text-ink' : highlight ? 'font-semibold text-ink' : 'text-ink/80'}`}>{label}</span>
      <span className="w-36 shrink-0">{children}</span>
    </label>
  )
}
function fmtDate(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
