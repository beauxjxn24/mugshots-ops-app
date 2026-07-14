import { useMemo, useState } from 'react'
import { PageHeader, Card } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { SPECS } from '../lib/specs'
import { isDrink } from '../lib/categories'
import { usePersistentState, today } from '../lib/store'
import type { PmixDays } from '../lib/pmix'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

interface BarPrepItem {
  name: string
  storage: string
  shelf: string
  unit: string
  par: number
}
// The owner's bar prep sheet, straight from the handoff prototype.
const BAR_PREP_SEED: BarPrepItem[] = [
  { name: 'Frozen Margarita bulk', storage: 'machine batch', shelf: '5 days', unit: 'batch', par: 2 },
  { name: 'Strawberry purée', storage: 'squeeze bottles', shelf: '3 days', unit: 'btl', par: 3 },
  { name: 'Fresh lime & lemon juice', storage: 'quart cambro', shelf: '24 hours', unit: 'qt', par: 2 },
  { name: 'Graham cracker rim mix', storage: 'rimmer tray', shelf: '1 week', unit: 'tray', par: 1 },
  { name: 'Red/white/blue sugar rim', storage: 'rimmer tray · LTO', shelf: '1 week', unit: 'tray', par: 1 },
]
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * Signature drinks — prototype layout: three build lists (frozen / shakes &
 * floats / pairings, tap any drink for the full card) + the bar prep sheet
 * with pars, on-hand, and prep-today. Sales chip fills from your PMIX.
 */
export function Drinks() {
  const drinks = useMemo(() => SPECS.filter(isDrink), [])
  const [days] = usePersistentState<PmixDays>('pmix:days', {})
  const [barItems, setBarItems] = usePersistentState<BarPrepItem[]>('barprep:items', BAR_PREP_SEED)
  const [onHand, setOnHand] = usePersistentState<Record<string, number>>(`barprep:onhand:${today()}`, {})
  const [open, setOpen] = useState<string | undefined>(undefined)

  const groups = useMemo(() => {
    const frozen = drinks.filter((s) => s.g === 'Frozen Drinks')
    const shakes = drinks.filter((s) => s.g === 'Shakes')
    const pairings = drinks.filter((s) => s.g === 'Pairings')
    const rest = drinks.filter((s) => !['Frozen Drinks', 'Shakes', 'Pairings'].includes(s.g))
    return [
      { title: 'Frozen drinks', items: frozen },
      { title: 'Shakes & floats', items: [...shakes, ...rest] },
      { title: 'Cocktail pairings', items: pairings },
    ].filter((g) => g.items.length > 0)
  }, [drinks])

  // Signature drinks sold this week — PMIX items whose name matches a build.
  const soldChip = useMemo(() => {
    const keys = Object.keys(days).sort()
    const latest = keys[keys.length - 1]
    if (!latest) return null
    const from = (() => {
      const [y, m, d] = latest.split('-').map(Number)
      const f = new Date(y, m - 1, d - 6)
      return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
    })()
    const names = drinks.map((s) => s.name.toLowerCase())
    let qty = 0
    let sales = 0
    for (const k of keys.filter((k2) => k2 >= from && k2 <= latest))
      for (const it of days[k]?.items ?? []) {
        if (it.sales <= 0) continue
        const n = it.name.toLowerCase()
        if (names.some((dn) => n.includes(dn.slice(0, 10)) || dn.includes(n.slice(0, 10)))) {
          qty += it.qty
          sales += it.sales
        }
      }
    return qty > 0 ? `${qty} signature drinks sold · ${money(sales)}` : null
  }, [days, drinks])

  const openBuild = (name: string) => {
    setOpen(name)
    setTimeout(() => document.getElementById('drink-specs')?.scrollIntoView({ behavior: 'smooth' }), 60)
  }

  const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  return (
    <>
      <PageHeader
        title="Signature drinks"
        subtitle="Every frozen drink, shake, float & pairing build — tap any drink for the full card"
        right={soldChip && <span className="text-sm font-semibold text-ink">{soldChip}</span>}
      />
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Three build lists */}
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.title} className="overflow-hidden border-t-4 border-t-brand">
              <div className="px-4 pb-1 pt-3 font-display text-lg font-semibold text-ink">{g.title}</div>
              {g.items.map((s) => (
                <button
                  key={s.name}
                  onClick={() => openBuild(s.name)}
                  className="flex w-full items-center justify-between gap-2 border-t border-black/5 px-4 py-2.5 text-left hover:bg-black/[0.02]"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold text-ink">
                      <span className="truncate">{s.name}</span>
                      {/LTO/i.test(`${s.shelf} ${s.yields}`) && (
                        <span className="shrink-0 rounded bg-brand/15 px-1.5 py-px text-[9px] font-extrabold uppercase text-brand-600">
                          LTO
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {s.g === 'Pairings' ? s.shelf : s.ing.slice(0, 3).map(([n]) => n).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-brand">build →</span>
                </button>
              ))}
            </Card>
          ))}
        </div>

        {/* Bar prep */}
        <Card className="overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="font-display text-lg font-semibold text-ink">Bar prep · {dow}</span>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold text-brand-600">
              pars learn from usage, same as kitchen prep
            </span>
          </div>
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[minmax(0,1.6fr)_1fr_0.8fr_0.6fr_0.7fr_1fr] items-center gap-3 border-b border-black/10 px-4 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <span>Item</span>
              <span>Batch / storage</span>
              <span>Shelf life</span>
              <span className="text-center">Par</span>
              <span className="text-center">On hand</span>
              <span>Prep today</span>
            </div>
            {barItems.map((it) => {
              const counted = onHand[it.name] != null
              const need = Math.max(0, it.par - (onHand[it.name] ?? 0))
              return (
                <div
                  key={it.name}
                  className="grid grid-cols-[minmax(0,1.6fr)_1fr_0.8fr_0.6fr_0.7fr_1fr] items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0"
                >
                  <span className="truncate text-sm font-bold text-ink">{it.name}</span>
                  <span className="truncate text-xs text-muted">{it.storage}</span>
                  <span className="text-xs text-muted">{it.shelf}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={it.par}
                    onChange={(e) =>
                      setBarItems((is) =>
                        is.map((x) => (x.name === it.name ? { ...x, par: Math.max(0, parseFloat(e.target.value) || 0) } : x)),
                      )
                    }
                    className="w-14 justify-self-center rounded-lg border border-transparent bg-transparent px-1 py-1 text-center font-mono text-sm outline-none hover:border-black/10 focus:border-brand"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={counted ? onHand[it.name] : ''}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value
                      setOnHand((o) => {
                        const next = { ...o }
                        if (v === '') delete next[it.name]
                        else next[it.name] = Math.max(0, parseFloat(v) || 0)
                        return next
                      })
                    }}
                    className="w-14 justify-self-center rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center font-mono text-sm outline-none focus:border-brand"
                  />
                  <span>
                    {need > 0 ? (
                      <span className="text-xs font-extrabold text-brand-600">
                        +{fmtQty(need)} {it.unit}
                      </span>
                    ) : counted ? (
                      <span className="text-xs font-bold text-up">at par ✓</span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Full build cards */}
        <div id="drink-specs">
          <SpecGrid key={open ?? 'none'} specs={drinks} initialOpen={open} />
        </div>
      </div>
    </>
  )
}
