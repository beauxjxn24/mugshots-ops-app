import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { useCurrentNames } from '../lib/scope'
import {
  getCatalog,
  setCatalog,
  getFlags,
  setOnGuide,
  registerItem,
  renameItem,
  SHELVES,
  type CatalogItem,
} from '../lib/catalog'
import { Pencil } from 'lucide-react'

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * Item Catalog — THE master list (handoff spec): every item lives here once,
 * shared by all of this concept's stores. The On/Off buttons control THIS
 * store's order guide; costs carry a vendor + date stamp from price imports.
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
  const [guide, setGuide] = useState<'all' | 'on' | 'off'>('all')
  const [form, setForm] = useState({ name: '', unit: 'cs', category: 'Food', vendor: '' })
  // Inline spelling fix — the old name stays as an alias so imports still match.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const commitRename = () => {
    if (editingId) renameItem(editingId, editName)
    setEditingId(null)
    refresh()
  }

  const add = () => {
    if (!form.name.trim()) return
    registerItem({ ...form, name: form.name.trim() })
    setForm({ name: '', unit: 'cs', category: form.category, vendor: form.vendor })
    refresh()
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items
      .filter(
        (i) =>
          (cat === 'All' || i.category === cat) &&
          (guide === 'all' || (guide === 'on') === !!flags[i.id]) &&
          (!query ||
            i.name.toLowerCase().includes(query) ||
            i.vendor.toLowerCase().includes(query)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items, flags, q, cat, guide])

  const onCount = items.filter((i) => flags[i.id]).length

  return (
    <>
      <PageHeader
        title="Item Catalog"
        subtitle={`${items.length} master items · ${concept} — viewing ${location} (${onCount} on guide)`}
        right={<SearchInput value={q} onChange={setQ} placeholder="Search items…" className="w-full max-w-xs" />}
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Add */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Item name"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="unit"
              className="w-20 rounded-lg border border-black/10 bg-white px-3 py-2 text-center text-sm outline-none focus:border-brand"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {SHELVES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="vendor"
              className="w-36 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
              Add
            </button>
          </div>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {['All', ...SHELVES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                cat === c ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted'
              }`}
            >
              {c}
            </button>
          ))}
          <div className="ml-auto grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1">
            {(['all', 'on', 'off'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGuide(g)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  guide === g ? 'bg-white text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {g === 'all' ? 'All' : g === 'on' ? 'On guide' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No items{items.length ? ' match' : ' yet — add your regularly-stocked items here, or drop a vendor guide on Imports'}.
          </p>
        ) : (
          <Card className="overflow-hidden">
            {filtered.map((it) => {
              const on = !!flags[it.id]
              return (
                <div key={it.id} className="flex items-center gap-3 border-b border-black/5 p-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    {editingId === it.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full rounded-lg border border-brand/50 bg-white px-2 py-1 text-sm font-medium text-ink outline-none"
                      />
                    ) : (
                      <div className="group/name flex items-center gap-1.5">
                        <div className="truncate font-medium text-ink">{it.name}</div>
                        <button
                          onClick={() => {
                            setEditingId(it.id)
                            setEditName(it.name)
                          }}
                          title="Fix the spelling — imports keep matching the old name"
                          className="shrink-0 text-muted/50 hover:text-brand-600"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                    <div className="text-xs text-muted">
                      {it.code && <span className="font-mono">{it.code} · </span>}
                      {it.category} · {it.unit}
                      {it.vendor ? ` · ${it.vendor}` : ''}
                      {it.cost != null && (
                        <span title={it.costVendor ? `from ${it.costVendor} · ${it.costDate}` : undefined}>
                          {' '}
                          · <b className="font-mono text-ink">{money(it.cost)}</b>
                          {it.costDate ? ` (${it.costDate.slice(5).replace('-', '/')})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setOnGuide(it.id, !on)
                      refresh()
                    }}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      on ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'
                    }`}
                  >
                    {on ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        await confirmDelete(
                          `Delete ${it.name} from the catalog?`,
                          'Removes it for every store of this concept.',
                        )
                      ) {
                        setCatalog(getCatalog().filter((x: CatalogItem) => x.id !== it.id))
                        refresh()
                      }
                    }}
                    aria-label="Remove"
                    className="text-muted hover:text-down"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </Card>
        )}
      </div>
    </>
  )
}
