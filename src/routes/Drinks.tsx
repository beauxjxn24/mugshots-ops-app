import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { SPECS } from '../lib/specs'
import { isDrink } from '../lib/categories'
import { dishPhoto } from '../lib/photos'
import { usePersistentState } from '../lib/store'
import { sanitizePmix, type PmixDays } from '../lib/pmix'
import type { Spec } from '../lib/types'

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
 * The decks, and which spec groups feed each.
 *
 * "Cocktail pairings" is gone as an idea — those drinks were paired with the
 * SmashBurger LTO and they are the house cocktail list now, so the deck is just
 * Cocktails.
 *
 * `also` picks up cards filed elsewhere: the root beer float is a dessert build
 * on the food side, which is right, but a bartender making one comes looking
 * here and the deck is called floats.
 */
const DECKS: { title: string; groups: string[]; also?: string[] }[] = [
  { title: 'Cocktails', groups: ['Pairings'] },
  { title: 'Frozen', groups: ['Frozen Drinks'] },
  { title: 'Shakes & floats', groups: ['Shakes'], also: ['Root Beer Float'] },
  { title: 'Specials', groups: ['Summer LTO'] },
]

/**
 * Signature drinks — a rolodex.
 *
 * The page showed every drink three times over: a strip of bar recipe cards at
 * the top, then three columns of names, then a grid of those same cards again
 * underneath. Reading it meant scrolling past the same margarita twice to work
 * out whether you had already passed it.
 *
 * One card at a time now, the way the recipe binder behind the bar works: pick
 * the deck, flip with the arrows or the keyboard, and the whole build sits on
 * screen at once with the photo beside it.
 */
export function Drinks() {
  const drinks = useMemo(() => SPECS.filter((s) => isDrink(s) && !s.off), [])
  const [deck, setDeck] = useState(0)
  const [i, setI] = useState(0)

  const decks = useMemo(() => {
    const live = SPECS.filter((s) => !s.off)
    return DECKS.map((d) => ({
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

  const cards: Spec[] = decks[deck]?.items ?? []
  const at = Math.min(i, Math.max(0, cards.length - 1))
  const card = cards[at]

  const go = (step: number) => setI(cards.length ? (at + step + cards.length) % cards.length : 0)

  // Arrow keys flip the card — this gets read standing at the well, one hand.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, at])

  // Deep link from Bar prep: /drinks?spec=<name> opens that card in its deck.
  const [params] = useSearchParams()
  useEffect(() => {
    const want = params.get('spec')
    if (!want) return
    const d = decks.findIndex((x) => x.items.some((s) => s.name.toLowerCase() === want.toLowerCase()))
    if (d < 0) return
    setDeck(d)
    setI(decks[d].items.findIndex((s) => s.name.toLowerCase() === want.toLowerCase()))
  }, [params, decks])

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
        title="Signature drinks"
        subtitle="Flip through the deck — arrow keys work, or tap a name below"
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

      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Which deck */}
        <div className="flex flex-wrap gap-2">
          {decks.map((d, n) => (
            <button
              key={d.title}
              onClick={() => {
                setDeck(n)
                setI(0)
              }}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                n === deck
                  ? 'border-brand bg-brand text-white'
                  : 'border-white/10 bg-white/[0.03] text-muted hover:text-ink'
              }`}
            >
              {d.title}
              <span className={n === deck ? 'ml-1.5 text-white/60' : 'ml-1.5 text-muted/60'}>{d.items.length}</span>
            </button>
          ))}
        </div>

        {card && (
          <Card className="overflow-hidden">
            <div className="grid gap-0 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
              <DrinkPhoto spec={card} />

              <div className="min-w-0 p-5">
                <div className="font-display text-2xl font-semibold text-ink">{card.name}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
                  {[card.storage, card.shelf, card.yields].filter(Boolean).map((c, n) => (
                    <span key={n} className="rounded-full bg-black/5 px-2 py-0.5 font-semibold">
                      {c}
                    </span>
                  ))}
                </div>

                {card.ing.length > 0 && (
                  <>
                    <div className="mb-1.5 mt-4 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                      Pour
                    </div>
                    <ul className="space-y-1">
                      {card.ing.map(([n, qty], k) => (
                        <li
                          key={k}
                          className="flex justify-between gap-3 border-b border-black/5 pb-1 text-sm last:border-0"
                        >
                          <span className="text-ink">{n}</span>
                          <span className="shrink-0 font-mono text-xs font-bold text-brand">{qty}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {card.steps.length > 0 && (
                  <>
                    <div className="mb-1.5 mt-4 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                      Build
                    </div>
                    <ol className="list-decimal space-y-1 pl-4 text-sm text-ink/90">
                      {card.steps.map((st, k) => (
                        <li key={k}>{st}</li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            </div>

            {/* Flip */}
            <div className="flex items-center gap-2 border-t border-black/5 bg-black/[0.02] px-4 py-2.5">
              <button
                onClick={() => go(-1)}
                aria-label="Previous drink"
                className="grid size-8 place-items-center rounded-lg border border-black/10 bg-white text-muted hover:border-brand/40 hover:text-brand-600"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-mono text-xs text-muted">
                {at + 1} of {cards.length}
              </span>
              <button
                onClick={() => go(1)}
                aria-label="Next drink"
                className="grid size-8 place-items-center rounded-lg border border-black/10 bg-white text-muted hover:border-brand/40 hover:text-brand-600"
              >
                <ChevronRight size={16} />
              </button>
              <span className="ml-auto truncate text-[11px] text-muted">{decks[deck]?.title}</span>
            </div>
          </Card>
        )}

        {/* The tabs down the side of a rolodex — every drink in the deck one tap
            away, with the one you're on marked. */}
        <div className="flex flex-wrap gap-1.5">
          {cards.map((s, n) => (
            <button
              key={s.name}
              onClick={() => setI(n)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                n === at
                  ? 'border-brand bg-brand/10 text-brand-600'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40 hover:text-ink'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** The photo, or the drink's initials where there isn't one yet. */
function DrinkPhoto({ spec }: { spec: Spec }) {
  const photo = dishPhoto(spec.name)
  if (photo) {
    return <img src={photo} alt="" className="h-56 w-full object-cover object-center sm:h-full sm:min-h-[20rem]" />
  }
  const initials = spec.name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <div className="grid h-40 w-full place-items-center bg-black/[0.04] sm:h-full sm:min-h-[20rem]">
      <span className="font-display text-3xl font-semibold text-muted/40">{initials}</span>
    </div>
  )
}
