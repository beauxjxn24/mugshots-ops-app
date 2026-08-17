// Choosing what the Food Focus tile pushes.
//
// The tile picked its own line-up: every LTO, then the best-selling burgers.
// Sound defaults, but they're not a decision — a manager pushing Pow Pow Shrimp
// this week had no way to say so, because it's neither an LTO nor a burger and
// nothing in the app would ever rotate it in.
//
// So: type a few letters, take the match. The list stays as it is until it's
// cleared, and clearing it hands the tile back to the automatic line-up rather
// than leaving it empty — an empty focus tile is worse than a default one.
import { useMemo, useRef, useState } from 'react'
import { Search, X, Plus, RotateCcw } from 'lucide-react'
import { ACTIVE_SPECS } from '../lib/specs'
import { dishPhoto } from '../lib/photos'

// What can be pushed: things a guest can order. Prep cards are excluded --
// "Pow Pow Shrimp" is both a plated appetizer and a bag of portioned shrimp in
// the freezer, and the prep card outranked the dish on an exact name match, so
// picking it put "6 OZ PORTIONS · Breaded Shrimp" on the tile as the thing to
// sell tonight.
const PUSHABLE = ACTIVE_SPECS.filter((s) => s.g !== 'Prep')

// What an empty box offers: the LTOs first, since that's usually what's being
// pushed, then the rest of the menu. It's a DROP DOWN -- clicking it has to
// show something to grab. Offering nothing until you type is a search box
// wearing a dropdown's name, and leaves you guessing whether it works at all.
const STARTER = [
  ...PUSHABLE.filter((s) => s.lto || s.g === 'Summer LTO' || /\bLTO\b/i.test(s.shelf)),
  ...PUSHABLE.filter((s) => !(s.lto || s.g === 'Summer LTO' || /\bLTO\b/i.test(s.shelf))).sort((a, b) =>
    a.name.localeCompare(b.name),
  ),
]

/** Substring first, so an exact-ish type-ahead beats a loose word match. */
function rank(query: string, limit = 8) {
  const q = query.trim().toLowerCase()
  if (!q) return STARTER
  const words = q.split(/\s+/)
  return PUSHABLE.map((s) => {
    const n = s.name.toLowerCase()
    let score = 0
    if (n === q) score = 100
    else if (n.startsWith(q)) score = 80
    else if (n.includes(q)) score = 60
    else if (words.every((w) => n.includes(w))) score = 40
    else if (s.ing.some(([i]) => i.toLowerCase().includes(q))) score = 20
    return { s, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s)
}

export function FocusPicker({
  picked,
  onChange,
  onClose,
}: {
  picked: string[]
  onChange: (next: string[]) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => rank(q).filter((s) => !picked.includes(s.name)), [q, picked])

  const add = (name: string) => {
    onChange([...picked, name])
    setQ('')
    setSel(0)
    inputRef.current?.focus()
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-navy/95 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold text-white">What are we pushing?</span>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-bold text-white/60 hover:text-white">
          Done
        </button>
      </div>

      {picked.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {picked.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/12 py-1 pl-1 pr-2 text-xs font-semibold text-white"
            >
              {dishPhoto(name) ? (
                <img src={dishPhoto(name)} alt="" className="size-5 rounded-full object-cover" />
              ) : (
                <span className="size-5 rounded-full bg-white/15" />
              )}
              {name}
              <button
                onClick={() => onChange(picked.filter((n) => n !== name))}
                aria-label={`Remove ${name}`}
                className="text-white/50 hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setSel(0)
          }}
          // Enter takes the highlighted match. Typing a name and pressing Enter
          // used to do nothing at all, which reads as "it didn't find it".
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && results[sel]) {
              e.preventDefault()
              add(results[sel].name)
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
          placeholder="Type a menu item — Pow Pow Shrimp, Gamble…"
          className="w-full rounded-xl border border-white/15 bg-white/[0.07] py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-brand"
        />
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10">
        {results.length === 0 ? (
          <p className="px-3 py-3 text-xs text-white/50">
            {q.trim() ? `Nothing on the menu matches “${q.trim()}”.` : 'Everything on the menu is already picked.'}
          </p>
        ) : (
          <>
            {q.trim() === '' && (
              <div className="sticky top-0 border-b border-white/10 bg-navy/95 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white/40 backdrop-blur">
                LTOs first · or type to search
              </div>
            )}
            {
            results.map((s, i) => (
              <button
                key={s.name}
                onMouseEnter={() => setSel(i)}
                onClick={() => add(s.name)}
                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left ${
                  i === sel ? 'bg-white/12' : 'hover:bg-white/[0.06]'
                }`}
              >
                {dishPhoto(s.name) ? (
                  // lazy: the empty-box list is the whole menu, not eight rows
                  <img src={dishPhoto(s.name)} alt="" loading="lazy" className="size-8 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[9px] font-bold text-white/40">
                    no pic
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{s.name}</span>
                  <span className="block truncate text-[11px] text-white/45">{s.g}</span>
                </span>
                <Plus size={14} className="shrink-0 text-white/40" />
              </button>
            ))}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
        <span className="text-[11px] text-white/45">
          {picked.length === 0
            ? 'Empty = automatic: every LTO, then the best-selling burgers.'
            : `${picked.length} item${picked.length === 1 ? '' : 's'} · shown in this order`}
        </span>
        {picked.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-white/60 hover:text-white"
          >
            <RotateCcw size={11} />
            Back to automatic
          </button>
        )}
      </div>
    </div>
  )
}
