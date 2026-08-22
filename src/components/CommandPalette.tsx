import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft, UtensilsCrossed, Martini, ChefHat } from 'lucide-react'
import { NAV, NAV_FLAT, SHIFT_ITEM, STAFF_SECTIONS, ROLLUP_SECTIONS, type NavItem } from '../lib/nav'
import { useRole } from '../lib/role'
import { useRollupLevel } from '../lib/scope'
import { SPECS } from '../lib/specs'
import { isDrink } from '../lib/categories'
import { buildForSpec } from '../lib/buildmatch'

/**
 * Jump-to — ⌘K (Ctrl+K), or the button in the rail.
 *
 * Two things live in here, and the second is the important one.
 *
 * SCREENS. The command rail shows one area at a time, which keeps the menu
 * short but puts a second click between you and a screen in another area.
 * Three letters and Enter beats any amount of clicking.
 *
 * CARDS. Every build and every prep recipe, by name, from anywhere in the app.
 * Finding the Pow Pow Shrimp card used to mean knowing it was food rather than
 * a drink, opening Specs & Recipes, knowing Board hides prep, then hunting the
 * chips — four decisions before you've read a word of it. A cook on the line
 * does not do four decisions; they give up and ask someone. Now you type "pow"
 * and press Enter, and which page it lives on stops being your problem.
 */

/** Where a card actually opens, and what to call it. */
interface CardHit {
  name: string
  kind: string
  to: string
  icon: typeof UtensilsCrossed
}

/**
 * The card index, built once.
 *
 * The two pages deep-link differently — Specs takes `?open=`, Drinks takes
 * `?spec=` — so the routing is done here rather than asking the caller to know.
 * `view=cards` rides along for anything without a plating, because the Board
 * view filters those out and would otherwise swallow the card you just asked
 * for by name.
 */
const CARDS: CardHit[] = SPECS.map((s) => {
  const drink = isDrink(s)
  const built = !!buildForSpec(s.name)
  const q = encodeURIComponent(s.name)
  return {
    name: s.name,
    // What it IS, in the words used out loud. A card with a plating photo is a
    // line build; a prep card is a recipe; anything else falls back to its
    // category minus the word "Builds", which every one of them ends in and
    // none of them needs to repeat.
    kind:
      s.g === 'Prep'
        ? 'Prep recipe'
        : built && !drink
          ? 'Line build'
          : s.g === 'Pairings'
            ? 'Cocktail'
            : s.g.replace(/ Builds$/, ''),
    to: drink ? `/drinks?open=${q}` : `/specs?open=${q}${built ? '' : '&view=cards'}`,
    icon: drink ? Martini : s.g === 'Prep' ? ChefHat : UtensilsCrossed,
  }
})
/** Open the palette from anywhere (the rail's visible button uses this). */
export const openCommandPalette = (): void => {
  window.dispatchEvent(new CustomEvent('mugops:palette'))
}

/** A result is either a screen or a card. */
type Row = { screen: NavItem; card?: never } | { card: CardHit; screen?: never }
const label = (r: Row): string => (r.screen ? r.screen.label : r.card.name)
const target = (r: Row): string => (r.screen ? r.screen.to : r.card.to)

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const role = useRole((s) => s.role)
  const level = useRollupLevel()

  // Search only what the menu would show you. A shortcut that jumps a server to
  // Period Review isn't a shortcut, it's a hole in the same wall the rail puts
  // up — and the fastest way to find one is to type three letters into it.
  const reachable = useMemo<NavItem[]>(() => {
    if (role === 'staff') return [SHIFT_ITEM, ...STAFF_SECTIONS.flatMap((s) => s.items)]
    if (role === 'admin' && level !== 'single') return ROLLUP_SECTIONS.flatMap((s) => s.items)
    if (role === 'admin') return NAV_FLAT
    return NAV_FLAT.filter((i) => i.to !== '/stores')
  }, [role, level])

  // Which area each screen lives in, so a result says where it's taking you.
  const areaOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const sec of NAV) for (const it of sec.items) m.set(it.to, sec.title || 'Dashboard')
    return m
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onAsk = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mugops:palette', onAsk)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mugops:palette', onAsk)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // Cards follow the same rule the screens do: you're only offered what you
  // could open anyway. Both card pages are staff-visible, so in practice this
  // is everyone — but it stays tied to the rail rather than drifting from it.
  const cards = useMemo(() => {
    const open = new Set(reachable.map((i) => i.to))
    return CARDS.filter((c) => open.has(c.to.split('?')[0]))
  }, [reachable])

  const hits = useMemo(() => {
    // First name wins — My Shift appears in both lists for a staff account.
    const all = reachable.filter((i, n) => reachable.findIndex((x) => x.to === i.to) === n)
    const s = q.trim().toLowerCase()
    if (!s) return all.slice(0, 8).map((i) => ({ screen: i }) as Row)

    const rank = (t: string) => (t.startsWith(s) ? 0 : t.includes(s) ? 1 : 2)
    const rows: (Row & { r: number })[] = []
    for (const i of all) {
      const r = rank(i.label.toLowerCase())
      if (r < 2) rows.push({ screen: i, r })
    }
    for (const c of cards) {
      const r = rank(c.name.toLowerCase())
      // A dish you half-remember beats a screen you didn't ask for: on an equal
      // match the card wins, which is what someone typing "pow" wants.
      if (r < 2) rows.push({ card: c, r: r - 0.1 })
    }
    return rows.sort((a, b) => a.r - b.r || label(a).localeCompare(label(b))).slice(0, 9)
  }, [q, reachable, cards])

  if (!open) return null
  const go = (to: string) => {
    setOpen(false)
    nav(to)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((i) => Math.min(i + 1, hits.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((i) => Math.max(i - 1, 0))
              }
              if (e.key === 'Enter' && hits[sel]) go(target(hits[sel]))
            }}
            placeholder="Find a dish, a recipe, or a screen…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-muted">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nothing matches “{q}”.</p>}
          {hits.map((it, i) => {
            const Icon = it.screen ? it.screen.icon : it.card.icon
            return (
              <button
                key={target(it)}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(target(it))}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${
                  i === sel ? 'bg-signal/12 text-ink' : 'text-ink/80'
                }`}
              >
                <Icon
                  size={15}
                  className={`shrink-0 ${it.card ? 'text-brand' : 'text-muted'}`}
                  strokeWidth={2}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{label(it)}</span>
                {/* A card says what it is; a screen says which area it's in. */}
                <span className="shrink-0 text-[11px] text-muted">
                  {it.card ? it.card.kind : (areaOf.get(it.screen.to) ?? '')}
                </span>
                {i === sel && <CornerDownLeft size={13} className="shrink-0 text-signal" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
