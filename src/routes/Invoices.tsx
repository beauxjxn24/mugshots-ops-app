import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { getPriceLog } from '../lib/catalog'
import type { Night } from '../lib/nightly'
import { ScanLine, Check, FileText } from 'lucide-react'
import { openDoc } from '../lib/docs'

interface Invoice {
  id: string
  vendor: string
  date: string
  number: string
  total: number
  paid: boolean
  docId?: string
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - day)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })
}

/**
 * Invoices & receiving — prototype layout: invoice log on the left (deliveries
 * checked against orders on Imports), This-week + Price-watch rail on the
 * right, closes-the-loop explainer. Shorts, credits & price creep feed Costs.
 */
export function Invoices() {
  const [rows, setRows] = usePersistentState<Invoice[]>('invoices:list', [])
  const [nights] = usePersistentState<Night[]>('nightly:log', [])
  const priceLog = useMemo(() => getPriceLog(), [])
  const [form, setForm] = useState<Omit<Invoice, 'id' | 'paid'>>({ vendor: '', date: today(), number: '', total: 0 })
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')

  const sorted = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date)), [rows])
  const shown = sorted.filter((r) => filter === 'all' || (filter === 'paid' ? r.paid : !r.paid))
  const unpaidTotal = rows.filter((r) => !r.paid).reduce((s, r) => s + r.total, 0)

  // This week (Mon–Sun): invoices + WTD net from the nightly log — real ratio.
  const monday = mondayOf(today())
  const weekRows = sorted.filter((r) => r.date >= monday && r.date <= today())
  const weekTotal = weekRows.reduce((s, r) => s + r.total, 0)
  const wtdNet = nights.filter((n) => n.date >= monday && n.date <= today()).reduce((s, n) => s + n.netSales, 0)
  const pctOfNet = wtdNet > 0 ? (weekTotal / wtdNet) * 100 : null

  const add = () => {
    if (!form.vendor.trim() || !form.total) return
    setRows((r) => [...r, { ...form, id: `inv${Date.now()}`, vendor: form.vendor.trim(), paid: false }])
    setForm({ vendor: '', date: today(), number: '', total: 0 })
  }
  const togglePaid = (id: string) => setRows((r) => r.map((x) => (x.id === id ? { ...x, paid: !x.paid } : x)))

  return (
    <>
      <PageHeader
        title="Invoices & receiving"
        subtitle="Check the delivery against the order — shorts, credits & price creep feed Costs automatically"
        right={
          <Link
            to="/imports"
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-black/20 bg-white px-3.5 py-2 text-xs font-bold text-ink hover:border-brand"
          >
            <ScanLine size={13} className="text-brand" /> Drop invoice here — PDF or photo
          </Link>
        }
      />
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.7fr)]">
          <div className="space-y-4">
            {/* Log an invoice */}
            <Card className="p-4">
              <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">Log an invoice</div>
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  placeholder="Vendor"
                  list="inv-vendors"
                  className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:col-span-2"
                />
                <datalist id="inv-vendors">
                  <option value="US Foods" />
                  <option value="Gulf Coast Produce" />
                  <option value="Lincoln Road Package Store" />
                  <option value="Sysco" />
                  <option value="Capital City Beverage" />
                </datalist>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  placeholder="Invoice #"
                  className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <div className="relative sm:col-span-3">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.total || ''}
                    onChange={(e) => setForm({ ...form, total: parseFloat(e.target.value) || 0 })}
                    placeholder="Total"
                    className="w-full rounded-lg border border-black/10 bg-white py-2 pl-7 pr-3 text-sm outline-none focus:border-brand"
                  />
                </div>
                <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
                  Log ✓
                </button>
              </div>
            </Card>

            {/* Invoice log */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="font-display text-lg font-semibold text-ink">
                  Invoices <span className="ml-1 text-sm font-normal text-muted">{money(unpaidTotal)} unpaid</span>
                </span>
                <div className="flex gap-1 rounded-lg bg-black/5 p-1">
                  {(['all', 'unpaid', 'paid'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`rounded-md px-3 py-1 text-xs font-bold capitalize ${
                        filter === f ? 'bg-white text-ink shadow-sm' : 'text-muted'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {shown.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  No invoices logged — drop one on Imports (it reads the line items into Ordering
                  and updates case costs) then log the total here, or type it above.
                </p>
              ) : (
                shown.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 border-t border-black/5 px-4 py-3">
                    <button
                      onClick={() => togglePaid(r.id)}
                      aria-label={r.paid ? 'Mark unpaid' : 'Mark paid'}
                      className={`grid size-7 shrink-0 place-items-center rounded-md border-2 ${
                        r.paid ? 'border-up bg-up text-white' : 'border-black/20'
                      }`}
                    >
                      {r.paid && <Check size={15} />}
                    </button>
                    <div
                      className={`min-w-0 flex-1 ${r.docId ? 'cursor-pointer' : ''}`}
                      onClick={async () => {
                        if (r.docId && !(await openDoc(r.docId)))
                          alert('The original file is no longer on this device — re-drop it on Imports to relink.')
                      }}
                      title={r.docId ? 'Open the imported document' : undefined}
                    >
                      <div className="flex items-center gap-1.5 truncate font-semibold text-ink">
                        {r.vendor}
                        {r.docId && (
                          <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-brand-600">
                            <FileText size={9} /> PDF
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {fmtDay(r.date)} {r.date}
                        {r.number ? ` · #${r.number}` : ''}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        r.paid ? 'bg-up/10 text-up' : 'bg-brand/15 text-brand-600'
                      }`}
                    >
                      {r.paid ? '✓ POSTED' : 'OPEN'}
                    </span>
                    <div className="w-24 text-right font-mono text-sm font-bold text-ink">{money(r.total)}</div>
                    <button
                      onClick={async () => {
                        if (await confirmDelete(`Delete invoice from ${r.vendor}?`, money(r.total)))
                          setRows((rows2) => rows2.filter((x) => x.id !== r.id))
                      }}
                      aria-label="Delete"
                      className="text-muted hover:text-down"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </Card>
          </div>

          {/* Right rail */}
          <div className="space-y-5">
            <Card className="p-4">
              <div className="mb-2 font-display text-lg font-semibold text-ink">This week</div>
              {weekRows.length === 0 ? (
                <p className="text-xs text-muted">No invoices this week yet.</p>
              ) : (
                <>
                  {weekRows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 border-b border-black/5 py-2 last:border-0">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{r.vendor}</span>
                        <span className="block text-[10px] text-muted">{fmtDay(r.date)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">{money(r.total)}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${r.paid ? 'bg-up/10 text-up' : 'bg-brand/15 text-brand-600'}`}>
                          {r.paid ? '✓ POSTED' : 'OPEN'}
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-baseline justify-between border-t border-black/10 pt-2">
                    <span className="text-sm font-bold text-ink">Week total</span>
                    <span className="font-display text-lg font-semibold text-ink">{money(weekTotal)}</span>
                  </div>
                  {pctOfNet != null && (
                    <p className="mt-0.5 text-[11px] text-muted">
                      ≈ {pctOfNet.toFixed(1)}% of WTD net{pctOfNet <= 32 ? ' — on target' : ' — running hot'}
                    </p>
                  )}
                </>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-2 font-display text-lg font-semibold text-ink">Price watch</div>
              {priceLog.length === 0 ? (
                <p className="text-xs text-muted">
                  Fills in from price sheets and invoices dropped on Imports — every case-cost change
                  lands here.
                </p>
              ) : (
                <>
                  {priceLog.slice(0, 6).map((c, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 border-b border-black/5 py-1.5 text-sm last:border-0">
                      <span className="min-w-0 truncate font-semibold text-ink">{c.name}</span>
                      {c.pct != null && (
                        <span className={`shrink-0 font-mono text-xs font-bold ${c.pct >= 0 ? 'text-down' : 'text-up'}`}>
                          {c.pct >= 0 ? '▲ +' : '▼ '}
                          {c.pct.toFixed(0)}% · {money(c.newCost)}
                        </span>
                      )}
                    </div>
                  ))}
                  <Link to="/costs" className="mt-2 inline-block text-xs font-bold text-brand">
                    See impact on Costs →
                  </Link>
                </>
              )}
            </Card>

            <Card className="border-brand/25 bg-brand/[0.06] p-4">
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">
                Closes the loop
              </div>
              <p className="text-xs leading-relaxed text-ink/80">
                <Link to="/ordering" className="font-bold text-brand">
                  Order
                </Link>{' '}
                → receive on{' '}
                <Link to="/imports" className="font-bold text-brand">
                  Imports
                </Link>{' '}
                →{' '}
                <Link to="/costs" className="font-bold text-brand">
                  Costs
                </Link>{' '}
                actuals. Received cases add onto on-hand; a price jump flags the item on your next
                order sheet.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
