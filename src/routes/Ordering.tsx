import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Check } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { getOrdering, suggested, addOrderItem, setParEntry, vendors } from '../lib/ordering'
import { setOnGuide, getPriceLog, SHELVES } from '../lib/catalog'

const money2 = (n: number) => `$${n.toFixed(2)}`

/**
 * Orders — prototype layout: price ticker from real imports, shelf tabs,
 * Order guide / Order sheet views, printable, gold Place order. Guides are
 * drawn FROM the Item Catalog; order = par − on hand.
 */
export function Ordering() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => getOrdering(), [tick])
  const priceLog = useMemo(() => getPriceLog(), [])
  const all = useMemo(
    () => Object.entries(data).flatMap(([vendor, items]) => items.map((it) => ({ ...it, vendor }))),
    [data],
  )
  const shelvesPresent = useMemo(
    () => ['All', ...SHELVES.filter((s) => all.some((it) => it.category === s))],
    [all],
  )
  const [shelf, setShelf] = useState('All')
  const [view, setView] = useState<'guide' | 'sheet'>('guide')
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ name: '', vendor: 'US Foods', category: 'Food' })

  const items = all.filter((it) => shelf === 'All' || it.category === shelf)
  const needed = items.filter((x) => suggested(x) > 0)

  const removeFromGuide = async (it: { id: string; name: string }) => {
    if (
      await confirmDelete(
        `Take ${it.name} off this store's guide?`,
        'It stays in the Item Catalog — flip it back on anytime.',
        'Off guide',
      )
    ) {
      setOnGuide(it.id, false)
      refresh()
    }
  }

  const addItem = () => {
    if (!form.name.trim()) return
    addOrderItem(form.vendor, form.name.trim(), 'cs', 0, form.category)
    setForm((f) => ({ ...f, name: '' }))
    refresh()
  }

  const copyOrder = async () => {
    const lines = needed.map((it) => `${suggested(it)} ${it.unit} — ${it.name} (${it.vendor})`)
    const text = `Order — ${shelf === 'All' ? 'all shelves' : shelf}\n${lines.join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      alert(text)
    }
  }

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Drag pars up or down as volume moves · order = par − on hand · guides from the Item Catalog"
        right={
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1 print:hidden">
              <button
                onClick={() => setView('guide')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === 'guide' ? 'bg-navy text-white shadow-sm' : 'text-muted'}`}
              >
                Order guide
              </button>
              <button
                onClick={() => setView('sheet')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === 'sheet' ? 'bg-navy text-white shadow-sm' : 'text-muted'}`}
              >
                Order sheet
              </button>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white print:hidden"
            >
              <Printer size={13} /> Print {view === 'guide' ? 'order guide' : 'order sheet'}
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Price ticker — real changes from price-sheet/invoice imports */}
        {priceLog.length > 0 && (
          <div className="flex items-center overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm print:hidden">
            <span className="shrink-0 self-stretch bg-navy px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-white">
              ✓ Prices
            </span>
            <div className="flex gap-6 overflow-x-auto px-4 py-2 text-xs">
              {priceLog.slice(0, 12).map((c, i) => (
                <span key={i} className="flex shrink-0 items-baseline gap-1.5">
                  <b className="text-ink">{c.name}</b>
                  <span className="font-mono text-muted">
                    {c.oldCost != null ? `${money2(c.oldCost)}→` : ''}
                    {money2(c.newCost)}
                  </span>
                  {c.pct != null && (
                    <b className={c.pct >= 0 ? 'text-down' : 'text-up'}>
                      {c.pct >= 0 ? '▲ +' : '▼ '}
                      {c.pct.toFixed(0)}%
                    </b>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Shelf tabs */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex flex-wrap gap-1 rounded-xl bg-black/5 p-1">
            {shelvesPresent.map((s) => (
              <button
                key={s}
                onClick={() => setShelf(s)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold ${
                  shelf === s ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
            <Link to="/catalog" className="rounded-lg px-3.5 py-1.5 text-xs font-bold text-muted hover:text-ink">
              Catalog
            </Link>
          </div>
          <span className="text-xs text-muted">add items freely — pars save automatically</span>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="font-display text-lg font-semibold text-ink">
              {shelf === 'All' ? 'Full' : shelf} order {view} <span className="ml-1 text-sm font-normal text-muted">{(view === 'guide' ? items : needed).length} items</span>
            </span>
            {view === 'guide' ? (
              <button
                onClick={() => setView('sheet')}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white print:hidden"
              >
                Place order →
              </button>
            ) : (
              <button
                onClick={copyOrder}
                disabled={needed.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40 print:hidden"
              >
                {copied ? (
                  <>
                    <Check size={14} /> Copied
                  </>
                ) : (
                  'Copy order text'
                )}
              </button>
            )}
          </div>

          {/* Column headers */}
          <div
            className={`grid items-center gap-2 border-b border-black/10 px-4 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted ${
              view === 'guide' ? 'grid-cols-[minmax(0,1fr)_80px_64px]' : 'grid-cols-[minmax(0,1fr)_64px_64px_72px]'
            }`}
          >
            <span>Item</span>
            {view === 'guide' ? (
              <>
                <span className="text-right">Case $</span>
                <span className="text-center">Par</span>
              </>
            ) : (
              <>
                <span className="text-center">Par</span>
                <span className="text-center">On hand</span>
                <span className="text-center">Order</span>
              </>
            )}
          </div>

          {(view === 'guide' ? items : needed).length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">
              {view === 'guide'
                ? 'Nothing on this shelf yet — add an item below, drop an invoice on Imports, or flip items on from the Item Catalog.'
                : 'Nothing below par on this shelf — the sheet fills in as on-hand drops.'}
            </p>
          )}

          {(view === 'guide' ? items : needed).map((it) => {
            const need = suggested(it)
            return (
              <div
                key={it.id}
                className={`group grid items-center gap-2 border-b border-black/5 px-4 py-2.5 last:border-0 ${
                  view === 'guide' ? 'grid-cols-[minmax(0,1fr)_80px_64px]' : 'grid-cols-[minmax(0,1fr)_64px_64px_72px]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{it.name}</div>
                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <span>
                      {it.vendor} · {it.category}
                    </span>
                    {view === 'guide' && (
                      <button
                        onClick={() => removeFromGuide(it)}
                        className="opacity-0 transition-opacity hover:text-down group-hover:opacity-100 print:hidden"
                      >
                        off guide
                      </button>
                    )}
                  </div>
                </div>
                {view === 'guide' ? (
                  <>
                    <span className="text-right font-mono text-sm text-ink">
                      {it.cost != null ? money2(it.cost) : <span className="text-muted">—</span>}
                    </span>
                    <NumCell
                      value={it.par}
                      onChange={(v) => {
                        setParEntry(it.id, { par: v })
                        refresh()
                      }}
                    />
                  </>
                ) : (
                  <>
                    <span className="text-center font-mono text-sm text-muted">{it.par}</span>
                    <NumCell
                      value={it.onHand}
                      onChange={(v) => {
                        setParEntry(it.id, { onHand: v })
                        refresh()
                      }}
                    />
                    <div className={`text-center font-display text-lg font-semibold ${need > 0 ? 'text-brand' : 'text-ink/25'}`}>
                      {need > 0 ? `${need} ${it.unit}` : '—'}
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {view === 'guide' && (
            <div className="flex flex-wrap gap-2 p-3 print:hidden">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="Add item…"
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="rounded-lg border border-black/10 bg-white px-2 py-2 text-xs outline-none focus:border-brand"
              >
                {SHELVES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                className="rounded-lg border border-black/10 bg-white px-2 py-2 text-xs outline-none focus:border-brand"
              >
                {vendors().map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <button onClick={addItem} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">
                Add
              </button>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-muted print:hidden">
          Items added here register once in the <b>Item Catalog</b> — every store draws its own
          guide from that one list. Drop a delivery invoice on <b>Imports</b> to receive into
          on-hand and update case costs automatically.
        </p>
      </div>
    </>
  )
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      className="w-14 justify-self-center rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center text-sm outline-none focus:border-brand"
    />
  )
}
