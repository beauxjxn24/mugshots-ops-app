import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { SPECS } from '../lib/specs'
import { isDrink } from '../lib/categories'
import { usePersistentState } from '../lib/store'
import type { PmixDays } from '../lib/pmix'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/**
 * Signature drinks — prototype layout: three build lists (frozen / shakes &
 * floats / pairings, tap any drink for the full card). Sales chip fills from
 * your PMIX. Bar prep lives under Prep now.
 */
export function Drinks() {
  const drinks = useMemo(() => SPECS.filter(isDrink), [])
  const [days] = usePersistentState<PmixDays>('pmix:days', {})
  const [params] = useSearchParams()
  const [open, setOpen] = useState<string | undefined>(undefined)

  // Deep link from Bar prep: /drinks?spec=<name> opens that build's card.
  useEffect(() => {
    const spec = params.get('spec')
    if (!spec) return
    setOpen(spec)
    setTimeout(() => document.getElementById('drink-specs')?.scrollIntoView({ behavior: 'smooth' }), 120)
  }, [params])

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

        {/* Full build cards */}
        <div id="drink-specs">
          <SpecGrid key={open ?? 'none'} specs={drinks} initialOpen={open} />
        </div>
      </div>
    </>
  )
}
