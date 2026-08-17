import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { ACTIVE_SPECS } from '../lib/specs'
import type { Spec } from '../lib/types'

/**
 * The runs, newest first.
 *
 * Limited-time offers arrive as a set with a name on the sheet — Fall 2025,
 * Summer 2025 — and the kitchen thinks in those sets. A run that isn't listed
 * here still shows, under its own name at the end, so the next campaign appears
 * on this screen the day its builds land rather than waiting on this list.
 */
const RUN_ORDER = [
  'Summer 2026',
  'Colony Classic',
  'SmashBurger',
  'Firecracker',
  'Fall 2025',
  'Summer 2025',
  'Fall 2024',
  'LTO Pairings',
]

const UNFILED = 'Other specials'
const anchor = (run: string) => `run-${run.replace(/\s+/g, '-')}`

export function LTO() {
  // Every limited-time build: the ones tagged with a run, plus anything still
  // marked only by having "LTO" written on its shelf.
  //
  // Not the yield line — the milkshakes carry "$3.99 LTO pricing" there and
  // were landing on this screen as if they were a special. They're on the menu
  // year round; it's the price that's limited.
  const lto = useMemo(
    () => ACTIVE_SPECS.filter((s) => s.lto || s.g === 'Summer LTO' || /\bLTO\b/i.test(s.shelf)),
    [],
  )

  // Cut into runs. One flat list meant four separate campaigns sat shuffled
  // together and the same item could be hunted for twice.
  const runs = useMemo(() => {
    const by = new Map<string, Spec[]>()
    for (const s of lto) {
      const run = s.lto || UNFILED
      const list = by.get(run)
      if (list) list.push(s)
      else by.set(run, [s])
    }
    const known = RUN_ORDER.filter((r) => by.has(r))
    const rest = [...by.keys()].filter((r) => !RUN_ORDER.includes(r) && r !== UNFILED).sort()
    const order = [...known, ...rest, ...(by.has(UNFILED) ? [UNFILED] : [])]
    return order.map((run) => ({ run, items: by.get(run)! }))
  }, [lto])

  // Deep link (?item=Name) — e.g. the dashboard's Food Focus card — opens
  // that build directly instead of dumping you at the top of the page.
  const [params] = useSearchParams()
  const want = (params.get('item') ?? '').toLowerCase()
  const initialOpen = want ? lto.find((s) => s.name.toLowerCase() === want)?.name : undefined

  return (
    <>
      <PageHeader
        title="LTO"
        subtitle={`${lto.length} limited-time builds across ${runs.length} run${runs.length === 1 ? '' : 's'}`}
      />
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Jump bar — the runs go back years, and scrolling to find one is what
            this screen was worst at. */}
        {runs.length > 1 && (
          <div className="sticky top-0 z-20 -mx-4 mb-4 flex gap-1.5 overflow-x-auto border-b border-white/10 bg-cream/85 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <span className="shrink-0 self-center pr-1 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Run
            </span>
            {runs.map(({ run, items }) => (
              <button
                key={run}
                onClick={() =>
                  document.getElementById(anchor(run))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-muted hover:bg-brand/10 hover:text-brand-600"
              >
                {run} <span className="text-muted/50">{items.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-7">
          {runs.map(({ run, items }) => (
            <section key={run} id={anchor(run)} className="scroll-mt-16">
              <h2 className="mb-2.5 flex items-baseline gap-2 border-b border-white/10 pb-1.5">
                <span className="font-display text-sm font-semibold text-ink">{run}</span>
                <span className="text-xs text-muted">{items.length}</span>
              </h2>
              <SpecGrid specs={items} initialOpen={initialOpen} />
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
