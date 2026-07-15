import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { useScope, useRollupLevel } from '../lib/scope'
import { today } from '../lib/store'
import {
  storesForScope,
  rollupSales,
  rollupPmix,
  rollupTracked,
  rollupCatering,
  rollupMoney,
  type Scope,
} from '../lib/rollup'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const SCOPES: Scope[] = ['day', 'week', 'period']
const CAT_COLORS: Record<string, string> = {
  Food: '#E4B84C',
  Beer: '#F0A94C',
  Liquor: '#F472B6',
  Wine: '#A78BFA',
  'N/A bev': '#60A5FA',
}

/**
 * Combined / roll-up reporting — read-only. Aggregates sales, labor, category
 * mix, product mix, tracked items, catering and money across every store in
 * scope (a whole concept, or the whole company). Per-store editing stays on
 * each store; this view is the compare-and-total layer above them.
 */
export function Combined() {
  const level = useRollupLevel()
  const concepts = useScope((s) => s.concepts)
  const currentConcept = useScope((s) => s.currentConcept)
  const currentLocation = useScope((s) => s.currentLocation)
  const [scope, setScope] = useState<Scope>('week')

  const refs = useMemo(
    () => storesForScope(concepts, currentConcept, currentLocation),
    [concepts, currentConcept, currentLocation],
  )
  const sales = useMemo(() => rollupSales(refs, scope), [refs, scope])
  const pmix = useMemo(() => rollupPmix(refs).slice(0, 12), [refs])
  const tracked = useMemo(() => rollupTracked(refs), [refs])
  const catering = useMemo(() => rollupCatering(refs, today()), [refs])
  const cash = useMemo(() => rollupMoney(refs), [refs])

  const title =
    level === 'company' ? 'All stores — company roll-up' : `${refs[0]?.conceptName ?? ''} — all locations`
  const scopeLabel =
    scope === 'day' ? sales.anchor || 'latest day' : scope === 'week' ? 'this week' : 'this period'

  const cats = [
    { l: 'Food', v: sales.total.cats.food },
    { l: 'Beer', v: sales.total.cats.beer },
    { l: 'Liquor', v: sales.total.cats.liquor },
    { l: 'Wine', v: sales.total.cats.wine },
    { l: 'N/A bev', v: sales.total.cats.na },
  ].filter((c) => c.v > 0)
  const catTotal = cats.reduce((s, c) => s + c.v, 0)
  const maxStoreNet = Math.max(...sales.perStore.map((s) => s.net), 1)

  const empty = sales.anchor === '' && pmix.length === 0 && catering.length === 0

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${refs.length} store${refs.length === 1 ? '' : 's'} combined · read-only reporting`}
        right={
          <div className="inline-flex rounded-xl border border-black/10 bg-white p-0.5 text-sm">
            {SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-lg px-3 py-1.5 font-semibold capitalize ${
                  scope === s ? 'bg-brand text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        {empty ? (
          <Card className="p-8 text-center">
            <div className="text-sm font-semibold text-ink">No numbers logged yet in these stores</div>
            <div className="mt-1 text-xs text-muted">
              Roll-up fills in as each store logs its nightly numbers and drops its PMIX. Pick a single
              store from the switcher to start entering data.
            </div>
          </Card>
        ) : (
          <>
            {/* ---- Headline totals ---- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label={`Net sales · ${scopeLabel}`} value={money(sales.total.net)} big />
              <Metric
                label="Labor %"
                value={sales.total.laborPct != null ? `${sales.total.laborPct.toFixed(1)}%` : '—'}
              />
              <Metric label="Covers" value={sales.total.covers ? sales.total.covers.toLocaleString() : '—'} />
              <Metric label="Open invoices" value={money(cash.invoiceOpen)} />
            </div>

            {/* ---- Per-store breakdown ---- */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3">
                <div className="font-display text-lg font-semibold text-ink">By store · {scopeLabel}</div>
                <span className="text-xs text-muted">net sales · labor %</span>
              </div>
              <div className="mt-2 divide-y divide-black/5">
                {[...sales.perStore]
                  .sort((a, b) => b.net - a.net)
                  .map((s) => (
                    <div key={s.ref.ns} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-ink">
                          {level === 'company' ? `${s.ref.conceptName} · ${s.ref.locationName}` : s.ref.locationName}
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.max(2, (s.net / maxStoreNet) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-base font-semibold text-brand">{money(s.net)}</div>
                        <div className="text-[11px] text-muted">
                          {s.laborPct != null ? `${s.laborPct.toFixed(1)}% labor` : s.days ? '—' : 'no data'}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              {/* ---- Sales by category ---- */}
              {catTotal > 0 && (
                <Card className="p-5">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                    Sales by category · {scopeLabel}
                  </div>
                  <div className="space-y-3">
                    {[...cats]
                      .sort((a, b) => b.v - a.v)
                      .map((c) => {
                        const pct = (c.v / catTotal) * 100
                        return (
                          <div key={c.l}>
                            <div className="mb-1 flex items-baseline justify-between text-sm">
                              <span className="font-semibold text-ink">{c.l}</span>
                              <span className="text-muted">
                                {money(c.v)} · {pct.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-black/5">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, background: CAT_COLORS[c.l] ?? '#E4B84C' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </Card>
              )}

              {/* ---- Tracked items (summed) ---- */}
              {tracked.length > 0 && (
                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted">
                      Tracked items · all stores
                    </span>
                    <Link to="/stores" className="text-[11px] font-semibold text-brand">
                      edit →
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {tracked.map((t) => (
                      <div key={t.name} className="flex items-center gap-2.5 rounded-xl border border-black/5 px-3.5 py-2">
                        <span className="font-display text-2xl font-semibold leading-none text-brand">
                          {t.qty || '—'}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold leading-tight text-ink">{t.name}</span>
                          <span className="block text-[11px] leading-tight text-muted">
                            {t.sales > 0 ? money(t.sales) : 'not in PMIX'}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* ---- Product mix (summed) ---- */}
            {pmix.length > 0 && (
              <Card className="p-5">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                  Top sellers · combined product mix
                </div>
                <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                  {pmix.map((p, i) => (
                    <div key={p.name} className="flex items-baseline justify-between gap-3 border-b border-black/5 py-1.5">
                      <span className="min-w-0 truncate text-sm text-ink">
                        <span className="mr-2 text-xs font-bold text-muted">{i + 1}</span>
                        {p.name}
                      </span>
                      <span className="shrink-0 text-sm">
                        <span className="font-semibold text-ink">{p.qty}</span>
                        <span className="ml-2 text-muted">{money(p.sales)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ---- Upcoming catering + money ---- */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                  Upcoming catering · all stores
                </div>
                {catering.length === 0 ? (
                  <div className="text-sm text-muted">Nothing booked ahead.</div>
                ) : (
                  <div className="space-y-2">
                    {catering.slice(0, 8).map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 border-b border-black/5 pb-2 last:border-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-ink">{b.event || 'Catering order'}</div>
                          <div className="text-[11px] text-muted">
                            {b.date}
                            {b.time ? ` · ${b.time}` : ''}
                            {b.guests ? ` · ${b.guests} guests` : ''}
                            {b.storeName ? ` · ${b.storeName}` : ''}
                          </div>
                        </div>
                        {b.estimate ? <span className="shrink-0 text-sm font-semibold text-brand">{money(b.estimate)}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                  Money · all stores (all time)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Invoices total" value={money(cash.invoiceTotal)} />
                  <Metric label="Open invoices" value={money(cash.invoiceOpen)} tone="down" />
                  <Metric label="Tipshare pools" value={money(cash.tipsTotal)} />
                  <Metric label="Stores" value={String(refs.length)} />
                </div>
              </Card>
            </div>

            <p className="px-1 text-center text-[11px] text-muted">
              Read-only roll-up. Switch to a single store to enter or edit its numbers.
            </p>
          </>
        )}
      </div>
    </>
  )
}

function Metric({
  label,
  value,
  big = false,
  tone = 'default',
}: {
  label: string
  value: string
  big?: boolean
  tone?: 'default' | 'down'
}) {
  return (
    <Card className="p-4">
      <div
        className={`font-display font-semibold ${big ? 'text-3xl' : 'text-2xl'} ${
          tone === 'down' ? 'text-down' : 'text-brand'
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </Card>
  )
}
