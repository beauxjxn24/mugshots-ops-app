import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChefHat, Package } from 'lucide-react'
import { Card } from './ui'
import { buildPhoto, readLine, isComponent, type LineBuild } from '../lib/linebuilds'
import { prepItemNames, addToPrep, getCatalog, registerItem } from '../lib/catalog'
import { toast } from '../lib/toast'

/**
 * One dish's line build, exactly as the kitchen's sheet prints it.
 *
 * The sheet is the source of truth, so every printed line shows verbatim. What
 * the app adds is the trail: a component the kitchen preps links to its recipe,
 * one that arrives on a truck links to its catalog item, and one that matches
 * nothing gets a one-tap way to file it — nothing is created behind your back.
 */
export function LineBuildCard({ build, compact = false }: { build: LineBuild; compact?: boolean }) {
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prep = useMemo(() => prepItemNames(), [tick])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stock = useMemo(() => getCatalog().map((i) => i.name), [tick])
  const photo = buildPhoto(build)

  const fileIt = (name: string, where: 'prep' | 'stock') => {
    if (where === 'prep') addToPrep({ name })
    else registerItem({ name })
    toast(`✓ ${name} → ${where === 'prep' ? 'Prep' : 'Item Catalog'}`, 'success')
    setTick((t) => t + 1)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {photo && (
          // A fixed 4:3 frame, so a tall burger shot and a wide bowl shot read
          // as the same card. Letting the photo stretch to card height made
          // every build look like a different component.
          <img
            src={photo}
            alt={build.sheetName}
            loading="lazy"
            className="aspect-[4/3] w-full shrink-0 rounded-xl object-cover ring-1 ring-white/10 sm:w-52"
          />
        )}
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-display text-lg font-semibold text-ink">{build.sheetName}</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                {build.sheet}
              </span>
            </div>
          )}

          <div className="space-y-3">
            {build.sections.map((s) => (
              <div key={s.key}>
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-signal/80">
                  {s.label}
                </div>
                <ul className="space-y-1">
                  {s.lines.map((raw, i) => {
                    const r = readLine(raw, prep, stock)
                    return (
                      <li key={i} className="text-sm leading-snug">
                        {r.qty && (
                          <span className="mr-1.5 font-mono text-xs font-bold text-brand tabular-nums">
                            {r.qty}
                          </span>
                        )}
                        {r.link ? (
                          <Link
                            to={
                              r.link.kind === 'stock'
                                ? `/catalog?q=${encodeURIComponent(r.link.name)}`
                                : `/specs?open=${encodeURIComponent(r.link.name)}`
                            }
                            className="text-ink underline decoration-signal/50 decoration-dotted underline-offset-4 hover:decoration-signal"
                            title={
                              r.link.kind === 'prep'
                                ? `${r.link.name} — open the prep recipe`
                                : r.link.kind === 'stock'
                                  ? `${r.link.name} — in the Item Catalog`
                                  : `${r.link.name} — open the build`
                            }
                          >
                            {r.link.kind === 'prep' ? (
                              <ChefHat size={11} className="mr-1 inline -translate-y-px text-signal/80" aria-hidden />
                            ) : r.link.kind === 'stock' ? (
                              <Package size={11} className="mr-1 inline -translate-y-px text-muted" aria-hidden />
                            ) : null}
                            {r.body}
                          </Link>
                        ) : (
                          <span className="text-ink/85">{r.body}</span>
                        )}
                        {/* Offer to file only what could BE an item. A method
                            line ("seasoned with Tony's, chop like ground beef")
                            is not something you keep on a shelf, and prompting
                            to add it buries the real gaps in noise. */}
                        {!r.link && isComponent(r.body, r.qty) && (
                          <span className="ml-1.5 inline-flex translate-y-px items-center gap-1 align-middle">
                            <button
                              onClick={() => fileIt(r.body, 'prep')}
                              className="inline-flex items-center gap-0.5 rounded border border-white/10 px-1 py-px text-[10px] font-bold text-muted hover:border-signal/50 hover:text-signal"
                              title={`We prep ${r.body} — add it to the prep sheet`}
                            >
                              <Plus size={9} /> prep
                            </button>
                            <button
                              onClick={() => fileIt(r.body, 'stock')}
                              className="inline-flex items-center gap-0.5 rounded border border-white/10 px-1 py-px text-[10px] font-bold text-muted hover:border-brand/50 hover:text-brand"
                              title={`${r.body} arrives on a truck — add it to the Item Catalog`}
                            >
                              <Plus size={9} /> stock
                            </button>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
