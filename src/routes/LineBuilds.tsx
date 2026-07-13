import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { SPECS, GROUP_ORDER } from '../lib/specs'

/**
 * Line builds — the kitchen line's board view (handoff spec): every build
 * card at a glance, ingredients in build order, dense and printable. Recipes
 * and prep live on Specs; this is the on-the-line reference.
 */
export function LineBuilds() {
  const buildGroups = useMemo(
    () => GROUP_ORDER.filter((g) => g.endsWith('Builds') && SPECS.some((s) => s.g === g)),
    [],
  )
  const [group, setGroup] = useState('All')
  const [q, setQ] = useState('')

  const cards = useMemo(() => {
    const query = q.trim().toLowerCase()
    return SPECS.filter(
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
              {g.replace(' Builds', '')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
          {cards.map((s) => (
            <Card key={`${s.g}-${s.name}`} className="break-inside-avoid p-3.5 print:border print:shadow-none">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate font-display text-[15px] font-semibold text-ink">{s.name}</div>
                <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wide text-muted">
                  {s.g.replace(' Builds', '')}
                </span>
              </div>
              <ol className="mt-1.5 space-y-0.5">
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
            </Card>
          ))}
        </div>
        {cards.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No builds match “{q}”.</p>
        )}
      </div>
    </>
  )
}
