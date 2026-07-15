import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Check, GripVertical, Plus } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { suggested, setParEntry, getReceiptLog } from '../lib/ordering'
import { getCatalog, getPars, getFlags, setOnGuide, getPriceLog, renameItem, setItemCost, setCatalog } from '../lib/catalog'
import {
  GUIDE_SHELVES,
  type GuideShelf,
  seedLiquorGuide,
  getGuideSections,
  setGuideSections,
  moveGuideItem,
  addGuideItem,
  onShelf,
} from '../lib/guide'
import { usePersistentState, today } from '../lib/store'
import { useIsPhone } from '../lib/useIsPhone'
import type { Night } from '../lib/nightly'
import { periodWeek } from '../lib/forecast'

const money2 = (n: number) => `$${(n ?? 0).toFixed(2)}`
const money0 = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

interface Row {
  id: string
  name: string
  unit: string
  par: number
  onHand: number
  cost?: number
  vendor: string
}

/** First day of the 28-day period containing the date (periods count from Jan 1). */
function periodStart(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const start = new Date(d.getFullYear(), 0, 1)
  const doy = Math.floor((d.getTime() - start.getTime()) / 86400000)
  const p = Math.min(13, Math.floor(doy / 28) + 1)
  const ps = new Date(d.getFullYear(), 0, 1 + (p - 1) * 28)
  return `${ps.getFullYear()}-${String(ps.getMonth() + 1).padStart(2, '0')}-${String(ps.getDate()).padStart(2, '0')}`
}

/**
 * Orders — one guide per shelf (Liquor / Beer / Produce), mirroring the
 * owner's paper sheets: named sections, items click-to-edit and draggable.
 * The Usage toggle shows the period: sales, what was ordered (each bottle)
 * and dollars spent, per product.
 */
