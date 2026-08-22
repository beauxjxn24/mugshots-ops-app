// "We ran out of Pow Pow sauce."
//
// Eight o'clock on a Friday, a cook needs a recipe, and it is almost never the
// one on tonight's prep sheet — that's the point, it ran out. The staff prep
// screen used to end at "nothing to do until then", which is true about the
// list and wrong about the night.
//
// So: type two letters, tap the card, read it, and set the batch count right
// there. It opens ON this screen rather than sending anyone to another tab,
// because the cook is mid-shift with one hand and shouldn't have to find their
// way back.
import { useMemo, useState } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import { Card } from './ui'
import { SPECS } from '../lib/specs'
import { useArchived } from '../lib/archived'
import { SpecPeek } from './SpecPeek'

export function RecipeLookup({ className = '' }: { className?: string }) {
  const [q, setQ] = useState('')
  const [peek, setPeek] = useState<string | null>(null)
  const { archivedSet } = useArchived()

  // Prep cards first — that's what someone runs out of — then everything else,
  // because "how is the Comeback Burger built" is the same question at the same
  // moment. Parked and off-menu cards stay out.
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const live = SPECS.filter((s) => !s.off && !archivedSet.has(s.name))
    const score = (s: (typeof live)[number]) => {
      const n = s.name.toLowerCase()
      if (!n.includes(needle)) return 99
      return (n.startsWith(needle) ? 0 : 1) + (s.g === 'Prep' ? 0 : 0.5)
    }
    return live
      .filter((s) => s.name.toLowerCase().includes(needle))
      .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [q, archivedSet])

  return (
    <>
      <Card className={`p-3 ${className}`}>
        <div className="mb-2 flex items-center gap-2">
          <BookOpen size={14} className="shrink-0 text-brand" />
          <span className="text-sm font-semibold text-ink">Need a recipe?</span>
          <span className="text-xs text-muted">any prep item or build — set the batch on the card</span>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pow Pow, comeback, chili…"
            className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-9 pr-9 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-brand"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {q.trim().length >= 2 && (
          <div className="mt-2 space-y-1">
            {hits.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted">Nothing matches “{q.trim()}”.</p>
            )}
            {hits.map((s) => (
              <button
                key={s.name}
                onClick={() => setPeek(s.name)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-brand/[0.07]"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{s.name}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  {s.g === 'Prep' ? 'Prep recipe' : s.g.replace(/ Builds$/, '')}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* The card opens here, over the prep screen, with its own batch control. */}
      <SpecPeek name={peek} onClose={() => setPeek(null)} />
    </>
  )
}
