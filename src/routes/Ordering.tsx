import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { getOrdering, suggested, addOrderItem, setParEntry, vendors } from '../lib/ordering'
import { setOnGuide, SHELVES } from '../lib/catalog'

/**
 * Ordering (handoff spec): the guides are drawn FROM the Item Catalog — shelf
 * tabs (Produce / Liquor / Beer …) filter the items this store has on-guide.
 * par − on-hand → order qty. Taking an item off the guide keeps it in the
 * catalog; flip it back on from there anytime.
 */
export function Ordering() {
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => getOrdering(), [tick])
  const all = useMemo(
    () => Object.entries(data).flatMap(([vendor, items]) => items.map((it) => ({ ...it, vendor }))),
    [data],
  )
  const shelvesPresent = useMemo(
    () => ['All', ...SHELVES.filter((s) => all.some((it) => it.category === s))],
    [all],
  )
  const [shelf, setShelf] = useState('All')
  const [form, setForm] = useState({ name: '', vendor: 'US Foods', category: 'Food' })

  const items = all.filter((it) => shelf === 'All' || it.category === shelf)
  const orderCount = items.filter((x) => suggested(x) > 0).length

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

  return (
    <>
      <PageHeader
        title="Ordering"
        subtitle={`${orderCount} item${orderCount === 1 ? '' : 's'} below par · guides from the Item Catalog`}
        right={
          <Link to="/catalog" className="text-sm font-semibold text-brand">
            Item Catalog →
          </Link>
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Shelf tabs */}
        <div className="flex flex-wrap gap-2">
          {shelvesPresent.map((s) => (
            <button
              key={s}
              onClick={() => setShelf(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                shelf === s
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-black/5 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">
            <span>Item</span>
            <span className="w-14 text-center">Par</span>
            <span className="w-14 text-center">On hand</span>
            <span className="w-16 text-center">Order</span>
          </div>
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Nothing on this shelf yet — add an item below, drop an invoice on Imports, or flip
              items on from the Item Catalog.
            </p>
          )}
          {items.map((it) => {
            const need = suggested(it)
            return (
              <div
                key={it.id}
                className="group grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-black/5 px-4 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{it.name}</div>
                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <span>
                      {it.vendor} · {it.category}
                    </span>
                    <button
                      onClick={() => removeFromGuide(it)}
                      className="opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
                    >
                      off guide
                    </button>
                  </div>
                </div>
                <NumCell
                  value={it.par}
                  onChange={(v) => {
                    setParEntry(it.id, { par: v })
                    refresh()
                  }}
                />
                <NumCell
                  value={it.onHand}
                  onChange={(v) => {
                    setParEntry(it.id, { onHand: v })
                    refresh()
                  }}
                />
                <div
                  className={`w-16 text-center font-display text-lg font-semibold ${
                    need > 0 ? 'text-brand' : 'text-ink/25'
                  }`}
                >
                  {need > 0 ? `${need} ${it.unit}` : '—'}
                </div>
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2 p-3">
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
        </Card>

        <p className="text-center text-xs text-muted">
          Items added here register once in the <b>Item Catalog</b> — every store draws its own
          guide from that one list. Drop a delivery invoice on <b>Imports</b> to receive into
          on-hand automatically.
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
      className="w-14 rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center text-sm outline-none focus:border-brand"
    />
  )
}
