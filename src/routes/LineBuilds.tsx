import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { ACTIVE_SPECS, GROUP_ORDER } from '../lib/specs'
import { dishPhoto } from '../lib/photos'

/**
 * Line builds — the kitchen line's board view (handoff spec): every build
 * card at a glance, ingredients in build order, dense and printable. Recipes
 * and prep live on Specs; this is the on-the-line reference.
 */
export function LineBuilds() {
  const buildGroups = useMemo(
    () => GROUP_ORDER.filter((g) => g.endsWith('Builds') && ACTIVE_SPECS.some((s) => s.g === g)),
    [],
  )
  const [group, setGroup] = useState('All')
  const [q, setQ] = useState('')

  const cards = useMemo(() => {
    const query = q.trim().toLowerCase()
    return ACTIVE_SPECS.filter(
      (s) =>
        s.g.endsWith('Builds') &&
        (group === 'All' || s.g === group) &&
        (!query || s.name.toLowerCase().includes(query) || s.ing.some(([n]) => n.toLowerCase().includes(query))),
    )
  }, [group, q])

  return (
    <>
      <PageHeader
        title="Line Builds"
        subtitle={`${cards.length} build card${cards.length === 1 ? '' : 's'} · the on-the-line board`}
        right={
          <div className="flex items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Find a build…" className="w-full max-w-xs" />
            <button
              onClick={() => window.print()}
              aria-label="Print"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-black/10 bg-white text-ink print:hidden"
            >
              <Printer size={15} />
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap gap-2 print:hidden">
          {['All', ...buildGroups].map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                group === g ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {g === 'Line Builds' ? 'LTO' : g.replace(' Builds', '')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
          {cards.map((s) => {
            const photo = dishPhoto(s.name)
            const tag = s.g.replace(' Builds', '')
            return (
              <article
                key={`${s.g}-${s.name}`}
                className="group break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.07] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:ring-black/10 print:rounded-none print:border print:shadow-none print:ring-0 print:transition-none print:hover:translate-y-0"
              >
                {photo && (
                  // Square, because the photos are square-to-portrait (0.54–1.79,
                  // most near 0.75–1.0). The old card cropped them into a 112px
                  // letterbox — roughly 3:1 — which kept a thin band across the
                  // middle and cut the dish off top and bottom.
                  <div className="relative aspect-square overflow-hidden bg-navy/5 print:hidden">
                    <img
                      src={photo}
                      alt={s.name}
                      loading="lazy"
                      className="size-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white backdrop-blur-sm">
                      {tag}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10">
                      <h3 className="font-display text-[15px] font-semibold leading-tight text-white">{s.name}</h3>
                    </div>
                  </div>
                )}
                {/* The name again for print and for builds with no photo yet —
                    the overlay above rides on an image that print drops. */}
                <div
                  className={`items-center justify-between gap-2 px-3.5 pt-3 ${photo ? 'hidden print:flex' : 'flex'}`}
                >
                  <div className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-ink">{s.name}</div>
                  <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wide text-muted">{tag}</span>
                </div>
                <ol className="space-y-0.5 p-3.5">
                  {s.ing.map(([n, qty], i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-[13px] leading-snug">
                      <span className="text-ink/85">
                        <span className="mr-1.5 font-mono text-[10px] text-muted">{i + 1}</span>
                        {n}
                      </span>
                      {qty && <span className="shrink-0 font-mono text-[11px] font-semibold text-brand">{qty}</span>}
                    </li>
                  ))}
                </ol>
              </article>
            )
          })}
        </div>
        {cards.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No builds match “{q}”.</p>
        )}
      </div>
    </>
  )
}
