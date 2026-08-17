import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { UtensilsCrossed } from 'lucide-react'
import { usageIndex } from '../lib/linebuilds'
import { SPECS } from '../lib/specs'
import { prepItemNames, barPrepNames, getCatalog } from '../lib/catalog'

/**
 * "Used in" — every dish a prep item or stocked component goes into.
 *
 * The line builds already say which prep each dish pulls; read the other way
 * round, they say what a prep feeds. Diced Tomatoes touches most of the menu,
 * so whoever changes that recipe — or sets its par — can see the blast radius
 * without opening sixty build cards.
 */
export function UsedIn({ name, className = '' }: { name: string; className?: string }) {
  const spec = SPECS.find((s) => s.name === name)
  const dishes = useMemo(() => {
    const derived = usageIndex([...prepItemNames(), ...barPrepNames()], getCatalog().map((i) => i.name)).get(name) ?? []
    // Hand-set links sit alongside whatever the sheets say. Some phrasing no
    // matcher should be asked to read — "3 Mozzarella or Pepperjack" is one
    // line offering two preps — so those are recorded rather than guessed.
    return [...new Set([...(spec?.usedIn ?? []), ...derived])].sort((a, b) => a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  // An intermediate prep feeds other prep, not a dish. Saying so beats an empty
  // space that reads as a missing link.
  if (spec?.prepOnly) {
    return (
      <div className={className}>
        <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
          <UtensilsCrossed size={11} aria-hidden />
          Prep component — feeds other prep, not a dish directly
        </div>
      </div>
    )
  }
  if (dishes.length === 0) return null
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
        <UtensilsCrossed size={11} aria-hidden />
        Used in · {dishes.length} dish{dishes.length === 1 ? '' : 'es'}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {dishes.map((d) => (
          <Link
            key={d}
            to={`/specs?open=${encodeURIComponent(d)}`}
            className="rounded-full bg-signal/10 px-2 py-0.5 text-[11px] font-semibold text-signal hover:bg-signal/20"
          >
            {d}
          </Link>
        ))}
      </div>
    </div>
  )
}
