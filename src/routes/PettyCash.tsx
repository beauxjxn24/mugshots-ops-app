import { useMemo, useRef, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { ArrowDownLeft, ArrowUpRight, RotateCcw } from 'lucide-react'

// ---- The store's "Petty Cash 25" sheet (handoff spec): dollar amounts per
// column, Bar/ToGo drawer banks + safe denominations + checks, counted three
// times a day (open · mid · close), each count verified with MGR initials. ----

const COLS = [
  ['bar', 'BAR'],
  ['togo', 'TOGO'],
  ['h', 'HUNDREDS'],
  ['f', 'FIFTIES'],
  ['tw', 'TWENTIES'],
  ['te', 'TENS'],
  ['fv', 'FIVES'],
  ['on', 'ONES'],
  ['q', 'QUARTERS'],
  ['d', 'DIMES'],
  ['n', 'NICKLES'],
  ['p', 'PENNIES'],
  ['ck', 'CHECKS'],
] as const
const SLOTS = [
  ['open', 'OPEN'],
  ['mid', 'MID'],
  ['close', 'CLOSE'],
] as const
const TARGET = 1500

interface CountRec {
  v: Record<string, string>
  init?: string
  at?: string
  total?: number
}
type Counts = Record<string, CountRec> // `${date}|${slot}` → record

interface Entry {
  id: string
  date: string
  type: 'in' | 'out'
  amount: number
  reason: string
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PettyCash() {
  const [counts, setCounts] = usePersistentState<Counts>('petty:counts', {})
  const [date, setDate] = useState(today())
  const [inits, setInits] = useState<Record<string, string>>({})
  const gridRef = useRef<HTMLDivElement>(null)

  const key = (slot: string) => `${date}|${slot}`
  const recOf = (slot: string): CountRec => counts[key(slot)] ?? { v: {} }
  const sumOf = (rec: CountRec) => COLS.reduce((s, [k]) => s + (parseFloat(rec.v[k] ?? '') || 0), 0)

  const setCell = (slot: string, col: string, value: string) =>
    setCounts((c) => {
      const rec = { ...(c[key(slot)] ?? { v: {} }), v: { ...(c[key(slot)]?.v ?? {}) } }
      if (value === '') delete rec.v[col]
      else rec.v[col] = value
      return { ...c, [key(slot)]: rec }
    })

  const verify = async (slot: string) => {
    const ini = (inits[slot] ?? '').trim().toUpperCase()
    if (!ini) {
      alert('Manager initials required to verify')
      return
    }
    const rec = recOf(slot)
    const total = sumOf(rec)
    const diff = +(total - TARGET).toFixed(2)
    if (Math.abs(diff) >= 0.005) {
      const ok = await confirmDelete(
        `Count is ${diff > 0 ? 'OVER' : 'SHORT'} by ${money(Math.abs(diff))}`,
        'Verify anyway and log the variance?',
        'Verify anyway',
      )
      if (!ok) return
    }
    setCounts((c) => ({
      ...c,
      [key(slot)]: { ...rec, init: ini, at: new Date().toISOString(), total: +total.toFixed(2) },
    }))
    setInits((m) => ({ ...m, [slot]: '' }))
  }

  const unlock = (slot: string) =>
    setCounts((c) => {
      const rec = { ...(c[key(slot)] ?? { v: {} }) }
      delete rec.init
      delete rec.at
      return { ...c, [key(slot)]: rec }
    })

  // Enter walks the count left-to-right (Shift+Enter backwards), then onto MGR initials.
  const onGridKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const el = e.target as HTMLElement
    const cell = el.getAttribute('data-cell')
    if (!cell) return
    e.preventDefault()
    const [slot, col] = cell.split('|')
    if (col === 'init') {
      void verify(slot)
      return
    }
    const idx = COLS.findIndex(([k]) => k === col)
    const nextCol = e.shiftKey ? COLS[idx - 1]?.[0] : COLS[idx + 1]?.[0]
    const sel = nextCol ? `[data-cell="${slot}|${nextCol}"]` : e.shiftKey ? null : `[data-cell="${slot}|init"]`
    if (sel) {
      const next = gridRef.current?.querySelector<HTMLInputElement>(sel)
      next?.focus()
      next?.select()
    }
  }

  return (
    <>
      <PageHeader
        title="Petty Cash"
        subtitle="Counted three times a day — open · mid · close — each count initialed"
      />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="overflow-x-auto p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-ink">Petty cash count</span>
            <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-brand-600">
              $1,500 BANK
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand"
            />
            <span className="text-[11.5px] text-muted">
              dollar amounts per column · counted open, mid &amp; close · each count initialed
            </span>
          </div>

          <div ref={gridRef} onKeyDown={onGridKey} className="min-w-[1180px]">
            {/* Navy header — the sheet's column band */}
            <div className="grid grid-cols-[54px_repeat(13,1fr)_92px_118px] items-center gap-1.5 rounded-[10px] bg-navy px-2.5 py-2 text-[8.5px] font-extrabold tracking-[0.07em] text-white/60">
              <div className="text-[#E8A33C]">SHIFT</div>
              {COLS.map(([k, label]) => (
                <div key={k} className="text-right">
                  {label}
                </div>
              ))}
              <div className="text-right text-white">TOTAL</div>
              <div className="text-center text-[#E8A33C]">MGR</div>
            </div>

            {SLOTS.map(([slot, label], si) => {
              const rec = recOf(slot)
              const locked = !!rec.init
              const any = COLS.some(([k]) => (rec.v[k] ?? '') !== '')
              const total = sumOf(rec)
              const diff = +(total - TARGET).toFixed(2)
              const balanced = Math.abs(diff) < 0.005
              return (
                <div
                  key={slot}
                  className={`grid grid-cols-[54px_repeat(13,1fr)_92px_118px] items-center gap-1.5 px-2.5 py-2 ${
                    si % 2 ? 'bg-black/[0.02]' : ''
                  } ${si < 2 ? 'border-b border-black/5' : ''}`}
                >
                  <div className="text-[11px] font-extrabold tracking-wide text-ink/60">{label}</div>
                  {COLS.map(([k]) => (
                    <input
                      key={k}
                      data-cell={`${slot}|${k}`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      disabled={locked}
                      value={rec.v[k] ?? ''}
                      onChange={(e) => setCell(slot, k, e.target.value)}
                      className={`w-full rounded-[7px] border-[1.5px] px-1 py-1.5 text-right font-mono text-xs text-ink outline-none focus:border-brand ${
                        locked ? 'border-black/5 bg-black/[0.04]' : 'border-black/15 bg-white'
                      }`}
                    />
                  ))}
                  <div
                    title={!any ? '' : balanced ? 'Balances to $1,500' : `${diff > 0 ? 'Over by ' : 'Short by '}${money(Math.abs(diff))}`}
                    className={`text-right font-mono text-[13px] font-bold ${
                      !any ? 'text-muted/50' : balanced ? 'text-up' : 'text-down'
                    }`}
                  >
                    {any ? money(total) : '—'}
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    {locked ? (
                      <>
                        <span
                          title={`Verified${rec.at ? ` at ${new Date(rec.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`}
                          className="rounded-full bg-up/10 px-2.5 py-1 text-[10.5px] font-extrabold tracking-wide text-up"
                        >
                          ✓ {rec.init}
                        </span>
                        <button
                          onClick={() => unlock(slot)}
                          title="Recount"
                          className="grid size-6 place-items-center rounded-[7px] border border-black/15 bg-white text-muted hover:text-ink"
                        >
                          <RotateCcw size={11} />
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          data-cell={`${slot}|init`}
                          placeholder="——"
                          maxLength={4}
                          value={inits[slot] ?? ''}
                          onChange={(e) => setInits((m) => ({ ...m, [slot]: e.target.value }))}
                          className="w-10 rounded-[7px] border-[1.5px] border-black/15 bg-white px-1 py-1 text-center text-[11.5px] font-extrabold uppercase text-ink outline-none focus:border-brand"
                        />
                        <button
                          onClick={() => void verify(slot)}
                          title="Verify count"
                          className="grid size-[26px] place-items-center rounded-[7px] bg-brand text-xs font-extrabold text-white"
                        >
                          ✓
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-[11.5px] text-muted">
            <span>
              <b className="text-up">Green total</b> = balances to $1,500
            </span>
            <span>
              <b className="text-down">Red</b> = over/short — hover the total for the amount; verifying logs the variance
            </span>
          </div>
        </Card>

        <VarianceStrip counts={counts} />
        <InOutLog />
      </div>
    </>
  )
}

/** Recent verified counts that DIDN'T balance — the owner's over/short trail. */
function VarianceStrip({ counts }: { counts: Counts }) {
  const rows = useMemo(
    () =>
      Object.entries(counts)
        .filter(([, r]) => r.init && r.total != null && Math.abs(r.total - TARGET) >= 0.005)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 10),
    [counts],
  )
  if (rows.length === 0) return null
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">Logged variances</div>
      <div className="divide-y divide-black/5">
        {rows.map(([k, r]) => {
          const [d, slot] = k.split('|')
          const diff = +(r.total! - TARGET).toFixed(2)
          return (
            <div key={k} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="text-ink">
                {d} · {slot.toUpperCase()} <span className="text-xs text-muted">by {r.init}</span>
              </span>
              <span className={`font-mono text-xs font-bold ${diff > 0 ? 'text-up' : 'text-down'}`}>
                {diff > 0 ? 'over ' : 'short '}
                {money(Math.abs(diff))}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** The old quick in/out ledger — kept, tucked away, nothing lost. */
function InOutLog() {
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
    <details className="rounded-2xl border border-black/10 bg-white px-4 py-3" open={rows.length > 0}>
      <summary className="cursor-pointer text-sm font-bold text-ink">
        Cash in / out log
        <span className="ml-2 text-xs font-normal text-muted">
          quick paid-outs &amp; drops · running {money(balance)}
        </span>
      </summary>
      <div className="mt-3 flex gap-2">
        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-black/5 p-1">
          <button
            onClick={() => setType('out')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${type === 'out' ? 'bg-white text-down shadow-sm' : 'text-muted'}`}
          >
            Out
          </button>
          <button
            onClick={() => setType('in')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${type === 'in' ? 'bg-white text-up shadow-sm' : 'text-muted'}`}
          >
            In
          </button>
        </div>
        <div className="relative w-28">
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
          placeholder="Reason (supplies, cash drop…)"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          Add
        </button>
      </div>
      {sorted.length > 0 && (
        <div className="mt-2 divide-y divide-black/5">
          {sorted.slice(0, 12).map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-1.5 text-sm">
              {r.type === 'in' ? (
                <ArrowDownLeft size={14} className="shrink-0 text-up" />
              ) : (
                <ArrowUpRight size={14} className="shrink-0 text-down" />
              )}
              <span className="min-w-0 flex-1 truncate text-ink">{r.reason || (r.type === 'in' ? 'Cash in' : 'Cash out')}</span>
              <span className="text-xs text-muted">{r.date}</span>
              <span className={`font-mono text-xs font-bold ${r.type === 'in' ? 'text-up' : 'text-down'}`}>
                {r.type === 'in' ? '+' : '−'}
                {money(r.amount)}
              </span>
              <button
                onClick={async () => {
                  if (await confirmDelete('Delete this entry?', `${r.reason || r.type} · ${money(r.amount)}`))
                    setRows((rs) => rs.filter((x) => x.id !== r.id))
                }}
                aria-label="Delete"
                className="text-muted hover:text-down"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </details>
  )
}
