import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { SPECS } from '../lib/specs'
import { isDrink } from '../lib/categories'
import { usePersistentState } from '../lib/store'
import { sanitizePmix, type PmixDays } from '../lib/pmix'
import { allBuilds, buildFor } from '../lib/linebuilds'
import { LineBuildCard } from '../components/LineBuildCard'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/**
 * Lowercase, punctuation stripped, single-spaced, and with pour-size and
 * packaging words dropped — so the menu's "Frozen Margarita Bulk" and the
 * PMIX's "Frozen Margarita 32oz" both reduce to "frozen margarita".
 */
const SIZE_WORDS = /\b(\d+\s*oz|oz|bulk|pitcher|glass|single|double|each|ea|lg|large|sm|small|reg|regular)\b/g
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(SIZE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Is this PMIX item one of the signature drinks?
 *
 * Matching is whole-name, not substring. The old test asked whether either
 * name contained the other's first ten characters, which let a PMIX item
 * called "Rita" or "Smash" match three drinks at once and inflated the count
 * into the hundreds. Now an item counts only when it IS the drink, or extends
 * it on a word boundary ("Frozen Margarita 32oz"). The reverse — a shorter
 * PMIX name that the drink extends — is allowed too, but only from eight
 * characters up, which is long enough that it can't be a stray word.
 */
function matchesDrink(item: string, drinkNames: string[]): boolean {
  if (!item) return false
  return drinkNames.some(
    (dn) => item === dn || item.startsWith(`${dn} `) || (item.length >= 8 && dn.startsWith(`${item} `)),
  )
}

/**
 * Signature drinks — prototype layout: three build lists (frozen / shakes &
 * floats / pairings, tap any drink for the full card). Sales chip fills from
 * your PMIX. Bar prep lives under Prep now.
 */
export function Drinks() {
  const drinks = useMemo(() => SPECS.filter(isDrink), [])
  // A sheet is a drink's build when it came off a drink sheet, or when it
  // matches a drink already on the menu.
  const drinkBuilds = useMemo(
    () =>
      allBuilds().filter(
        (b) => /drink|rita|shake|cocktail/i.test(b.sheet) || drinks.some((d) => buildFor(d.name) === b),
      ),
    [drinks],
  )
  const [rawDays] = usePersistentState<PmixDays>('pmix:days', {})
  const days = sanitizePmix(rawDays)
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

  // Signature drinks sold over the last 7 days of product mix on file — PMIX
  // items matched to a build by name.
  // items whose name matches a build. A count with no dates behind it is just a
  // number, so this carries the exact window AND how many of those days were
  // actually imported: 383 over 6 days reads very differently from 383 over 2.
  const sold = useMemo(() => {
    const keys = Object.keys(days).sort()
    const latest = keys[keys.length - 1]
    if (!latest) return null
    const from = (() => {
      const [y, m, d] = latest.split('-').map(Number)
      const f = new Date(y, m - 1, d - 6)
      return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
    })()
    const names = drinks.map((s) => norm(s.name)).filter((n) => n.length >= 5)
    const window = keys.filter((k2) => k2 >= from && k2 <= latest)
    let qty = 0
    let sales = 0
    for (const k of window)
      for (const it of days[k]?.items ?? []) {
        if (it.sales <= 0) continue
        if (matchesDrink(norm(it.name), names)) {
          qty += it.qty
          sales += it.sales
        }
      }
    if (qty <= 0) return null
    const md = (d: string) => {
      const [y, mo, da] = d.split('-').map(Number)
      return new Date(y, mo - 1, da).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return {
      qty,
      sales,
      from: md(window[0] ?? from),
      to: md(latest),
      days: window.length,
    }
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
        right={
          sold && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-right backdrop-blur">
              <div className="flex items-baseline justify-end gap-2">
                <span className="font-display text-xl font-semibold text-ink tabular-nums">{sold.qty}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-muted">drinks</span>
                <span className="font-display text-xl font-semibold text-brand tabular-nums">{money(sold.sales)}</span>
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-signal/80">
                {sold.from} – {sold.to} · {sold.days} day{sold.days === 1 ? '' : 's'} on file
              </div>
            </div>
          )
        }
      />
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Bar recipe cards, read straight off the sheets — same treatment the
            kitchen's line builds get, with each ingredient linked to the bar
            prep that makes it. */}
        {drinkBuilds.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-muted">
              Bar recipe cards · {drinkBuilds.length}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {drinkBuilds.map((b) => (
                <LineBuildCard key={b.sheetName} build={b} />
              ))}
            </div>
          </div>
        )}
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
