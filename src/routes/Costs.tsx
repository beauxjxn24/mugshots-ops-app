import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { getPriceLog } from '../lib/catalog'
import type { Night } from '../lib/nightly'
import type { PmixDays } from '../lib/pmix'

interface Invoice {
  id: string
  vendor: string
  date: string
  number: string
  total: number
  paid: boolean
}
interface Targets2 {
  food: number
  pour: number
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const money2 = (n: number) => `$${n.toFixed(2)}`

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const isBarVendor = (v: string) => /liquor|beverage|package|beer|wine|capital city|lincoln/i.test(v)

/**
 * Costs — prototype layout: food-cost & pour-cost tiles vs targets, the
 * Margin × Mix table from your PMIX (plate costs editable inline), and a
 * right rail with purchases, price watch, and this week's play. Purchase
 * numbers come straight from Invoices + Nightly — no typing totals twice.
 */
export function Costs() {
  const [invoices] = usePersistentState<Invoice[]>('invoices:list', [])
  const [nights] = usePersistentState<Night[]>('nightly:log', [])
  const [days] = usePersistentState<PmixDays>('pmix:days', {})
  const [plate, setPlate] = usePersistentState<Record<string, number>>('costs:plate', {})
  const [targets, setTargets] = usePersistentState<Targets2>('costs:targets', { food: 30, pour: 20 })
  const priceLog = useMemo(() => getPriceLog(), [])

  // This week: purchases (from Invoices) ÷ net (from Nightly).
  const monday = mondayOf(today())
  const weekInv = invoices.filter((r) => r.date >= monday && r.date <= today())
  const foodPurch = weekInv.filter((r) => !isBarVendor(r.vendor)).reduce((s, r) => s + r.total, 0)
  const barPurch = weekInv.filter((r) => isBarVendor(r.vendor)).reduce((s, r) => s + r.total, 0)
  const wtdNet = nights.filter((n) => n.date >= monday && n.date <= today()).reduce((s, n) => s + n.netSales, 0)
  const wtdBar = nights
    .filter((n) => n.date >= monday && n.date <= today())
    .reduce((s, n) => s + (n.beer ?? 0) + (n.liquor ?? 0) + (n.wine ?? 0), 0)
  const foodPct = wtdNet > 0 ? (foodPurch / wtdNet) * 100 : null
  const pourPct = wtdBar > 0 ? (barPurch / wtdBar) * 100 : wtdNet > 0 ? (barPurch / wtdNet) * 100 : null

  // Margin × Mix from the last 7 PMIX days on record.
  const mix = useMemo(() => {
    const keys = Object.keys(days).sort()
    const latest = keys[keys.length - 1]
    if (!latest) return { rows: [] as Array<{ name: string; avg: number; qty: number; sales: number; mixPct: number }>, label: '' }
    const [y, m, d] = latest.split('-').map(Number)
    const from = new Date(y, m - 1, d - 6)
    const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
    const use = keys.filter((k) => k >= fromIso && k <= latest)
    const byName = new Map<string, { qty: number; sales: number }>()
    let total = 0
    for (const k of use)
      for (const it of days[k]?.items ?? []) {
        total += it.sales
        const cur = byName.get(it.name)
        if (cur) {
          cur.qty += it.qty
          cur.sales += it.sales
        } else byName.set(it.name, { qty: it.qty, sales: it.sales })
      }
    const rows = [...byName.entries()]
      .filter(([, v]) => v.sales > 0)
      .map(([name, v]) => ({ name, qty: v.qty, sales: v.sales, avg: v.sales / v.qty, mixPct: total > 0 ? (v.sales / total) * 100 : 0 }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 12)
    return { rows, label: use.length > 1 ? `${use[0].slice(5)}–${latest.slice(5)}` : latest }
  }, [days])

  const verdictOf = (r: { name: string; avg: number; mixPct: number }) => {
    const pc = plate[r.name]
    if (pc == null || pc <= 0) return null
    const marginShare = (r.avg - pc) / r.avg
    if (pc / r.avg >= 0.42) return { label: 'Cost creeping ▲', cls: 'bg-brand/15 text-brand-600' }
    if (marginShare >= 0.65 && r.mixPct >= 2.5) return { label: 'Star — feature it', cls: 'bg-up/10 text-up' }
    if (marginShare >= 0.65) return { label: 'Star', cls: 'bg-up/10 text-up' }
    return null
  }

  // This week's play — generated from real margins, only when they exist.
  const play = useMemo(() => {
    const withPlate = mix.rows.filter((r) => plate[r.name] > 0)
    if (withPlate.length < 2) return null
    const best = [...withPlate].sort((a, b) => b.avg - plate[b.name] - (a.avg - plate[a.name]))[0]
    const creep = withPlate.find((r) => plate[r.name] / r.avg >= 0.42)
    const parts = [`Feature ${best.name} (best margin ${money2(best.avg - plate[best.name])}/plate)`]
    if (creep) parts.push(`watch ${creep.name} — plate cost is ${((plate[creep.name] / creep.avg) * 100).toFixed(0)}% of its price`)
    return parts.join(' · ')
  }, [mix.rows, plate])

  return (
    <>
      <PageHeader title="Costs" subtitle="Margins × mix · purchases vs sales — fed by Invoices, Nightly Numbers & PMIX" />
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Stat tiles */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Food cost · this week</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold text-ink">{foodPct != null ? `${foodPct.toFixed(1)}%` : '—'}</span>
              <span className="text-xs text-muted">
                target{' '}
                <input
                  type="number"
                  value={targets.food}
                  onChange={(e) => setTargets((t) => ({ ...t, food: parseFloat(e.target.value) || 0 }))}
                  className="w-10 rounded border border-transparent bg-transparent text-center font-bold text-ink outline-none hover:border-black/10"
                />
                %
              </span>
            </div>
            {foodPct != null ? (
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${foodPct <= targets.food ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                {foodPct <= targets.food ? '▼' : '▲'} {Math.abs(foodPct - targets.food).toFixed(1)} pt {foodPct <= targets.food ? 'under' : 'over'} target
              </span>
            ) : (
              <span className="text-[11px] text-muted">needs this week's invoices + nights</span>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Pour cost (bar) · this week</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold text-ink">{pourPct != null ? `${pourPct.toFixed(1)}%` : '—'}</span>
              <span className="text-xs text-muted">
                target{' '}
                <input
                  type="number"
                  value={targets.pour}
                  onChange={(e) => setTargets((t) => ({ ...t, pour: parseFloat(e.target.value) || 0 }))}
                  className="w-10 rounded border border-transparent bg-transparent text-center font-bold text-ink outline-none hover:border-black/10"
                />
                %
              </span>
            </div>
            {pourPct != null ? (
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${pourPct <= targets.pour ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                {pourPct <= targets.pour ? '▼' : '▲'} {Math.abs(pourPct - targets.pour).toFixed(1)} pt {pourPct <= targets.pour ? 'under' : 'over'} target
              </span>
            ) : (
              <span className="text-[11px] text-muted">needs bar invoices + category sales</span>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Purchases · this week</div>
            <div className="mt-1 font-display text-3xl font-semibold text-ink">{money(foodPurch + barPurch)}</div>
            <span className="text-[11px] text-muted">
              {weekInv.length} invoice{weekInv.length === 1 ? '' : 's'} · food {money(foodPurch)} · bar {money(barPurch)}
            </span>
          </Card>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]">
          {/* Margin × Mix */}
          <Card className="p-5">
            <div className="font-display text-xl font-semibold text-ink">Margin × Mix</div>
            <p className="mb-3 text-xs text-muted">
              {mix.rows.length > 0
                ? `Mix from PMIX ${mix.label} · type each item's plate cost once — margins and verdicts fill in`
                : 'Drop a PMIX on Imports and your top items appear here with margins.'}
            </p>
            {mix.rows.length > 0 && (
              <div className="-mx-1 overflow-x-auto px-1">
                <div className="min-w-[520px]">
              <div className="grid grid-cols-[minmax(0,2fr)_76px_86px_80px_60px_minmax(90px,1fr)] gap-2 border-b border-black/10 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                <span>Item</span>
                <span className="text-right">Avg price</span>
                <span className="text-right">Plate cost</span>
                <span className="text-right">Margin</span>
                <span className="text-right">Mix %</span>
                <span className="text-right">Verdict</span>
              </div>
            {mix.rows.map((r) => {
              const pc = plate[r.name]
              const verdict = verdictOf(r)
              return (
                <div key={r.name} className="grid grid-cols-[minmax(0,2fr)_76px_86px_80px_60px_minmax(90px,1fr)] items-center gap-2 border-b border-black/5 py-2 last:border-0">
                  <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
                  <span className="text-right font-mono text-xs text-ink">{money2(r.avg)}</span>
                  <span className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={pc ?? ''}
                      placeholder="—"
                      onChange={(e) =>
                        setPlate((p) => {
                          const v = parseFloat(e.target.value)
                          const next = { ...p }
                          if (Number.isFinite(v) && v > 0) next[r.name] = v
                          else delete next[r.name]
                          return next
                        })
                      }
                      className="w-full rounded-lg border border-black/10 bg-white py-1 pl-5 pr-1 text-right font-mono text-xs outline-none focus:border-brand"
                    />
                  </span>
                  <span className={`text-right font-mono text-xs font-bold ${pc ? 'text-up' : 'text-muted'}`}>
                    {pc ? money2(r.avg - pc) : '—'}
                  </span>
                  <span className="text-right font-mono text-xs text-muted">{r.mixPct.toFixed(1)}%</span>
                  <span className="text-right">
                    {verdict ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${verdict.cls}`}>{verdict.label}</span>
                    ) : (
                      <span className="text-[10px] text-muted">{pc ? '—' : 'set plate cost'}</span>
                    )}
                  </span>
                </div>
              )
            })}
                </div>
              </div>
            )}
          </Card>

          {/* Right rail */}
          <div className="space-y-5">
            <Card className="p-4">
              <div className="mb-2 text-sm font-bold text-ink">This week's invoices</div>
              {weekInv.length === 0 ? (
                <p className="text-xs text-muted">
                  Log deliveries on{' '}
                  <Link to="/invoices" className="font-bold text-brand">
                    Invoices
                  </Link>{' '}
                  — the tiles above compute from them.
                </p>
              ) : (
                weekInv.map((r) => (
                  <div key={r.id} className="flex items-baseline justify-between border-b border-black/5 py-1.5 text-sm last:border-0">
                    <span className="min-w-0 truncate text-ink">{r.vendor}</span>
                    <span className="font-mono text-xs font-bold text-ink">{money(r.total)}</span>
                  </div>
                ))
              )}
            </Card>

            <Card className="border-brand/25 bg-brand/[0.06] p-4">
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">Price watch</div>
              {priceLog.length === 0 ? (
                <p className="text-xs text-ink/70">
                  Case-cost changes from your price sheets and invoices land here with their weekly
                  impact.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {priceLog.slice(0, 4).map((c, i) => (
                    <li key={i} className="text-xs leading-relaxed text-ink/80">
                      <b>{c.name}</b> {c.pct != null && (c.pct >= 0 ? 'up' : 'down')}{' '}
                      {c.pct != null && <b className={c.pct >= 0 ? 'text-down' : 'text-up'}>{Math.abs(c.pct).toFixed(0)}%</b>} on your
                      last {c.vendor} import → {money2(c.newCost)}/case.
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {play && (
              <Card className="border-navy !bg-navy p-4 text-white">
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-white/60">
                  This week's play
                </div>
                <p className="text-xs leading-relaxed text-white/90">{play}</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
