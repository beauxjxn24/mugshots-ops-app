import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'

interface Entry {
  id: string
  date: string
  type: 'in' | 'out'
  amount: number
  reason: string
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PettyCash() {
  const [rows, setRows] = usePersistentState<Entry[]>('petty:log', [])
  const [type, setType] = useState<'in' | 'out'>('out')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const balance = useMemo(() => rows.reduce((s, r) => s + (r.type === 'in' ? r.amount : -r.amount), 0), [rows])
  const sorted = useMemo(() => [...rows].sort((a, b) => b.id.localeCompare(a.id)), [rows])

  const add = () => {
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    setRows((r) => [...r, { id: `${Date.now()}`, date: today(), type, amount: amt, reason: reason.trim() }])
    setAmount('')
    setReason('')
  }

  return (
    <>
      <PageHeader title="Petty Cash" subtitle="Drawer in / out with a running balance" />
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Current balance</div>
          <div className={`font-display text-4xl font-semibold ${balance < 0 ? 'text-down' : 'text-ink'}`}>
            {money(balance)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1">
            <button
              onClick={() => setType('out')}
              className={`rounded-md py-1.5 text-sm font-semibold ${type === 'out' ? 'bg-white text-down shadow-sm' : 'text-muted'}`}
            >
              Cash out
            </button>
            <button
              onClick={() => setType('in')}
              className={`rounded-md py-1.5 text-sm font-semibold ${type === 'in' ? 'bg-white text-up shadow-sm' : 'text-muted'}`}
            >
              Cash in
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative w-32">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="0.00"
                className="w-full rounded-lg border border-black/10 bg-white py-2 pl-7 pr-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Reason (supplies, tips-out, cash drop…)"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
              Add
            </button>
          </div>
        </Card>

        {sorted.length > 0 && (
          <Card className="overflow-hidden">
            {sorted.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-black/5 p-3 last:border-0">
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${
                    r.type === 'in' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                  }`}
                >
                  {r.type === 'in' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{r.reason || (r.type === 'in' ? 'Cash in' : 'Cash out')}</div>
                  <div className="text-xs text-muted">{r.date}</div>
                </div>
                <div className={`font-mono text-sm font-semibold ${r.type === 'in' ? 'text-up' : 'text-down'}`}>
                  {r.type === 'in' ? '+' : '−'}
                  {money(r.amount)}
                </div>
                <button
                  onClick={async () => { if (await confirmDelete('Delete this entry?')) setRows((rows) => rows.filter((x) => x.id !== r.id)) }}
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
