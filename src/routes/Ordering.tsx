import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { Printer, Check, GripVertical, Plus, PackageOpen, ChevronUp, ChevronDown, Archive } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { Page, Card } from '../components/ui'
import { entryColumn, entryField } from '../lib/nextfield'
import { suggested, setParEntry, getReceiptLog, getParEdits, vendors } from '../lib/ordering'
import { getCatalog, getPars, getFlags, setParked, getPriceLog, renameItem, setItemCost, setItemVendor, setCatalog, updateItem } from '../lib/catalog'
import {
  GUIDE_SHELVES,
  seedProduceGuide,
  seedUsFoodsGuide,
  VENDOR_GUIDES,
  isVendorGuide,
  type GuideShelf,
  seedLiquorGuide,
  getGuideSections,
  setGuideSections,
  moveGuideItem,
  addGuideItem,
  onShelf,
} from '../lib/guide'
import { GuideSheet } from '../components/GuideSheet'
import { seedLiquorPrices } from '../lib/priceseed'
import { usePersistentState, today } from '../lib/store'
import { useIsPhone } from '../lib/useIsPhone'
import type { Night } from '../lib/nightly'
import { periodWeek, periodStart } from '../lib/forecast'
import { ordersDueOn, type OrderSchedule } from '../lib/orderDays'

const money2 = (n: number) => `$${(n ?? 0).toFixed(2)}`
const money0 = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

interface Row {
  id: string
  name: string
  unit: string
  par: number
  onHand: number
  /** Second par, where a sheet prints one — see parToday(). */
  parF?: number
  /** Pack size off the order guide: 24 CT, 4/3 LB, 20 LB. */
  size?: string
  /** The vendor's product number — the sheet prints it before the name, and
   *  it is what you read to the rep or key into their site. */
  code?: string
  cost?: number
  vendor: string
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

  // Flowood's liquor guide seeds once from the owner's 2025 order sheet; the
  // produce guide seeds for every store, each getting its own copy.
  useMemo(() => seedLiquorGuide(), [])
  useMemo(() => seedProduceGuide(), [])
  useMemo(() => seedUsFoodsGuide(), [])
  // Bottle prices off the Lincoln Road receipts — after the liquor guide, so
  // they land on items that already exist rather than creating them twice.
  useMemo(() => seedLiquorPrices(), [])

  const isPhone = useIsPhone()
  const priceLog = useMemo(() => getPriceLog(), [])
  const [shelf, setShelf] = useState<GuideShelf>('Liquor')
  const [view, setView] = useState<'guide' | 'usage'>('guide')
  const [copied, setCopied] = useState(false)
  // Produce is ordered twice a week to two different levels, so its guide shows
  // both columns the paper sheet does. Every other shelf has one par and gets
  // one column — an empty "F par" on the liquor guide is a question nobody can
  // answer. Fri–Sun the Order column counts against F; Mon–Thu against M.
  // Produce and the US Foods sheet are both ordered twice a week to different
  // levels, so both print — and edit — the paper sheet's two columns.
  const twoPar = shelf === 'Produce' || isVendorGuide(shelf)
  const onF = [5, 6, 0].includes(new Date().getDay())
  const gridCols = twoPar
    ? 'grid-cols-[20px_minmax(0,1fr)_76px_52px_52px_60px_68px]'
    : 'grid-cols-[20px_minmax(0,1fr)_76px_56px_64px_72px]'

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sections = useMemo(() => getGuideSections(shelf), [shelf, tick])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byId = useMemo(() => {
    const pars = getPars()
    return new Map<string, Row>(
      getCatalog().map((ci) => {
        const p = pars[ci.id] ?? { par: 0, onHand: 0 }
        return [ci.id, { id: ci.id, name: ci.name, unit: ci.unit, par: p.par, parF: p.parF, size: ci.size, code: ci.code, onHand: p.onHand, cost: ci.cost, vendor: ci.vendor }]
      }),
    )
  }, [tick])

