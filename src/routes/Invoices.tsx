import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { ScanLine, Check } from 'lucide-react'

interface Invoice {
  id: string
  vendor: string
  date: string
  number: string
  total: number
  paid: boolean
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Invoices() {
  const [rows, setRows] = usePersistentState<Invoice[]>('invoices:list', [])
  const [form, setForm] = useState<Omit<Invoice, 'id' | 'paid'>>({
    vendor: '',
    date: today(),
    number: '',
    total: 0,
  })
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')

  const sorted = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date)), [rows])
  const shown = sorted.filter((r) => filter === 'all' || (filter === 'paid' ? r.paid : !r.paid))
  const unpaidTotal = rows.filter((r) => !r.paid).reduce((s, r) => s + r.total, 0)
  const monthTotal = rows
    .filter((r) => r.date.slice(0, 7) === today().slice(0, 7))
    .reduce((s, r) => s + r.total, 0)

  const add = () => {
    if (!form.vendor.trim() || !form.total) return
    setRows((r) => [...r, { ...form, id: `inv${Date.now()}`, vendor: form.vendor.trim(), paid: false }])
    setForm({ vendor: '', date: today(), number: '', total: 0 })
  }
  const togglePaid = (id: string) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, paid: !x.paid } : x)))

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`${money(unpaidTotal)} unpaid · ${money(monthTotal)} this month`}
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="border-brand/20 bg-brand/5 p-3 text-xs text-ink/70">
          Tip: drop a vendor invoice on <Link to="/imports" className="inline-flex items-center gap-1 font-semibold text-brand"><ScanLine size={13} /> Imports</Link> to read its line items into Ordering — then log the total here.
        </Card>

        {/* Add */}
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="Vendor (US Foods, Gulf Coast…)"
              list="inv-vendors"
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:col-span-2"
            />
            <datalist id="inv-vendors">
              <option value="US Foods" />
              <option value="Gulf Coast Produce" />
              <option value="Lincoln Road Package Store" />
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
            <div className="relative sm:col-span-2">
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
          </div>
          <button onClick={add} className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            Log invoice
          </button>
        </Card>

        {/* Filter */}
        <div className="flex gap-2">
          {(['all', 'unpaid', 'paid'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === f ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No invoices logged.</p>
        ) : (
          <Card className="overflow-hidden">
            {shown.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-black/5 p-3 last:border-0">
                <button
                  onClick={() => togglePaid(r.id)}
                  aria-label={r.paid ? 'Mark unpaid' : 'Mark paid'}
                  className={`grid size-7 shrink-0 place-items-center rounded-md border-2 ${
                    r.paid ? 'border-up bg-up text-white' : 'border-black/20'
                  }`}
                >
                  {r.paid && <Check size={15} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{r.vendor}</div>
                  <div className="text-xs text-muted">
                    {r.date}
                    {r.number ? ` · #${r.number}` : ''}
                    {r.paid ? ' · paid' : ''}
                  </div>
                </div>
                <div className="font-display text-base font-semibold text-ink">{money(r.total)}</div>
                <button
                  onClick={async () => { if (await confirmDelete(`Delete invoice from ${r.vendor}?`, money(r.total))) setRows((rows) => rows.filter((x) => x.id !== r.id)) }}
                  aria-label="Delete"
                  className="text-muted hover:text-down"
                >
                  ✕
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  )
}
