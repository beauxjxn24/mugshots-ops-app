import { useMemo, useState } from 'react'
import { Printer, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useIsPhone } from '../lib/useIsPhone'
import { confirmDelete } from '../lib/confirm'
import { sanitizeSheet, sheetLocations, newCountId, type CountItem } from '../lib/countsheet'

const LOC_COLORS = ['#b8860b', '#4c7fb8', '#2f6b4f', '#8b6bb8', '#d4a94c', '#c2564c', '#4c9db8']
function fmtDay(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Inventory — driven by the owner's physical count sheets: items grouped by
 * storage area, each counted in one to three units of measure. Separate from
 * the order-guide catalog. Drop a new count sheet on Imports to replace it;
 * invoice receiving can add items here too.
 */
export function Inventory() {
  const isPhone = useIsPhone()
  const [rawItems, setItems] = usePersistentState<CountItem[]>('inv:sheet', [])
  const items = useMemo(() => sanitizeSheet(rawItems), [rawItems])
  const locations = useMemo(() => sheetLocations(items), [items])
  const [loc, setLoc] = useState<'All' | string>('All')
  const [adding, setAdding] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', unit: 'Each' })

  const shown = items.filter((it) => loc === 'All' || it.location === loc)
  const lastCount = items.reduce<string | undefined>(
    (acc, it) => (it.lastCount && (!acc || it.lastCount > acc) ? it.lastCount : acc),
    undefined,
  )
  const colorFor = (l: string) => LOC_COLORS[Math.max(0, locations.indexOf(l)) % LOC_COLORS.length]

  const setQty = (id: string, ui: number, v: number) =>
    setItems((list) =>
      sanitizeSheet(list).map((it) =>
        it.id === id
          ? { ...it, lastCount: today(), units: it.units.map((u, i) => (i === ui ? { ...u, qty: v } : u)) }
          : it,
      ),
    )

  const addItem = (location: string) => {
    const name = form.name.trim()
    if (!name) return
    setItems((list) => [
      ...sanitizeSheet(list),
      { id: newCountId(), location, name, units: [{ uom: form.unit.trim() || 'Each', qty: 0 }], lastCount: today() },
    ])
    setForm({ name: '', unit: form.unit })
    setAdding(null)
  }

  const removeItem = async (it: CountItem) => {
    if (!(await confirmDelete(`Remove “${it.name}” from the count sheet?`))) return
    setItems((list) => sanitizeSheet(list).filter((x) => x.id !== it.id))
  }

  // Group the shown items by storage location, preserving sheet order.
  const groups = useMemo(() => {
    const order = loc === 'All' ? locations : [loc]
    return order
      .map((l) => ({ location: l, items: shown.filter((it) => it.location === l) }))
      .filter((g) => g.items.length > 0 || adding === g.location)
  }, [shown, locations, loc, adding])

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={
          items.length === 0
            ? 'Drop a count sheet on Imports to load your storage areas'
            : `${items.length} items · ${locations.length} storage areas${lastCount ? ` · last count ${fmtDay(lastCount)}` : ''}`
        }
        right={
          <div className="flex items-center gap-2">
            {isPhone ? (
              <select
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand print:hidden"
              >
                <option value="All">All areas</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <div className="flex flex-wrap gap-1 rounded-xl bg-black/5 p-1 print:hidden">
                  {(['All', ...locations] as string[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLoc(l)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${loc === l ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white print:hidden"
                >
                  <Printer size={13} /> Count sheet
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8">
        {items.length === 0 && (
          <Card className="p-8 text-center">
            <div className="text-sm font-semibold text-ink">No count sheet loaded yet</div>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              Drop your inventory count sheet (CSV or Excel) on{' '}
              <Link to="/imports" className="font-bold text-brand">
                Imports
              </Link>{' '}
              — columns like <span className="font-mono">StorageLocation, Item, UofM, Qty</span> — and every storage
              area fills in here. You can also add items by hand below, and invoice receiving can attach items too.
            </p>
          </Card>
        )}

        {groups.map((g) => (
          <Card key={g.location} className="overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-2.5 text-white"
              style={{ background: colorFor(g.location) }}
            >
              <span className="font-display text-base font-semibold">{g.location}</span>
              <span className="text-[11px] font-semibold text-white/80">{g.items.length} items</span>
            </div>

            {/* Column header (desktop) */}
            {!isPhone && (
              <div className="grid grid-cols-[minmax(0,1fr)_360px_36px] items-center gap-2 border-b border-black/10 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                <span>Item</span>
                <span>Count</span>
                <span />
              </div>
            )}

            {g.items.map((it) => (
              <div
                key={it.id}
                className={`items-center gap-2 border-b border-black/5 px-4 py-2 last:border-0 ${
                  isPhone ? 'flex flex-wrap' : 'grid grid-cols-[minmax(0,1fr)_360px_36px]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-ink">{it.name}</div>
                  {it.lastCount && <div className="text-[10px] text-muted print:hidden">counted {fmtDay(it.lastCount)}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {it.units.map((u, ui) => (
                    <label key={ui} className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={u.qty || ''}
                        placeholder="0"
                        onChange={(e) => setQty(it.id, ui, Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-16 rounded-lg border border-black/15 bg-white px-1 py-1.5 text-center font-mono text-sm text-ink outline-none focus:border-brand"
                      />
                      <span className="text-[11px] font-semibold text-muted">{u.uom}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => void removeItem(it)}
                  aria-label={`Remove ${it.name}`}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-down/10 hover:text-down print:hidden"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {/* Add item to this area */}
            <div className="border-t border-black/5 p-2.5 print:hidden">
              {adding === g.location ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && addItem(g.location)}
                    placeholder={`Item in ${g.location}…`}
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && addItem(g.location)}
                    placeholder="unit (Each, LB, Case…)"
                    className="w-40 rounded-lg border border-dashed border-black/20 bg-white px-2 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button onClick={() => addItem(g.location)} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
                    Add
                  </button>
                  <button onClick={() => setAdding(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setForm({ name: '', unit: 'Each' })
                    setAdding(g.location)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-brand hover:bg-brand/5"
                >
                  <Plus size={14} /> Add item
                </button>
              )}
            </div>
          </Card>
        ))}

        {/* New storage area */}
        {items.length > 0 && loc === 'All' && (
          <NewAreaCard
            onAdd={(area, name, unit) =>
              setItems((list) => [
                ...sanitizeSheet(list),
                { id: newCountId(), location: area, name, units: [{ uom: unit || 'Each', qty: 0 }], lastCount: today() },
              ])
            }
          />
        )}
      </div>
    </>
  )
}

function NewAreaCard({ onAdd }: { onAdd: (area: string, name: string, unit: string) => void }) {
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('Each')
  const submit = () => {
    if (!area.trim() || !name.trim()) return
    onAdd(area.trim(), name.trim(), unit.trim())
    setArea('')
    setName('')
    setOpen(false)
  }
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-black/20 px-3 py-2 text-xs font-bold text-muted hover:text-brand print:hidden"
      >
        <Plus size={14} /> New storage area
      </button>
    )
  return (
    <Card className="p-3 print:hidden">
      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">New storage area</div>
      <div className="flex flex-wrap gap-2">
        <input
          autoFocus
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="Area (Walk-in, Bar…)"
          className="w-44 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="First item…"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="unit"
          className="w-28 rounded-lg border border-dashed border-black/20 bg-white px-2 py-2 text-sm outline-none focus:border-brand"
        />
        <button onClick={submit} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
          Add
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </Card>
  )
}