  // "Other" tab only when non-shelf items are on the guide (food from invoices etc.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasOther = useMemo(() => {
    const flags = getFlags()
    return getCatalog().some((ci) => flags[ci.id] && onShelf(ci.category, 'Other', ci.vendor))
  }, [tick])
  // A vendor's tab appears once anything of theirs is on the guide — for US
  // Foods that is the moment the seed runs, so in practice always.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vendorTabs = useMemo(() => {
    const flags = getFlags()
    const cat = getCatalog()
    return VENDOR_GUIDES.filter((v) => cat.some((ci) => flags[ci.id] && ci.vendor === v))
  }, [tick])
  const tabs: GuideShelf[] = [...GUIDE_SHELVES, ...vendorTabs, ...(hasOther ? (['Other'] as const) : [])]

  const allRows: Row[] = sections.flatMap((s) => s.ids.map((id) => byId.get(id)).filter((r): r is Row => !!r))
  const needed = allRows.filter((r) => suggested(r) > 0)

  // Which vendor's order is being counted, if any. Landing here from the
  // dashboard's "orders to place" tile pre-selects it, so the screen opens on
  // the job you clicked rather than on the whole catalogue.
  const [params, setParams] = useSearchParams()
  const dueToday = useMemo<OrderSchedule[]>(() => ordersDueOn(today()), [])
  const [vendorFilter, setVendorFilter] = useState('')
  const askedVendor = params.get('vendor')
  useEffect(() => {
    if (!askedVendor) return
    // A vendor with a guide of their own opens on that guide — filtering the
    // liquor shelf down to US Foods would show an empty table. Otherwise, only
    // honour a vendor that's actually due — a stale link shouldn't hide the
    // whole guide behind a filter nothing explains.
    if (isVendorGuide(askedVendor)) setShelf(askedVendor)
    else if (dueToday.some((s) => s.vendor === askedVendor)) setVendorFilter(askedVendor)
    setParams({}, { replace: true })
    // Keyed to the param, NOT to mount: this is a hash router, so arriving here
    // from a link while already on the page changes the query without
    // remounting, and a mount-only effect would quietly ignore it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedVendor])


  /**
   * The guide as it should render right now.
   *
   * With a vendor selected the rows narrow to that vendor and empty sections
   * drop out — but the section's REAL index travels with it, because drag-drop
   * writes by index and a filtered list would otherwise reorder the wrong row.
   * Reordering is disabled outright while filtered, for the same reason: the
   * row index inside a section shifts too.
   */
  const shownSections = useMemo(() => {
    const withIdx = sections.map((sec, si) => ({ sec, si }))
    if (!vendorFilter) return withIdx
    return withIdx
      .map(({ sec, si }) => ({
        sec: { ...sec, ids: sec.ids.filter((id) => (byId.get(id)?.vendor ?? '') === vendorFilter) },
        si,
      }))
      .filter((x) => x.sec.ids.length > 0)
  }, [sections, vendorFilter, byId])


  /** Which shelves carry a vendor's guide items — for the "wrong shelf" hint. */
  const shelvesFor = (vendor: string): GuideShelf[] =>
    tabs.filter((sh) =>
      getGuideSections(sh).some((sec) =>
        sec.ids.some((id) => (byId.get(id)?.vendor ?? '') === vendor),
      ),
    )


  // What's on screen right now — the header count and Copy button read this, so
  // a filtered guide doesn't claim 79 items while showing four.
  const shownRows: Row[] = shownSections.flatMap(({ sec }) =>
    sec.ids.map((id) => byId.get(id)).filter((r): r is Row => !!r),
  )
  const shownNeeded = shownRows.filter((r) => suggested(r) > 0)

  // ── drag state (grip → row, within or across sections) ──
  const [drag, setDrag] = useState<{ sec: number; idx: number } | null>(null)
  const [over, setOver] = useState<{ sec: number; idx: number } | null>(null)

  // ── click-to-edit ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ name: '', unit: '', cost: '', vendor: '', code: '' })
  // Which field to land the cursor on when the editor opens — click the name to
  // edit the name, click the price to edit the price.
  const [editFocus, setEditFocus] = useState<'name' | 'cost'>('name')
  const openEdit = (r: Row, focus: 'name' | 'cost' = 'name') => {
    setEditingId(r.id)
    setEditFocus(focus)
    setEdit({ name: r.name, unit: r.unit, cost: r.cost != null ? String(r.cost) : '', vendor: r.vendor ?? '', code: r.code ?? '' })
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
    setItemVendor(editingId, edit.vendor)
    // The product number is only offered on a vendor's guide — it is their
    // number, and the sheet prints it. Clearing the box clears it.
    if (isVendorGuide(shelf)) updateItem(editingId, { code: edit.code.replace(/^#/, '') })
    setEditingId(null)
    refresh()
  }

  /**
   * Printing the guide.
   *
   * The sheet is rendered off-screen only while the print dialog is up — same
   * arrangement as Printables — so what comes out of the printer is the ruled
   * count sheet rather than a photograph of the app.
   */
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    if (!printing) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    return () => cancelAnimationFrame(id)
  }, [printing])
  useEffect(() => {
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    return () => window.removeEventListener('afterprint', done)
  }, [])

  const [adding, setAdding] = useState<{ sec: number; name: string; code: string } | null>(null)
  const commitAdd = () => {
    if (!adding || !adding.name.trim()) return
    addGuideItem(
      shelf,
      adding.sec,
      adding.name.trim(),
      shelf === 'Liquor' ? 'btl' : 'cs',
      isVendorGuide(shelf) ? adding.code.replace(/^#/, '').trim() : '',
    )
    setAdding(null)
    refresh()
  }

  /**
   * Park it, don't drop it.
   *
   * "Off guide" left an item in limbo — gone from the sheet, still in the
   * catalog, with nowhere that listed what had been taken off. Parking is the
   * same move with a shelf to land on: Item Catalog → Parked, price, product
   * number and learned invoice spellings intact, one tap to bring back. The
   * catalog is shared by both stores, so parking is too.
   */
  const parkItem = async (r: Row) => {
    if (
      await confirmDelete(
        `Park ${r.name}?`,
        'Comes off the order guides and waits in Item Catalog → Parked, with its price and history. Un-park it any time.',
        'Park it',
      )
    ) {
      setParked(r.id, true)
      setEditingId(null)
      refresh()
    }
  }

  // A shelf's items can come from more than one distributor (e.g. beer split
  // between Capital City and Southern Beverage). Group the order by vendor so
  // each distributor gets its own list to copy + send.
  const orderVendors = useMemo(() => {
    const groups = new Map<string, Row[]>()
    // shownNeeded: while a vendor is selected, offering "Copy Unassigned (73)"
    // beside it contradicts the filter the screen is showing.
    for (const r of shownNeeded) {
      const v = (r.vendor || '').trim() || 'Unassigned'
      ;(groups.get(v) ?? groups.set(v, []).get(v)!).push(r)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shownNeeded])
  const [copiedVendor, setCopiedVendor] = useState<string | null>(null)

  const copyOrder = async (vendor?: string) => {
    // shownNeeded, not needed: copying while a vendor is selected should copy
    // what's on screen, not the whole shelf.
    const rows = vendor ? needed.filter((r) => ((r.vendor || '').trim() || 'Unassigned') === vendor) : shownNeeded
    const lines = rows.map((r) => `${suggested(r)} ${r.unit}${r.code ? ` · #${r.code}` : ''} — ${r.name}`)
    const head = vendor && vendor !== 'Unassigned' ? `${shelf} order · ${vendor}` : `${shelf} order`
    const text = `${head} — ${today()}\n${lines.join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopiedVendor(vendor ?? '__all__')
      setTimeout(() => { setCopied(false); setCopiedVendor(null) }, 2500)
    } catch {
      alert(text)
    }
  }

  /**
   * One button, unless the shelf genuinely ships from two places.
   *
   * The split exists for beer, which comes from Capital City AND Southern
   * Beverage. It started firing on the liquor guide the moment 26 bottles got
   * a vendor off a receipt: "Copy Lincoln Road Package Store (24)" beside
   * "Copy Unassigned (54)" — two buttons, neither of which says what it does,
   * for a shelf that is one order to one package store. So the split needs
   * TWO NAMED vendors; one named vendor plus items nobody has assigned yet is
   * one order.
   */
  const namedVendors = orderVendors.filter(([v]) => v !== 'Unassigned')
  const splitByVendor = namedVendors.length > 1

  // One "Copy order" when the shelf ships from a single distributor; one button
  // per vendor when it's split (beer → Capital City + Southern Beverage).
  const CopyButtons = ({ size = 'lg' }: { size?: 'lg' | 'sm' }) => {
    const base =
      size === 'lg'
        ? 'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40 print:hidden'
        : 'rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40'
    if (!splitByVendor)
      return (
        <button
          onClick={() => copyOrder()}
          disabled={shownNeeded.length === 0}
          title="Copies tonight's order as text — quantity, unit and item — ready to send to your rep"
          className={`${base} bg-brand text-white`}
        >
          {copied ? '✓ Copied' : `Copy order (${shownNeeded.length})`}
        </button>
      )
    return (
      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        {orderVendors.map(([v, rows]) => (
          <button
            key={v}
            onClick={() => copyOrder(v)}
            title={
              v === 'Unassigned'
                ? "These items have no vendor set — click an item and fill in “Order from” to put it on a rep's list"
                : `Copies just ${v}'s items as text, ready to send`
            }
            className={`${base} bg-brand text-white`}
          >
            {copiedVendor === v ? '✓ Copied' : `Copy ${v === 'Unassigned' ? 'the rest' : v} (${rows.length})`}
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      <datalist id="vendor-options">
        {vendors().map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <Page
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
            {/* Prints the SHEET, not the screen. Printing the page gave you
                the app's own layout — no ruled boxes, nothing to write a count
                in — which is not what anyone carries into a stock room. */}
            <button
              onClick={() => setPrinting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white print:hidden"
            >
              <Printer size={13} /> Print
            </button>
          </div>
        }
        flush
        className="space-y-4"
      >
        {/* What's actually due today.
            The dashboard's "orders to place" tile used to drop you here on
            whatever shelf happened to be open, with nothing saying WHICH order
            was due or when it had to go — you had to remember what the tile
            said and then go find it. This is the tile's other half: the vendors
            due, their cutoff, and one tap to count just that vendor. */}
        {dueToday.length > 0 && view === 'guide' && (
          <Card className="border-brand/25 bg-brand/[0.06] p-3 print:hidden">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/20 text-brand-600">
                <PackageOpen size={15} />
              </span>
              <span className="font-display text-sm font-bold text-ink">Due today</span>
              {vendorFilter && (
                <button
                  onClick={() => setVendorFilter('')}
                  className="ml-auto rounded-lg px-2 py-1 text-[11px] font-bold text-muted hover:text-ink"
                >
                  Show everything
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {dueToday.map((s) => {
                // A vendor with their own guide is "on" when their tab is
                // open — that tab IS the filter, so there is nothing to toggle.
                const ownGuide = isVendorGuide(s.vendor)
                const on = ownGuide ? shelf === s.vendor : vendorFilter === s.vendor
                const owed = allRows.filter(
                  (r) => (r.vendor ?? '') === s.vendor && suggested(r) > 0,
                ).length
                return (
                  <button
                    key={s.vendor}
                    onClick={() => {
                      if (ownGuide) {
                        setShelf(s.vendor as GuideShelf)
                        setVendorFilter('')
                        setEditingId(null)
                      } else setVendorFilter(on ? '' : s.vendor)
                    }}
                    aria-pressed={on}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      on ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white hover:border-brand/50'
                    }`}
                  >
                    <span className="block text-sm font-bold">{s.vendor}</span>
                    <span className={`block text-[11px] ${on ? 'text-white/75' : 'text-muted'}`}>
                      {s.cutoff ? `by ${s.cutoff}` : 'no cutoff set'}
                      {owed > 0 && ` · ${owed} to order on this shelf`}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* A vendor's items are not necessarily on the shelf you happen
                to be looking at — a beer distributor's list is empty under
                Liquor, and an empty table with no explanation is exactly the
                dead end this strip exists to stop. So when the current shelf
                has none of theirs, say which shelf does and go there in a tap. */}
            {vendorFilter && shownSections.length === 0 ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-warn">
                No {shelf.toLowerCase()} items are assigned to {vendorFilter}.
                {shelvesFor(vendorFilter).length > 0 ? (
                  <>
                    <span className="text-muted">Theirs are on:</span>
                    {shelvesFor(vendorFilter).map((sh) => (
                      <button
                        key={sh}
                        onClick={() => setShelf(sh)}
                        className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white"
                      >
                        {sh}
                      </button>
                    ))}
                  </>
                ) : (
                  <span className="text-muted">
                    Set their vendor on the items in the Item Catalog and they'll appear here.
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-muted">
                {vendorFilter
                  ? `${vendorFilter} only — count on-hand and the order fills itself in.`
                  : 'Tap a vendor to count just their items.'}
              </p>
            )}
          </Card>
        )}

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
                  // A vendor's tab is already only their items; a lingering
                  // filter would only hide the drag grips.
                  if (isVendorGuide(s)) setVendorFilter('')
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
                {shelf} order <span className="text-sm font-normal text-muted">{shownRows.length}</span>
              </span>
              <CopyButtons size="sm" />
            </div>
            {allRows.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">Nothing on this guide yet — drop an invoice on Imports, or add items on a computer.</p>
            )}
            <div {...entryColumn}>
            {/* Enter in a count box drops to the same box on the next line. */}
            {shownSections.map(({ sec, si }) => (
              <div key={sec.title + si}>
                <div className="border-b border-brand/25 bg-brand/[0.06] px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-600">
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
                          {...entryField('onhand')}
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
            </div>
            <p className="px-4 py-2.5 text-[11px] text-muted">Order = par − on hand. Edit pars, prices &amp; layout on a computer.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-display text-lg font-semibold text-ink">
                {shelf} order guide <span className="ml-1 text-sm font-normal text-muted">{shownRows.length} items</span>
              </span>
              <CopyButtons size="lg" />
            </div>

            <div className={`grid ${gridCols} items-center gap-2 border-b border-black/10 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted`}>
              <span />
              <span>Item</span>
              <span className="text-right">$ / {shelf === 'Liquor' ? 'btl' : isVendorGuide(shelf) ? 'unit' : 'case'}</span>
              {twoPar ? (
                <>
                  {/* The paper sheet's two columns, kept as two. Today's is lit,
                      because that is the one the Order column is counting. */}
                  <span className={`text-center ${onF ? '' : 'text-brand-600'}`}>M par</span>
                  <span className={`text-center ${onF ? 'text-brand-600' : ''}`}>F par</span>
                </>
              ) : (
                <span className="text-center">Par</span>
              )}
              <span className="text-center">On hand</span>
              <span className="text-right">Order</span>
            </div>

            {allRows.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">
                Nothing on this guide yet — add items below, drop an invoice on Imports, or flip items on from the Item Catalog.
              </p>
            )}

            <div {...entryColumn}>
            {/* Enter in a count box drops to the same box on the next line. */}
            {shownSections.map(({ sec, si }) => (
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
                  className="flex items-center justify-between border-b border-brand/25 bg-brand/[0.06] px-4 py-1.5"
                >
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600">
                    {sec.title} <span className="ml-1 font-semibold text-muted">{sec.ids.length}</span>
                  </span>
                  <button
                    onClick={() => setAdding({ sec: si, name: '', code: '' })}
                    title={`Add an item to ${sec.title}`}
                    className="text-muted/60 hover:text-brand-600 print:hidden"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {adding?.sec === si && (
                  <div className="flex gap-2 border-b border-black/5 bg-brand/[0.03] px-4 py-2 print:hidden">
                    {/* On a vendor's guide the product number comes first, the
                        way it reads on their sheet and their site. */}
                    {isVendorGuide(shelf) && (
                      <input
                        autoFocus
                        value={adding.code}
                        inputMode="numeric"
                        onChange={(e) => setAdding({ ...adding, code: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitAdd()
                          if (e.key === 'Escape') setAdding(null)
                        }}
                        placeholder="product #"
                        className="w-28 rounded-lg border border-black/10 bg-white px-3 py-1.5 font-mono text-sm outline-none focus:border-brand"
                      />
                    )}
                    <input
                      autoFocus={!isVendorGuide(shelf)}
                      value={adding.name}
                      onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitAdd()
                        if (e.key === 'Escape') setAdding(null)
                      }}
                      placeholder={`New ${sec.title} item — Enter to add`}
                      className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
                    />
                    <button
                      onClick={commitAdd}
                      disabled={!adding.name.trim()}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                    >
                      Add
                    </button>
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
                        className={`group grid ${gridCols} items-center gap-2 border-b border-black/5 px-4 py-2 ${
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
                          hidden={!!vendorFilter}
                          className="cursor-grab text-muted/40 hover:text-ink active:cursor-grabbing print:hidden"
                        >
                          <GripVertical size={14} />
                        </span>
                        <button
                          onClick={() => (editingId === r.id ? setEditingId(null) : openEdit(r, 'name'))}
                          className="min-w-0 text-left"
                          title="Click to edit this item"
                        >
                          <span className="block truncate text-sm font-medium text-ink group-hover:text-brand-600">
                            {isVendorGuide(shelf) && r.code && (
                              <span className="mr-1.5 font-mono text-[11px] font-normal text-muted">#{r.code}</span>
                            )}
                            {r.name}
                          </span>
                          {r.size && <span className="block truncate font-mono text-[10px] text-muted">{r.size}</span>}
                        </button>
                        <button
                          onClick={() => (editingId === r.id ? setEditingId(null) : openEdit(r, 'cost'))}
                          className="text-right font-mono text-sm text-ink hover:text-brand-600"
                          title="Click to edit the price"
                        >
                          {r.cost != null ? money2(r.cost) : <span className="text-muted underline decoration-dotted underline-offset-2">add $</span>}
                        </button>
                        <NumCell col="par" value={r.par} onChange={(v) => { setParEntry(r.id, { par: v }); refresh() }} />
                        {twoPar && (
                          <NumCell col="parf" value={r.parF ?? r.par} onChange={(v) => { setParEntry(r.id, { parF: v }); refresh() }} />
                        )}
                        <NumCell col="onhand" value={r.onHand} onChange={(v) => { setParEntry(r.id, { onHand: v }); refresh() }} />
                        <div className={`text-right font-display text-base font-semibold ${need > 0 ? 'text-brand' : 'text-ink/25'}`}>
                          {need > 0 ? `${need} ${r.unit}` : '—'}
                        </div>
                      </div>
                      {editingId === r.id && (
                        <div className="flex flex-wrap items-end gap-2 border-b border-brand/25 bg-brand/[0.06] px-4 py-2.5 print:hidden">
                          {isVendorGuide(shelf) && (
                            <label className="w-28 text-[10px] font-bold uppercase text-muted">
                              Product #
                              <input
                                value={edit.code}
                                inputMode="numeric"
                                onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                                onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                                className="mt-0.5 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 font-mono text-sm normal-case text-ink outline-none focus:border-brand"
                              />
                            </label>
                          )}
                          <label className="min-w-0 flex-1 text-[10px] font-bold uppercase text-muted">
                            Name
                            <input
                              autoFocus={editFocus === 'name'}
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
                              autoFocus={editFocus === 'cost'}
                              onFocus={(e) => e.target.select()}
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={edit.cost}
                              onChange={(e) => setEdit({ ...edit, cost: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                              className={`mt-0.5 w-full rounded-lg border bg-white px-2.5 py-1.5 text-right font-mono text-sm text-ink outline-none focus:border-brand ${
                                editFocus === 'cost' ? 'border-brand ring-2 ring-brand/30' : 'border-black/10'
                              }`}
                            />
                          </label>
                          <label className="w-40 text-[10px] font-bold uppercase text-muted">
                            Order from
                            <input
                              list="vendor-options"
                              value={edit.vendor}
                              placeholder="e.g. Capital City"
                              onChange={(e) => setEdit({ ...edit, vendor: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                              className="mt-0.5 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm font-medium normal-case text-ink outline-none focus:border-brand"
                            />
                          </label>
                          <button onClick={commitEdit} className="rounded-lg bg-brand px-3.5 py-2 text-xs font-bold text-white">
                            Save
                          </button>
                          <button onClick={() => void parkItem(r)} title="Off the guides, kept in Item Catalog → Parked" className="inline-flex items-center gap-1.5 rounded-lg border border-warn/40 px-3 py-2 text-xs font-bold text-warn">
                            <Archive size={13} /> Park
                          </button>
                          {/* Moving by tap, for a finger on a tablet where the
                              drag grip is a mouse thing: a step up or down, or
                              straight to the end of another section. Hidden
                              while a vendor filter is on, for the same reason
                              the grip is — the row indexes are the filtered
                              list's, not the guide's. */}
                          {!vendorFilter && (
                            <div className="flex items-end gap-1">
                              <button
                                onClick={() => { moveGuideItem(shelf, { sec: si, idx }, { sec: si, idx: idx - 1 }); refresh() }}
                                disabled={idx === 0}
                                title="Move up"
                                aria-label="Move up"
                                className="rounded-lg border border-black/10 bg-white p-2 text-ink disabled:opacity-30"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                onClick={() => { moveGuideItem(shelf, { sec: si, idx }, { sec: si, idx: idx + 1 }); refresh() }}
                                disabled={idx >= sec.ids.length - 1}
                                title="Move down"
                                aria-label="Move down"
                                className="rounded-lg border border-black/10 bg-white p-2 text-ink disabled:opacity-30"
                              >
                                <ChevronDown size={14} />
                              </button>
                              {sections.length > 1 && (
                                <select
                                  value={si}
                                  aria-label="Move to section"
                                  title="Move to the end of another section"
                                  onChange={(e) => {
                                    const to = Number(e.target.value)
                                    if (to === si) return
                                    moveGuideItem(shelf, { sec: si, idx }, { sec: to, idx: sections[to].ids.length })
                                    refresh()
                                  }}
                                  className="rounded-lg border border-black/10 bg-white px-2 py-2 text-xs font-semibold text-ink outline-none focus:border-brand"
                                >
                                  {sections.map((s, i) => (
                                    <option key={s.title + i} value={i}>
                                      {s.title}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
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
            </div>
          </Card>
        )}

        <EditTrail rows={allRows} />

        <p className="text-[11px] text-muted print:hidden">
          Guides are stored per store; items live once in the Item Catalog. Direct vendor-API ordering plugs in on the
          Connections page when your reps support it.
        </p>

        {/* The printed sheet for whichever guide is open. Never on screen.
            Rendered to <body> rather than into the page: `Page` wraps its
            children in two containers, so the rule that hides everything
            beside a sheet — which only reaches main's direct children — left
            the whole Orders screen printing behind it. On the body it is the
            page, and #root drops out. */}
        {printing && view === 'guide' &&
          createPortal(
            <div className="hidden print:block prep-print sheet-paper">
              <style>{'@page { size: letter landscape; margin: 10mm; }'}</style>
              <GuideSheet shelf={shelf} />
            </div>,
            document.body,
          )}
      </Page>
    </>
  )
}

/**
 * Who changed what on the order sheet.
 *
 * An order sheet is money — a par quietly moved from 2 to 6 is a delivery
 * nobody asked for — and it used to be possible to change any number without
 * leaving a mark. The last twenty edits, newest first, named.
 */
function EditTrail({ rows }: { rows: Row[] }) {
  const edits = getParEdits().slice(-20).reverse()
  if (edits.length === 0) return null
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id
  return (
    <details className="panel px-4 py-3 print:hidden">
      <summary className="cursor-pointer text-sm font-bold text-ink">
        Recent changes
        <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-extrabold text-muted">
          {edits.length}
        </span>
      </summary>
      <div className="mt-2 space-y-1">
        {edits.map((e, i) => (
          <div key={i} className="flex flex-wrap items-baseline gap-x-2 border-t border-black/5 pt-1 text-[12px]">
            <span className="font-semibold text-ink">{nameOf(e.id)}</span>
            <span className="text-muted">{e.field === 'par' ? 'par' : 'on hand'}</span>
            <span className="font-mono text-muted">
              {e.from} → <b className="text-ink">{e.to}</b>
            </span>
            <span className="ml-auto text-[11px] text-muted">
              {e.by} · {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </details>
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

/** One number on a count row. `col` groups it with the same box on every other
 *  row, so Enter walks down that column instead of sideways into the next one. */
function NumCell({ value, onChange, col }: { value: number; onChange: (v: number) => void; col: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value || ''}
      placeholder="0"
      onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
      {...entryField(col)}
      className="w-full rounded-lg border border-black/10 bg-white px-1 py-1 text-center font-mono text-sm outline-none focus:border-brand"
    />
  )
}
