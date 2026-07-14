import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Pencil, Check, GripVertical } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import PREP_SEED from '../data/prep-items.json'

interface PrepItem {
  name: string
  spec: string
  unit: string
  pars: number[] // Mon..Sun
}
interface HistEntry {
  date: string
  dow: number
  name: string
  onHand: number
  par: number
}

const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

function dayIdx(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7 // Monday-first
}
function fmtLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/**
 * Prep list — the prototype screen, seeded with the owner's real 49-item
 * sheet: a par for EVERY day of the week (today's column highlighted),
 * on-hand entry, drag-to-reorder rows (the printed sheet follows shelf
 * order), and pars that learn from what you actually had left over.
 */
export function Prep() {
  const t = today()
  const di = dayIdx(t)
  const [items, setItems] = usePersistentState<PrepItem[]>('prep:items', PREP_SEED as PrepItem[])
  const [onHand, setOnHand] = usePersistentState<Record<string, number>>(`prep:onhand:${t}`, {})
  const [history, setHistory] = usePersistentState<HistEntry[]>('prep:history', [])
  const [editingPars, setEditingPars] = useState(false)
  const [adding, setAdding] = useState({ name: '', spec: '', unit: 'pans' })

  const need = (it: PrepItem) => Math.max(0, (it.pars[di] ?? 0) - (onHand[it.name] ?? 0))

  // Drag a row by its grip to lay the list out sheet-to-shelf; the order is
  // saved and the printed sheet follows it.
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const moveItem = (from: number, to: number) => {
    if (from === to) return
    setItems((is) => {
      const next = [...is]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return next
    })
  }

  const setCount = (name: string, v: number | undefined) => {
    setOnHand((o) => {
      const next = { ...o }
      if (v == null) delete next[name]
      else next[name] = v
      return next
    })
    // Usage history: today's leftover vs today's par — pars learn from this.
    if (v != null) {
      const it = items.find((x) => x.name === name)
      if (it)
        setHistory((h) =>
          [...h.filter((e) => !(e.date === t && e.name === name)), { date: t, dow: di, name, onHand: v, par: it.pars[di] ?? 0 }].slice(-800),
        )
    }
  }

  // Pars learn from usage: ≥3 counts on the same weekday → suggest a bump.
  const suggestions = useMemo(() => {
    const out: Array<{ name: string; dow: number; from: number; to: number }> = []
    for (const it of items) {
      for (let dow = 0; dow < 7; dow++) {
        const entries = history.filter((e) => e.name === it.name && e.dow === dow).slice(-4)
        if (entries.length < 3) continue
        const par = it.pars[dow] ?? 0
        if (par <= 0) continue
        const avgLeft = entries.reduce((s, e) => s + e.onHand, 0) / entries.length
        if (avgLeft >= par * 0.5 && par - Math.round(avgLeft * 2) / 2 >= 0.5) {
          out.push({ name: it.name, dow, from: par, to: Math.max(0.5, par - Math.round(avgLeft * 2) / 2) })
        } else if (avgLeft === 0 && entries.every((e) => e.onHand === 0)) {
          out.push({ name: it.name, dow, from: par, to: par + 1 })
        }
      }
    }
    return out.slice(0, 5)
  }, [items, history])

  const applySuggestions = () => {
    setItems((is) =>
      is.map((it) => {
        const mine = suggestions.filter((s) => s.name === it.name)
        if (!mine.length) return it
        const pars = [...it.pars]
        for (const s of mine) pars[s.dow] = s.to
        return { ...it, pars }
      }),
    )
  }

  const setPar = (name: string, dow: number, v: number) =>
    setItems((is) => is.map((it) => (it.name === name ? { ...it, pars: it.pars.map((p, i) => (i === dow ? v : p)) } : it)))

  const resetDay = async () => {
    if (Object.keys(onHand).length === 0) return
    if (await confirmDelete("Reset today's on-hands?", 'Pars stay — only the counts entered today are cleared.', 'Reset day'))
      setOnHand({})
  }

  const addItem = () => {
    if (!adding.name.trim()) return
    if (items.some((x) => x.name.toLowerCase() === adding.name.trim().toLowerCase())) return
    setItems((is) => [...is, { name: adding.name.trim(), spec: adding.spec.trim(), unit: adding.unit || 'pans', pars: [1, 1, 1, 1, 1, 1, 1] }])
    setAdding({ name: '', spec: '', unit: 'pans' })
  }

  return (
    <>
      <PageHeader
        title={`Prep list · ${fmtLong(t)}`}
        subtitle="Enter on-hands · prep needed = today's par − on hand · drag rows into your shelf order"
        right={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link to="/builds" className="text-xs font-bold text-brand">
              Line builds →
            </Link>
            <button onClick={resetDay} className="rounded-lg border border-down/30 bg-white px-3 py-2 text-xs font-bold text-down">
              Reset day
            </button>
            <button
              onClick={() => setEditingPars((e) => !e)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
                editingPars ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
              }`}
            >
              {editingPars ? <Check size={13} /> : <Pencil size={12} />} {editingPars ? 'Done' : 'Edit daily pars'}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white"
            >
              <Printer size={13} /> Print prep sheet
            </button>
          </div>
        }
      />
      {/* Print-only prep sheet (owner spec): zero items never print, and the
          list flows into TWO columns so the type stays readable. */}
      <div className="prep-print hidden">
        <div className="mb-2 flex items-baseline justify-between border-b-2 border-black pb-1">
          <span className="text-[16px] font-bold">Prep list · {fmtLong(t)}</span>
          <span className="text-[10px]">par − on hand = prep · Mugshots Flowood</span>
        </div>
        <div style={{ columns: 2, columnGap: '22px' }}>
          {items
            .filter((it) => (it.pars[di] ?? 0) > 0 && (onHand[it.name] == null || need(it) > 0))
            .map((it) => (
              <div
                key={it.name}
                className="flex items-center gap-2 border-b border-black/25 py-[3px]"
                style={{ breakInside: 'avoid' }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold leading-[13px]">{it.name}</span>
                  <span className="block truncate text-[8.5px] leading-[10px] text-black/60">{it.spec || it.unit}</span>
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[11px] font-bold">
                  {onHand[it.name] != null && need(it) > 0
                    ? `${fmtQty(need(it))} ${it.unit}`
                    : `${fmtQty(it.pars[di] ?? 0)} ${it.unit}`}
                </span>
                <span className="h-[15px] w-9 shrink-0 rounded-[3px] border border-black/50" />
              </div>
            ))}
        </div>
        <div className="mt-1.5 text-[8.5px] text-black/60">
          Number shown = {Object.keys(onHand).length ? 'prep needed (on-hands already counted in the app)' : "today's par"} ·
          box = done ✓ · items with nothing to prep don't print
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8 print:hidden">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <Card className="border-brand/25 bg-brand/[0.06] p-4">
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">How pars work here</div>
            <p className="text-xs leading-relaxed text-ink/80">
              Each prep item has a par for every day of the week (Friday ≠ Monday). Today's column
              is highlighted; on-hands entered here are tracked so the app learns if pars are
              chronically over or under.
            </p>
          </Card>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="shrink-0">
              <div className="text-sm font-bold text-ink">Pars learn from usage</div>
              <div className="text-[11px] text-muted">
                {history.length ? `${history.length} counts on record` : 'fills in as you enter on-hands'}
              </div>
            </div>
            {suggestions.length === 0 ? (
              <span className="text-xs text-muted">No changes suggested yet — keep counting.</span>
            ) : (
              <>
                {suggestions.map((s, i) => (
                  <span key={i} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink">
                    {s.name} · {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][s.dow]} {fmtQty(s.from)} → <b className="text-brand-600">{fmtQty(s.to)}</b>
                  </span>
                ))}
                <button onClick={applySuggestions} className="ml-auto rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white print:hidden">
                  Review &amp; apply
                </button>
              </>
            )}
          </Card>
        </div>

        {/* Par table */}
        <Card className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className="grid grid-cols-[20px_minmax(0,2fr)_repeat(7,52px)_86px_110px] items-center gap-1 border-b border-black/10 px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <span title="Drag rows to match your shelf order" />
              <span>Prep item · drag ⠿ to shelf order</span>
              {DOWS.map((d, i) => (
                <span key={i} className={`text-center ${i === di ? 'text-brand-600' : ''}`}>
                  {d}
                </span>
              ))}
              <span className="text-center">On hand</span>
              <span className="text-right">Prep today</span>
            </div>
            {items.map((it, idx) => {
              const n = need(it)
              const counted = onHand[it.name] != null
              return (
                <div
                  key={it.name}
                  onDragOver={(e) => {
                    if (dragIdx == null) return
                    e.preventDefault()
                    setOverIdx(idx)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIdx != null) moveItem(dragIdx, idx)
                    setDragIdx(null)
                    setOverIdx(null)
                  }}
                  className={`group grid grid-cols-[20px_minmax(0,2fr)_repeat(7,52px)_86px_110px] items-center gap-1 border-b border-black/5 px-4 py-2 last:border-0 ${
                    dragIdx === idx ? 'opacity-40' : ''
                  } ${overIdx === idx && dragIdx !== idx ? 'border-t-2 border-t-brand' : ''}`}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(idx)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', it.name)
                    }}
                    onDragEnd={() => {
                      setDragIdx(null)
                      setOverIdx(null)
                    }}
                    title="Drag to reorder — the printed sheet follows this order"
                    className="cursor-grab text-muted/50 hover:text-ink active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">{it.name}</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <span className="truncate">{it.spec || it.unit}</span>
                      {editingPars && (
                        <button
                          onClick={async () => {
                            if (await confirmDelete(`Remove ${it.name} from the prep list?`))
                              setItems((is) => is.filter((x) => x.name !== it.name))
                          }}
                          className="shrink-0 text-down opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          remove
                        </button>
                      )}
                    </div>
                  </div>
                  {it.pars.map((p, i) =>
                    editingPars ? (
                      <input
                        key={i}
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={p}
                        onChange={(e) => setPar(it.name, i, Math.max(0, parseFloat(e.target.value) || 0))}
                        className={`w-full rounded-md border px-0.5 py-1 text-center font-mono text-xs outline-none focus:border-brand ${
                          i === di ? 'border-brand/50 bg-brand/10 font-bold' : 'border-black/10 bg-white'
                        }`}
                      />
                    ) : (
                      <span
                        key={i}
                        className={`rounded-md py-1 text-center font-mono text-xs ${
                          i === di ? 'bg-brand/15 font-bold text-ink' : 'text-muted'
                        }`}
                      >
                        {fmtQty(p)}
                      </span>
                    ),
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={counted ? onHand[it.name] : ''}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value
                      setCount(it.name, v === '' ? undefined : Math.max(0, parseFloat(v) || 0))
                    }}
                    className="w-full justify-self-center rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center font-mono text-sm outline-none focus:border-brand"
                  />
                  <span className="text-right">
                    {n > 0 ? (
                      <span className="rounded-full bg-brand/15 px-2.5 py-1 font-mono text-xs font-extrabold text-brand-600">
                        {fmtQty(n)} {it.unit}
                      </span>
                    ) : counted ? (
                      <span className="rounded-full bg-up/10 px-2.5 py-1 text-xs font-extrabold text-up">✓ at par</span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </span>
                </div>
              )
            })}
            {editingPars && (
              <div className="flex flex-wrap gap-2 border-t border-black/5 p-3 print:hidden">
                <input
                  value={adding.name}
                  onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addItem()}
                  placeholder="Add prep item…"
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  value={adding.spec}
                  onChange={(e) => setAdding({ ...adding, spec: e.target.value })}
                  placeholder="Pan spec (Clear 1/6 pan…)"
                  className="w-52 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  value={adding.unit}
                  onChange={(e) => setAdding({ ...adding, unit: e.target.value })}
                  placeholder="unit"
                  className="w-24 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <button onClick={addItem} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
                  Add
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
