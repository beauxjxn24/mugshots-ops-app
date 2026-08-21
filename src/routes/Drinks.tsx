import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { SPECS, slug } from '../lib/specs'
import { isDrink } from '../lib/categories'
import { usePersistentState } from '../lib/store'
import { sanitizePmix, type PmixDays } from '../lib/pmix'

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
 * The sections, in the order the bar menu reads.
 *
 * "Cocktail pairings" is gone as an idea — those drinks were paired against the
 * SmashBurger LTO and they are the house cocktail list now, so the section is
 * just Cocktails.
 *
 * `also` picks up cards filed elsewhere: the root beer float is a dessert build
 * on the food side, which is right, but a bartender making one comes looking
 * here and the section is called floats.
 */
const SECTIONS: { title: string; groups: string[]; also?: string[] }[] = [
  { title: 'Cocktails', groups: ['Pairings'] },
  { title: 'Frozen', groups: ['Frozen Drinks'] },
  { title: 'Shakes & floats', groups: ['Shakes'], also: ['10 oz Root Beer Float', '22 oz Root Beer Float'] },
  { title: 'Specials', groups: ['Summer LTO'] },
]

const anchor = (title: string) => `drinks-${slug(title)}`/**
 * Signature drinks — laid out the way Specs & Recipes is.
 *
 * The page used to render every drink three times over: a strip of bar recipe
 * cards, then three columns of names, then a grid of those same cards again.
 * Reading it meant scrolling past the same margarita twice to work out whether
 * you'd already passed it.
 *
 * Now it's the food page's shape — chips with counts, a sticky jump bar, and
 * one headed section per part of the bar menu — so a cook and a bartender are
 * reading the same screen in two places rather than learning two screens.
 */
export function Drinks() {
  const drinks = useMemo(() => SPECS.filter((s) => isDrink(s) && !s.off), [])
  const [group, setGroup] = useState('All')

  const sections = useMemo(() => {
    const live = SPECS.filter((s) => !s.off)
    return SECTIONS.map((d) => ({
      ...d,
      items: live
        .filter(
          (s) =>
            // The Summer LTO group is half food — the Colony Classic and the
            // Freedom Feast are burgers — so a group alone isn't enough to put
            // something on the drinks page. isDrink() reads the name for that
            // group; `also` is the hand-picked exception.
            (d.groups.includes(s.g) && isDrink(s)) || d.also?.includes(s.name),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((d) => d.items.length > 0)
  }, [])

  const shown = useMemo(
    () => (group === 'All' ? sections : sections.filter((s) => s.title === group)),
    [sections, group],
  )
  const total = shown.reduce((n, s) => n + s.items.length, 0)

  // Deep link from Bar prep: /drinks?spec=<name> opens that card and scrolls
  // to it. Clears the section filter first, or a card outside the chosen
  // section stays hidden.
  const [params] = useSearchParams()
  const want = params.get('spec')
  const [open, setOpen] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!want) return
    const hit = SPECS.find((s) => s.name.toLowerCase() === want.toLowerCase())
    if (!hit) return
    setGroup('All')
    setOpen(hit.name)
    requestAnimationFrame(() =>
      document.getElementById(`spec-${slug(hit.name)}`)?.scrollIntoView({ block: 'center' }),
    )
  }, [want])

  const [rawDays] = usePersistentState<PmixDays>('pmix:days', {})
  const days = sanitizePmix(rawDays)

  // Signature drinks sold over the last 7 days of product mix on file. A count
  // with no dates behind it is just a number, so this carries the exact window
  // AND how many of those days were actually imported: 383 over 6 days reads
  // very differently from 383 over 2.
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
    return { qty, sales, from: md(window[0] ?? from), to: md(latest), days: window.length }
  }, [days, drinks])

  return (
    <>
      <PageHeader
        width="full"
        title="Signature drinks"
        subtitle={`${total} build${total === 1 ? '' : 's'} — tap any drink for the full card`}
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

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Section chips, each carrying its count. */}
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setGroup('All')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              group === 'All'
                ? 'border-brand bg-brand text-white'
                : 'border-black/10 bg-white text-muted hover:border-brand/40'
            }`}
          >
            Everything
          </button>
          {sections.map((s) => (
            <button
              key={s.title}
              onClick={() => setGroup(s.title)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                group === s.title
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {s.title}
              <span className={group === s.title ? 'ml-1.5 text-white/60' : 'ml-1.5 text-muted/60'}>
                {s.items.length}
              </span>
            </button>
          ))}
        </div>

        {/* Jump bar — same as the food page, so a category is a tap rather than
            a scroll. Only earns its space when there's more than one section. */}
        {shown.length > 1 && (
          <div className="sticky top-0 z-20 -mx-4 mb-4 flex gap-1.5 overflow-x-auto border-b border-white/10 bg-cream/85 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <span className="shrink-0 self-center pr-1 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Jump
            </span>
            {shown.map((s) => (
              <button
                key={s.title}
                onClick={() =>
                  document.getElementById(anchor(s.title))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-muted hover:bg-brand/10 hover:text-brand-600"
              >
                {s.title} <span className="text-muted/50">{s.items.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-7">
          {shown.map((s) => (
            <section key={s.title} id={anchor(s.title)} className="scroll-mt-16">
              <h2 className="mb-2.5 flex items-baseline gap-2 border-b border-white/10 pb-1.5">
                <span className="font-display text-sm font-semibold text-ink">{s.title}</span>
                <span className="text-xs text-muted">{s.items.length}</span>
              </h2>
              <SpecGrid specs={s.items} initialOpen={open} />
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
