import { useEffect, useMemo, useState } from 'react'
import { GripVertical } from 'lucide-react'
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
  pars: number[] // Mon..Sun — same shape as kitchen prep
  /** legacy single par, migrated into pars on first load */
  par?: number
}
// The owner's bar prep sheet, straight from the handoff prototype.
const BAR_PREP_SEED: BarPrepItem[] = [
  { name: 'Frozen Margarita bulk', storage: 'machine batch', shelf: '5 days', unit: 'batch', pars: [2, 2, 2, 2, 2, 2, 2] },
  { name: 'Strawberry purée', storage: 'squeeze bottles', shelf: '3 days', unit: 'btl', pars: [3, 3, 3, 3, 3, 3, 3] },
  { name: 'Fresh lime & lemon juice', storage: 'quart cambro', shelf: '24 hours', unit: 'qt', pars: [2, 2, 2, 2, 2, 2, 2] },
  { name: 'Graham cracker rim mix', storage: 'rimmer tray', shelf: '1 week', unit: 'tray', pars: [1, 1, 1, 1, 1, 1, 1] },
  { name: 'Red/white/blue sugar rim', storage: 'rimmer tray · LTO', shelf: '1 week', unit: 'tray', pars: [1, 1, 1, 1, 1, 1, 1] },
]
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** A bar-prep line's recipe card among the drink specs, when one exists. */
function findSpec(name: string, list: typeof SPECS) {
  const key = norm(name)
  return list.find((s) => {
    const sk = norm(s.name)
    return sk === key || sk.includes(key) || key.includes(sk)
  })
}

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

  // One-time: old single-par items grow a full Mon–Sun par row.
  useEffect(() => {
    if (barItems.some((it) => !Array.isArray(it.pars))) {
      setBarItems((is) => is.map((it) => (Array.isArray(it.pars) ? it : { ...it, pars: Array(7).fill(it.par ?? 1) as number[] })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Monday-first index of today, for the highlighted par column.
  const di = (new Date().getDay() + 6) % 7
  const [dragName, setDragName] = useState<string | null>(null)
  const [overName, setOverName] = useState<string | null>(null)
  const dropOn = (targetName: string | null) => {
    if (!dragName) return
    setBarItems((is) => {
      const from = is.findIndex((x) => x.name === dragName)
      if (from < 0) return is
      const next = [...is]
      const [m] = next.splice(from, 1)
      const at = targetName ? next.findIndex((x) => x.name === targetName) : -1
      next.splice(at < 0 ? next.length : at, 0, m)
      return next
    })
  }

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
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[20px_minmax(0,1.5fr)_minmax(0,1fr)_repeat(7,44px)_72px_96px] items-center gap-1.5 border-b border-black/10 px-4 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <span />
              <span>Item · tap for the recipe</span>
              <span>Batch / storage · shelf life</span>
              {DOWS.map((d, i) => (
                <span key={i} className={`text-center ${i === di ? 'text-brand-600' : ''}`}>
                  {d}
                </span>
              ))}
              <span className="text-center">On hand</span>
              <span className="text-right">Prep today</span>
            </div>
            {barItems.map((it) => {
              const pars = Array.isArray(it.pars) ? it.pars : (Array(7).fill(it.par ?? 1) as number[])
              const counted = onHand[it.name] != null
              const need = Math.max(0, (pars[di] ?? 0) - (onHand[it.name] ?? 0))
              const spec = findSpec(it.name, drinks)
              return (
                <div
                  key={it.name}
                  onDragOver={(e) => {
                    if (!dragName) return
                    e.preventDefault()
                    setOverName(it.name)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    dropOn(it.name)
                    setDragName(null)
                    setOverName(null)
                  }}
                  className={`grid grid-cols-[20px_minmax(0,1.5fr)_minmax(0,1fr)_repeat(7,44px)_72px_96px] items-center gap-1.5 border-b border-black/5 px-4 py-2 last:border-0 ${
                    dragName === it.name ? 'opacity-40' : ''
                  } ${overName === it.name && dragName !== it.name ? 'border-t-2 border-t-brand' : ''}`}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragName(it.name)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', it.name)
                    }}
                    onDragEnd={() => {
                      setDragName(null)
                      setOverName(null)
                    }}
                    title="Drag to reorder"
                    className="cursor-grab text-muted/50 hover:text-ink active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
                  </span>
                  {spec ? (
                    <button
                      onClick={() => openBuild(spec.name)}
                      title={`Open the ${spec.name} card`}
                      className="min-w-0 text-left"
                    >
                      <span className="block truncate text-sm font-bold text-ink hover:text-brand-600">
                        {it.name} <span className="text-xs font-bold text-brand">→</span>
                      </span>
                    </button>
                  ) : (
                    <span className="truncate text-sm font-bold text-ink">{it.name}</span>
                  )}
                  <span className="truncate text-xs text-muted">
                    {it.storage} · {it.shelf}
                  </span>
                  {pars.map((p, i) => (
                    <input
                      key={i}
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={p}
                      onChange={(e) =>
                        setBarItems((is) =>
                          is.map((x) =>
                            x.name === it.name
                              ? { ...x, pars: pars.map((pp, j) => (j === i ? Math.max(0, parseFloat(e.target.value) || 0) : pp)) }
                              : x,
                          ),
                        )
                      }
                      className={`w-full rounded-md border px-0.5 py-1 text-center font-mono text-xs outline-none focus:border-brand ${
                        i === di ? 'border-brand/50 bg-brand/10 font-bold' : 'border-transparent bg-transparent hover:border-black/10'
                      }`}
                    />
                  ))}
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
                    className="w-full justify-self-center rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center font-mono text-sm outline-none focus:border-brand"
                  />
                  <span className="text-right">
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