export function Ordering() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)

  // Flowood's liquor guide seeds once from the owner's 2025 order sheet.
  useMemo(() => seedLiquorGuide(), [])

  const isPhone = useIsPhone()
  const priceLog = useMemo(() => getPriceLog(), [])
  const [shelf, setShelf] = useState<GuideShelf>('Liquor')
  const [view, setView] = useState<'guide' | 'usage'>('guide')
  const [copied, setCopied] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sections = useMemo(() => getGuideSections(shelf), [shelf, tick])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byId = useMemo(() => {
    const pars = getPars()
    return new Map<string, Row>(
      getCatalog().map((ci) => {
        const p = pars[ci.id] ?? { par: 0, onHand: 0 }
        return [ci.id, { id: ci.id, name: ci.name, unit: ci.unit, par: p.par, onHand: p.onHand, cost: ci.cost, vendor: ci.vendor }]
      }),
    )
  }, [tick])

  // "Other" tab only when non-shelf items are on the guide (food from invoices etc.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasOther = useMemo(() => {
    const flags = getFlags()
    return getCatalog().some((ci) => flags[ci.id] && onShelf(ci.category, 'Other'))
  }, [tick])
  const tabs: GuideShelf[] = hasOther ? [...GUIDE_SHELVES, 'Other'] : [...GUIDE_SHELVES]

  const allRows: Row[] = sections.flatMap((s) => s.ids.map((id) => byId.get(id)).filter((r): r is Row => !!r))
  const needed = allRows.filter((r) => suggested(r) > 0)

  // ── drag state (grip → row, within or across sections) ──
  const [drag, setDrag] = useState<{ sec: number; idx: number } | null>(null)
  const [over, setOver] = useState<{ sec: number; idx: number } | null>(null)

  // ── click-to-edit ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ name: '', unit: '', cost: '' })
  const openEdit = (r: Row) => {
    setEditingId(r.id)
    setEdit({ name: r.name, unit: r.unit, cost: r.cost != null ? String(r.cost) : '' })
  }
  const commitEdit = () => {
    if (!editingId) return
    renameItem(editingId, edit.name)
    const items = getCatalog()
    const it = items.find((x) => x.id === editingId)
    if (it && edit.unit.trim() && it.unit !== edit.unit.trim()) {
      it.unit = edit.unit.trim()
      setCatalog(items)
    }
    const c = parseFloat(edit.cost)
    if (Number.isFinite(c) && c > 0) setItemCost(editingId, c, 'manual edit') // ties into pricing everywhere
    setEditingId(null)
    refresh()
  }

  const [adding, setAdding] = useState<{ sec: number; name: string } | null>(null)

  const removeFromGuide = async (r: Row) => {
    if (
      await confirmDelete(`Take ${r.name} off this store's guide?`, 'It stays in the Item Catalog — flip it back on anytime.', 'Off guide')
    ) {
      setOnGuide(r.id, false)
      refresh()
    }
  }

  const copyOrder = async () => {
    const lines = needed.map((r) => `${suggested(r)} ${r.unit} — ${r.name}`)
    const text = `${shelf} order — ${today()}\n${lines.join('\n')}`
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
        subtitle={
          isPhone
            ? 'Count on-hand — order = par − on hand · edit pars, prices & layout on a computer'
            : 'One guide per shelf, laid out like your paper sheet · order = par − on hand · click an item to edit it, drag ⠿ to move it'
        }
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
                onClick={() => setView('usage')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === 'usage' ? 'bg-navy text-white shadow-sm' : 'text-muted'}`}
              >
                Usage
              </button>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white print:hidden"
            >
              <Printer size={13} /> Print
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

        {/* Shelf tabs — Liquor / Beer / Produce, each its own guide */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex flex-wrap gap-1 rounded-xl bg-black/5 p-1">
            {tabs.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setShelf(s)
                  setEditingId(null)
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold ${
                  shelf === s ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {s === 'Other' ? 'Food & other' : s}
              </button>
            ))}
          </div>
          <Link to="/catalog" className="text-xs font-bold text-brand">
            Item Catalog →
          </Link>
        </div>

        {view === 'usage' ? (
          <Usage shelf={shelf} rows={allRows} />
        ) : isPhone ? (
          /* Phone: a fast count list — set on-hand, see the order. Drag,
             inline price edits and per-section adds stay on the desktop. */
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <span className="font-display text-base font-semibold text-ink">
                {shelf} order <span className="text-sm font-normal text-muted">{allRows.length}</span>
              </span>
              <button
                onClick={copyOrder}
                disabled={needed.length === 0}
                className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                {copied ? '✓ Copied' : `Copy order (${needed.length})`}
              </button>
            </div>
            {allRows.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">Nothing on this guide yet — drop an invoice on Imports, or add items on a computer.</p>
            )}
            {sections.map((sec, si) => (
              <div key={sec.title + si}>
                <div className="border-b border-brand/20 bg-brand/[0.07] px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-600">
                  {sec.title}
                </div>
                {sec.ids.map((id) => {
                  const r = byId.get(id)
                  if (!r) return null
                  const need = suggested(r)
                  return (
                    <div key={id} className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{r.name}</div>
                        <div className="text-[11px] text-muted">
                          par {r.par}
                          {r.cost != null ? ` · ${money2(r.cost)}` : ''}
                        </div>
                      </div>
                      <label className="flex shrink-0 flex-col items-center text-[9px] font-bold uppercase text-muted">
                        On hand
                        <input
                          type="number"
                          inputMode="decimal"
                          value={r.onHand || ''}
                          placeholder="0"
                          onChange={(e) => {
                            setParEntry(r.id, { onHand: Math.max(0, parseFloat(e.target.value) || 0) })
                            refresh()
                          }}
                          className="mt-0.5 w-16 rounded-lg border border-black/15 bg-white px-1 py-2 text-center font-mono text-base text-ink outline-none focus:border-brand"
                        />
                      </label>
                      <div className={`w-16 shrink-0 text-right font-display text-lg font-semibold ${need > 0 ? 'text-brand' : 'text-ink/25'}`}>
                        {need > 0 ? `${need} ${r.unit}` : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <p className="px-4 py-2.5 text-[11px] text-muted">Order = par − on hand. Edit pars, prices &amp; layout on a computer.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-display text-lg font-semibold text-ink">
                {shelf} order guide <span className="ml-1 text-sm font-normal text-muted">{allRows.length} items</span>
              </span>
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
                  `Copy order (${needed.length})`
                )}
              </button>
            </div>

            <div className="grid grid-cols-[20px_minmax(0,1fr)_76px_56px_64px_72px] items-center gap-2 border-b border-black/10 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <span />
              <span>Item</span>
              <span className="text-right">$ / {shelf === 'Liquor' ? 'btl' : 'case'}</span>
              <span className="text-center">Par</span>
              <span className="text-center">On hand</span>
              <span className="text-right">Order</span>
            </div>

            {allRows.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">
                Nothing on this guide yet — add items below, drop an invoice on Imports, or flip items on from the Item Catalog.
              </p>
            )}

            {sections.map((sec, si) => (
              <div key={sec.title + si}>
                {/* Section header — the paper sheet's VODKA / RUM / WHISKEY bands */}
                <div
                  onDragOver={(e) => {
                    if (!drag) return
                    e.preventDefault()
                    setOver({ sec: si, idx: 0 })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (drag) {
                      moveGuideItem(shelf, drag, { sec: si, idx: 0 })
                      refresh()
                    }
                    setDrag(null)
                    setOver(null)
                  }}
                  className="flex items-center justify-between border-b border-brand/20 bg-brand/[0.07] px-4 py-1.5"
                >
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600">
                    {sec.title} <span className="ml-1 font-semibold text-muted">{sec.ids.length}</span>
                  </span>
                  <button
                    onClick={() => setAdding({ sec: si, name: '' })}
                    title={`Add an item to ${sec.title}`}
                    className="text-muted/60 hover:text-brand-600 print:hidden"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {adding?.sec === si && (
                  <div className="flex gap-2 border-b border-black/5 bg-brand/[0.03] px-4 py-2 print:hidden">
                    <input
                      autoFocus
                      value={adding.name}
                      onChange={(e) => setAdding({ sec: si, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && adding.name.trim()) {
                          addGuideItem(shelf, si, adding.name.trim(), shelf === 'Liquor' ? 'btl' : 'cs')
                          setAdding(null)
                          refresh()
                        }
                        if (e.key === 'Escape') setAdding(null)
                      }}
                      placeholder={`New ${sec.title} item — Enter to add`}
                      className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
                    />
                    <button onClick={() => setAdding(null)} className="text-xs font-semibold text-muted">
                      cancel
                    </button>
                  </div>
                )}
                {sec.ids.map((id, idx) => {
                  const r = byId.get(id)
                  if (!r) return null
                  const need = suggested(r)
                  const isOver = over?.sec === si && over.idx === idx && !(drag?.sec === si && drag.idx === idx)
                  return (
                    <div key={id}>
                      <div
                        onDragOver={(e) => {
                          if (!drag) return
                          e.preventDefault()
                          setOver({ sec: si, idx })
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (drag) {
                            moveGuideItem(shelf, drag, { sec: si, idx })
                            refresh()
                          }
                          setDrag(null)
                          setOver(null)
                        }}
                        className={`group grid grid-cols-[20px_minmax(0,1fr)_76px_56px_64px_72px] items-center gap-2 border-b border-black/5 px-4 py-2 ${
                          drag?.sec === si && drag.idx === idx ? 'opacity-40' : ''
                        } ${isOver ? 'border-t-2 border-t-brand' : ''}`}
                      >
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDrag({ sec: si, idx })
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', r.name)
                          }}
                          onDragEnd={() => {
                            setDrag(null)
                            setOver(null)
                          }}
                          title="Drag to reorder — across sections too"
                          className="cursor-grab text-muted/40 hover:text-ink active:cursor-grabbing print:hidden"
                        >
                          <GripVertical size={14} />
                        </span>
                        <button
                          onClick={() => (editingId === r.id ? setEditingId(null) : openEdit(r))}
                          className="min-w-0 text-left"
                          title="Click to edit this item"
                        >
                          <span className="block truncate text-sm font-medium text-ink group-hover:text-brand-600">{r.name}</span>
                        </button>
                        <span className="text-right font-mono text-sm text-ink">
                          {r.cost != null ? money2(r.cost) : <span className="text-muted">—</span>}
                        </span>
                        <NumCell value={r.par} onChange={(v) => { setParEntry(r.id, { par: v }); refresh() }} />
                        <NumCell value={r.onHand} onChange={(v) => { setParEntry(r.id, { onHand: v }); refresh() }} />
                        <div className={`text-right font-display text-base font-semibold ${need > 0 ? 'text-brand' : 'text-ink/25'}`}>
                          {need > 0 ? `${need} ${r.unit}` : '—'}
                        </div>
                      </div>
                      {editingId === r.id && (
                        <div className="flex flex-wrap items-end gap-2 border-b border-brand/20 bg-brand/[0.05] px-4 py-2.5 print:hidden">
                          <label className="min-w-0 flex-1 text-[10px] font-bold uppercase text-muted">
                            Name
                            <input
                              value={edit.name}
                              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                              className="mt-0.5 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium normal-case text-ink outline-none focus:border-brand"
                            />
                          </label>
                          <label className="w-20 text-[10px] font-bold uppercase text-muted">
                            Unit
                            <input
                              value={edit.unit}
                              onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                              className="mt-0.5 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-center text-sm normal-case text-ink outline-none focus:border-brand"
                            />
                          </label>
                          <label className="w-24 text-[10px] font-bold uppercase text-muted">
                            Cost $
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={edit.cost}
                              onChange={(e) => setEdit({ ...edit, cost: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                              className="mt-0.5 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-right font-mono text-sm text-ink outline-none focus:border-brand"
                            />
                          </label>
                          <button onClick={commitEdit} className="rounded-lg bg-brand px-3.5 py-2 text-xs font-bold text-white">
                            Save
                          </button>
                          <button onClick={() => void removeFromGuide(r)} className="rounded-lg border border-down/30 px-3 py-2 text-xs font-bold text-down">
                            Off guide
                          </button>
                          <span className="basis-full text-[10px] text-muted">
                            Cost changes flow everywhere — catalog, price ticker, costs page. Old spellings keep matching imports.
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </Card>
        )}

        <p className="text-[11px] text-muted print:hidden">
          Guides are stored per store; items live once in the Item Catalog. Direct vendor-API ordering plugs in on the
          Connections page when your reps support it.
        </p>
      </div>
    </>
  )
}

/** Usage — the period story for one shelf: sales, purchases, per-product usage. */
function Usage({ shelf, rows }: { shelf: GuideShelf; rows: Row[] }) {
  const t = today()
  const start = periodStart(t)
  const pw = periodWeek(t)
  const [nights] = usePersistentState<Night[]>('nightly:log', [])

  const catKey = shelf === 'Liquor' ? 'liquor' : shelf === 'Beer' ? 'beer' : 'food'
  const sales = nights
    .filter((n) => n.date >= start && n.date <= t)
    .reduce((s, n) => s + ((n as unknown as Record<string, number | undefined>)[catKey] ?? 0), 0)

  const ids = new Set(rows.map((r) => r.id))
  const receipts = getReceiptLog().filter((r) => ids.has(r.itemId) && r.date >= start && r.date <= t)
  const spent = receipts.reduce((s, r) => s + r.qty * (r.cost ?? 0), 0)
  const units = receipts.reduce((s, r) => s + r.qty, 0)

  const perItem = rows
    .map((r) => {
      const mine = receipts.filter((x) => x.itemId === r.id)
      return {
        ...r,
        received: mine.reduce((s, x) => s + x.qty, 0),
        dollars: mine.reduce((s, x) => s + x.qty * (x.cost ?? 0), 0),
      }
    })
    .sort((a, b) => b.dollars - a.dollars || b.received - a.received)
  const active = perItem.filter((r) => r.received > 0)

  const unitWord = shelf === 'Liquor' ? 'bottles' : 'cases'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted">
            {shelf === 'Produce' ? 'Food sales' : `${shelf} sales`} · Period {pw.period}
          </div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">{sales > 0 ? money0(sales) : '—'}</div>
          <div className="text-[11px] text-muted">{sales > 0 ? `${start} → today, from Nightly Numbers` : 'logs nightly category sales to fill in'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Ordered this period</div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">{money0(spent)}</div>
          <div className="text-[11px] text-muted">
            {units} {unitWord} received across {receipts.length} invoice lines
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{shelf === 'Produce' ? 'Cost of sales' : 'Pour cost'}</div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">
            {sales > 0 && spent > 0 ? `${((spent / sales) * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[11px] text-muted">purchases ÷ sales, this period</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-baseline justify-between px-4 py-3">
          <span className="font-display text-lg font-semibold text-ink">Usage by product · Period {pw.period}</span>
          <span className="text-xs text-muted">{active.length ? `${active.length} products moved` : ''}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1.6fr)_90px_90px_70px_60px] items-center gap-2 border-b border-black/10 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">
          <span>Product</span>
          <span className="text-right">Received</span>
          <span className="text-right">$ spent</span>
          <span className="text-center">On hand</span>
          <span className="text-center">Par</span>
        </div>
        {active.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Nothing received this period yet — drop invoices on Imports and every line lands here with its bottle count and price.
          </p>
        ) : (
          (
            [...active, ...perItem.filter((r) => r.received === 0)] // movers first, rest below
          ).map((r) => (
            <div
              key={r.id}
              className={`grid grid-cols-[minmax(0,1.6fr)_90px_90px_70px_60px] items-center gap-2 border-b border-black/5 px-4 py-2 last:border-0 ${
                r.received === 0 ? 'opacity-45' : ''
              }`}
            >
              <span className="truncate text-sm font-medium text-ink">{r.name}</span>
              <span className="text-right font-mono text-sm text-ink">
                {r.received > 0 ? `${r.received} ${r.unit}` : '—'}
              </span>
              <span className="text-right font-mono text-sm text-ink">{r.dollars > 0 ? money2(r.dollars) : '—'}</span>
              <span className="text-center font-mono text-xs text-muted">{r.onHand}</span>
              <span className="text-center font-mono text-xs text-muted">{r.par}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value || ''}
      placeholder="0"
      onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
      className="w-full rounded-lg border border-black/10 bg-white px-1 py-1 text-center font-mono text-sm outline-none focus:border-brand"
    />
  )
}
