import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { useCurrentNames } from '../lib/scope'
import {
  getCatalog,
  setCatalog,
  getFlags,
  setOnGuide,
  registerItem,
  renameItem,
  findSimilar,
  isInPrep,
  addToPrep,
  removeFromPrep,
  isInInventory,
  addToInventory,
  removeFromInventory,
  SHELVES,
  type CatalogItem,
} from '../lib/catalog'
import { Pencil, Plus, Check, PackageOpen, ChefHat, ClipboardList, X, Layers } from 'lucide-react'

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`

// A dot color per category so the list scans like a catalog, not a spreadsheet.
const CAT_COLOR: Record<string, string> = {
  Produce: '#66C05A', Liquor: '#F472B6', Beer: '#F0A94C', Food: '#E4B84C',
  'Paper / Supply': '#60A5FA', Kitchen: '#A78BFA', Other: '#8a97ab',
}
const dotFor = (c: string) => CAT_COLOR[c] ?? '#8a97ab'

// The three places an item can live besides the catalog itself.
type Dest = 'guide' | 'prep' | 'count'
const DESTS: { key: Dest; label: string; icon: typeof PackageOpen; hint: string }[] = [
  { key: 'guide', label: 'Order guide', icon: PackageOpen, hint: 'Orders' },
  { key: 'prep', label: 'Prep', icon: ChefHat, hint: 'Prep sheet' },
  { key: 'count', label: 'Count', icon: ClipboardList, hint: 'Inventory' },
]

/**
 * Item Catalog — THE master list every screen ties back to. Each item lives
 * here once (no duplicate / "like" names — the add box warns on a near-match),
 * and from here you send it wherever it belongs: the order guide, the prep
 * sheet, or the inventory count. Concept-level; the order-guide flag is per store.
 */
export function Catalog() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const { concept, location } = useCurrentNames()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => getCatalog(), [tick])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flags = useMemo(() => getFlags(), [tick])

  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [form, setForm] = useState({ name: '', unit: 'cs', category: 'Food', vendor: '' })
  const [dest, setDest] = useState<Set<Dest>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const similar = useMemo(() => findSimilar(form.name.trim()), [form.name, tick])

  const commitRename = () => {
    if (editingId) renameItem(editingId, editName)
    setEditingId(null)
    refresh()
  }

  const add = () => {
    const name = form.name.trim()
    if (!name) return
    const item = registerItem({ name, unit: form.unit, category: form.category, vendor: form.vendor })
    if (dest.has('guide')) setOnGuide(item.id, true)
    if (dest.has('prep')) addToPrep({ name: item.name, unit: item.unit })
    if (dest.has('count')) addToInventory({ name: item.name, unit: item.unit, category: item.category })
    setForm({ name: '', unit: form.unit, category: form.category, vendor: form.vendor })
    refresh()
  }

  // Per-item destination toggle → writes straight into the target system.
  const toggleDest = (it: CatalogItem, d: Dest) => {
    if (d === 'guide') setOnGuide(it.id, !flags[it.id])
    else if (d === 'prep') isInPrep(it.name) ? removeFromPrep(it.name) : addToPrep({ name: it.name, unit: it.unit })
    else isInInventory(it.name) ? removeFromInventory(it.name) : addToInventory({ name: it.name, unit: it.unit, category: it.category })
    refresh()
  }
  const hasDest = (it: CatalogItem, d: Dest) =>
    d === 'guide' ? !!flags[it.id] : d === 'prep' ? isInPrep(it.name) : isInInventory(it.name)

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items
      .filter(
        (i) =>
          (cat === 'All' || i.category === cat) &&
          (!query || i.name.toLowerCase().includes(query) || i.vendor.toLowerCase().includes(query)),
      )
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [items, q, cat, tick])

  const onGuideCount = items.filter((i) => flags[i.id]).length
  const catCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) m.set(it.category, (m.get(it.category) ?? 0) + 1)
    return m
  }, [items])

  return (
    <>
      <PageHeader
        title="Item Catalog"
        subtitle={`${items.length} items · ${concept} — ${location} · ${onGuideCount} on the order guide`}
        right={<SearchInput value={q} onChange={setQ} placeholder="Search items…" className="w-full max-w-xs" />}
      />
      <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-5 lg:p-6">
        {/* ---- Add panel ---- */}
        <div className="rounded-2xl border border-signal/20 bg-gradient-to-b from-signal/[0.06] to-transparent p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-signal">
            <Plus size={13} /> New item
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Item name (one master spelling)"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="rounded-lg border border-white/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
            >
              {SHELVES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="unit"
              className="w-20 rounded-lg border border-white/10 bg-white px-3 py-2 text-center text-sm text-ink outline-none focus:border-signal"
            />
            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="vendor (optional)"
              className="w-40 rounded-lg border border-white/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
            />
          </div>

          {/* Where does it go? */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Send it to</span>
            {DESTS.map((d) => {
              const on = dest.has(d.key)
              return (
                <button
                  key={d.key}
                  onClick={() => setDest((s) => { const n = new Set(s); n.has(d.key) ? n.delete(d.key) : n.add(d.key); return n })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    on ? 'border-signal bg-signal/15 text-signal' : 'border-white/15 bg-white/[0.03] text-muted hover:text-ink'
                  }`}
                >
                  <d.icon size={13} /> {d.label}{on && <Check size={12} />}
                </button>
              )
            })}
            <button
              onClick={add}
              disabled={!form.name.trim()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              <Plus size={15} /> Add item
            </button>
          </div>

          {/* Dedupe guard */}
          {similar.length > 0 && (
            <div className="mt-3 rounded-xl border border-warn/30 bg-warn/[0.08] px-3 py-2 text-xs text-ink">
              <b className="text-warn">Already in the catalog?</b> These look close — reuse one instead of making a “like” name:
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {similar.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setQ(s.name); setForm((f) => ({ ...f, name: '' })) }}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-signal"
                  >
                    {s.name} <span className="text-muted">· {s.category}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- Category rail ---- */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', ...SHELVES].map((c) => {
            const n = c === 'All' ? items.length : catCounts.get(c) ?? 0
            const active = cat === c
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  active ? 'border-brand bg-brand text-white' : 'border-white/10 bg-white/[0.03] text-muted hover:text-ink'
                }`}
              >
                {c !== 'All' && <span className="size-2 rounded-full" style={{ background: dotFor(c) }} />}
                {c} <span className={active ? 'text-white/70' : 'text-muted/70'}>{n}</span>
              </button>
            )
          })}
        </div>

        {/* ---- Item grid ---- */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-12 text-center">
            <Layers size={26} className="mx-auto mb-2 text-muted" />
            <p className="text-sm text-muted">
              {items.length ? 'No items match.' : 'No items yet — add your first above, or drop a vendor guide on Imports.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((it) => (
              <div key={it.id} className="rounded-2xl border border-white/10 bg-white p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: dotFor(it.category) }} />
                  <div className="min-w-0 flex-1">
                    {editingId === it.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                        className="w-full rounded-lg border border-signal/50 bg-white px-2 py-1 text-sm font-semibold text-ink outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-ink">{it.name}</span>
                        <button onClick={() => { setEditingId(it.id); setEditName(it.name) }} title="Fix the spelling — imports keep matching the old name" className="shrink-0 text-muted/50 hover:text-signal">
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                    <div className="mt-0.5 text-xs text-muted">
                      {it.code && <span className="font-mono">{it.code} · </span>}
                      {it.category} · {it.unit}
                      {it.vendor ? ` · ${it.vendor}` : ''}
                      {it.cost != null && <> · <b className="font-mono text-ink">{money(it.cost)}</b></>}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (await confirmDelete(`Delete ${it.name} from the catalog?`, 'Removes it for every store of this concept.')) {
                        setCatalog(getCatalog().filter((x: CatalogItem) => x.id !== it.id))
                        removeFromPrep(it.name)
                        removeFromInventory(it.name)
                        refresh()
                      }
                    }}
                    aria-label="Remove"
                    className="shrink-0 text-muted/60 hover:text-down"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Destination toggles */}
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                  {DESTS.map((d) => {
                    const on = hasDest(it, d.key)
                    return (
                      <button
                        key={d.key}
                        onClick={() => toggleDest(it, d.key)}
                        title={on ? `On the ${d.hint}` : `Add to the ${d.hint}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                          on ? 'bg-signal/15 text-signal ring-1 ring-inset ring-signal/30' : 'bg-black/[0.03] text-muted hover:text-ink'
                        }`}
                      >
                        <d.icon size={13} /> {d.label}{on && <Check size={11} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
