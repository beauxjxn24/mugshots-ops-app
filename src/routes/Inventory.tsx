import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'

interface CountItem {
  id: string
  name: string
  unit: string
  count: number | ''
}
type Areas = Record<string, CountItem[]>

// Empty count sheets — your storage areas, ready for your items. No sample data.
const SEED: Areas = {
  'Walk-in Cooler': [],
  Freezer: [],
  'Dry Storage': [],
  Bar: [],
}
function c(name: string, unit: string): CountItem {
  return { id: `${name}`.replace(/\s+/g, '-').toLowerCase(), name, unit, count: '' }
}

export function Inventory() {
  const [areas, setAreas] = usePersistentState<Areas>(`inv:${today()}`, SEED)
  const areaNames = Object.keys(areas)
  const [area, setArea] = useState(areaNames[0])
  const [newName, setNewName] = useState('')

  const items = areas[area] ?? []
  const counted = useMemo(
    () => Object.values(areas).flat().filter((x) => x.count !== '' && x.count != null).length,
    [areas],
  )
  const total = useMemo(() => Object.values(areas).flat().length, [areas])

  const update = (id: string, count: number | '') =>
    setAreas((a) => ({ ...a, [area]: (a[area] ?? []).map((x) => (x.id === id ? { ...x, count } : x)) }))
  const removeItem = async (id: string) => {
    const it = (areas[area] ?? []).find((x) => x.id === id)
    if (!(await confirmDelete(`Remove ${it?.name.replace(/-\d+$/, '') ?? 'this item'}?`))) return
    setAreas((a) => ({ ...a, [area]: (a[area] ?? []).filter((x) => x.id !== id) }))
  }
  const addItem = () => {
    if (!newName.trim()) return
    setAreas((a) => ({ ...a, [area]: [...(a[area] ?? []), c(newName.trim() + '-' + Date.now(), 'ea')] }))
    setNewName('')
  }

  return (
    <>
      <PageHeader
        title="Inventory Count"
        subtitle={`${counted} of ${total} items counted · ${today()}`}
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap gap-2">
          {areaNames.map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                area === a
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          {items.map((it) => (
            <div
              key={it.id}
              className="group flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">
                  {it.name.replace(/-\d+$/, '')}
                </div>
                <button
                  onClick={() => removeItem(it.id)}
                  className="text-[10px] text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
                >
                  remove
                </button>
              </div>
              <span className="text-xs text-muted">{it.unit}</span>
              <input
                type="number"
                inputMode="decimal"
                value={it.count}
                onChange={(e) =>
                  update(it.id, e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))
                }
                placeholder="—"
                className={`w-20 rounded-lg border bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-brand ${
                  it.count !== '' ? 'border-up/40' : 'border-black/10'
                }`}
              />
            </div>
          ))}
          <div className="flex gap-2 p-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder={`Add item to ${area}…`}
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={addItem}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white"
            >
              Add
            </button>
          </div>
        </Card>
      </div>
    </>
  )
}
