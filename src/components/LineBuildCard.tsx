import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChefHat } from 'lucide-react'
import { Card } from './ui'
import { buildPhoto, readLine, type LineBuild } from '../lib/linebuilds'
import { prepItemNames } from '../lib/catalog'

/**
 * One dish's line build, exactly as the kitchen's sheet prints it.
 *
 * The sheet is the source of truth, so every printed line shows verbatim. What
 * the app adds is the trail: a component that matches a prep recipe becomes a
 * link to that recipe, and one that matches nothing gets a one-tap way to add
 * it — nothing is created behind your back.
 */
/**
 * Could this line name a thing the kitchen stocks or preps? A component is
 * portioned, short, and has no verb driving it; anything longer is a method
 * line, and an unportioned line is plateware or a bread type.
 */
function isComponent(body: string): boolean {
  const words = body.split(/\s+/)
  if (words.length > 5 || /[.]/.test(body)) return false
  return !/^(toss|drizzle|garnish|cut|combine|heat|place|mic|fry|serve|use|top|choose|portion)\b/i.test(body)
}

export function LineBuildCard({ build }: { build: LineBuild }) {
  const prepNames = useMemo(() => prepItemNames(), [])
  const photo = buildPhoto(build)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {photo && (
          <img
            src={photo}
            alt={build.sheetName}
            className="h-44 w-full shrink-0 object-cover sm:h-auto sm:w-44"
          />
        )}
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-display text-lg font-semibold text-ink">{build.sheetName}</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              {build.sheet}
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {build.sections.map((s) => (
              <div key={s.key}>
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-signal/80">
                  {s.label}
                </div>
                <ul className="space-y-1">
                  {s.lines.map((raw, i) => {
                    const r = readLine(raw, prepNames)
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
                              r.link.kind === 'prep'
                                ? `/specs?open=${encodeURIComponent(r.link.name)}`
                                : `/line-builds?open=${encodeURIComponent(r.link.name)}`
                            }
                            className="text-ink underline decoration-signal/50 decoration-dotted underline-offset-4 hover:decoration-signal"
                            title={`${r.link.name} — open the recipe`}
                          >
                            {r.link.kind === 'prep' && (
                              <ChefHat size={11} className="mr-1 inline -translate-y-px text-signal/80" aria-hidden />
                            )}
                            {r.body}
                          </Link>
                        ) : (
                          <span className="text-ink/85">{r.body}</span>
                        )}
                        {/* Offer to add only what could BE an item. A method line
                            ("cook on the flat top, chop like ground beef") is not
                            something you keep on a shelf, and prompting to add it
                            buries the handful of real gaps in noise. */}
                        {!r.link && r.qty && isComponent(r.body) && (
                          <button
                            className="ml-1.5 inline-flex translate-y-px items-center gap-0.5 rounded border border-white/10 px-1 py-px align-middle text-[10px] font-bold text-muted hover:border-brand/50 hover:text-brand"
                            title={`Add ${r.body} to Prep or the Item Catalog`}
                          >
                            <Plus size={9} /> add
                          </button>
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
