import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { SPECS } from '../lib/specs'
import { buildPhoto } from '../lib/linebuilds'
import { buildForSpec } from '../lib/buildmatch'
import { BuildReconcile } from '../components/BuildReconcile'
import { LineBuildCard } from '../components/LineBuildCard'
import { UsedIn } from '../components/UsedIn'
import { dishPhoto } from '../lib/photos'
import { isFood } from '../lib/categories'
import { usePersistentState } from '../lib/store'
import type { Spec } from '../lib/types'

const OLDIES = 'Oldies'
// Food only — drinks live in the Signature Drinks section.
const FOOD_SPECS = SPECS.filter(isFood)
const foodGroups = ['All', ...[...new Set(FOOD_SPECS.map((s) => s.g))]]

export function Specs() {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string>('All')
  const [openName, setOpenName] = useState<string | null>(null)
  // Archived recipes (soft-deleted) live here by name, persisted to the device.
  const [archived, setArchived] = usePersistentState<string[]>('recipes:archived', [])

  const gs = foodGroups
  const archivedSet = useMemo(() => new Set(archived), [archived])
  const viewingOldies = group === OLDIES

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const base = viewingOldies
      ? FOOD_SPECS.filter((s) => archivedSet.has(s.name))
      : FOOD_SPECS.filter((s) => !archivedSet.has(s.name))
    return base.filter((s) => {
      if (!viewingOldies && group !== 'All' && s.g !== group) return false
      if (!query) return true
      if (s.name.toLowerCase().includes(query)) return true
      if (s.ing.some(([n]) => n.toLowerCase().includes(query))) return true
      // A build's own lines are searchable too — "comeback" should find every
      // dish it goes on, not just the prep card.
      const b = buildForSpec(s.name)
      return !!b?.sections.some((sec) => sec.lines.some((l) => l.toLowerCase().includes(query)))
    })
  }, [q, group, viewingOldies, archivedSet])

  const archive = (name: string) => setArchived((a) => [...new Set([...a, name])])
  const restore = (name: string) => setArchived((a) => a.filter((n) => n !== name))

  return (
    <>
      <PageHeader
        title="Specs & Recipes"
        subtitle={
          viewingOldies
            ? `${archived.length} archived — restore anytime`
            : `${FOOD_SPECS.length - archived.filter((n) => FOOD_SPECS.some((s) => s.name === n)).length} active builds & prep cards`
        }
        right={
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search builds or ingredients…"
            className="w-full max-w-xs"
          />
        }
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {/* A new sheet whose dish name is close to one already on the menu asks
            before it lands, rather than guessing which card it belongs to. */}
        <div className="mb-5">
          <BuildReconcile />
        </div>
        {/* Category chips */}
        <div className="mb-5 flex flex-wrap gap-2">
          {gs.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                group === g
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {g}
            </button>
          ))}
          <button
            onClick={() => setGroup(OLDIES)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewingOldies
                ? 'border-navy bg-navy text-white'
                : 'border-dashed border-black/25 bg-white text-muted hover:border-navy/40'
            }`}
          >
            <Archive size={13} />
            {OLDIES}
            {archived.length > 0 && ` · ${archived.length}`}
          </button>
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted">
            {viewingOldies ? 'No archived recipes yet.' : `No builds match “${q}”.`}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <SpecCard
              key={s.name}
              spec={s}
              archived={viewingOldies}
              open={openName === s.name}
              onToggle={() => setOpenName(openName === s.name ? null : s.name)}
              onArchive={() => archive(s.name)}
              onRestore={() => restore(s.name)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function SpecCard({
  spec,
  archived,
  open,
  onToggle,
  onArchive,
  onRestore,
}: {
  spec: Spec
  archived: boolean
  open: boolean
  onToggle: () => void
  onArchive: () => void
  onRestore: () => void
}) {
  const build = buildForSpec(spec.name)
  // A sheet may name a dish "Texan" where the app calls it "Texan Burger",
  // so the photo can be filed under the sheet's name rather than the spec's.
  const thumb = dishPhoto(spec.name) ?? (build ? buildPhoto(build) : undefined)
  return (
    <Card className={`overflow-hidden ${archived ? 'opacity-75' : ''}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        {thumb && (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="size-14 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold text-ink">{spec.name}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
            {spec.storage && <Chip>{spec.storage}</Chip>}
            {spec.shelf && <Chip>{spec.shelf}</Chip>}
            {spec.yields && <Chip>{spec.yields}</Chip>}
            {build && <Chip>line build</Chip>}
          </div>
        </div>
        <span className={`mt-1 text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-black/5 p-4 pt-3">
          {/* Where the kitchen's line-build sheet covers this dish, IT is the
              ingredient list — showing both would put two portion lists on one
              card and invite a cook to follow the wrong one. */}
          {build ? (
            <div className="-mx-4 -mt-3 mb-3">
              <LineBuildCard build={build} compact />
            </div>
          ) : spec.ing.length > 0 ? (
            <>
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                Ingredients
              </div>
              <ul className="mb-3 space-y-1">
                {spec.ing.map(([n, qty], i) => (
                  <li key={i} className="flex justify-between gap-3 text-sm">
                    <span className="text-ink">{n}</span>
                    <span className="font-mono text-xs text-muted">{qty}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {spec.steps.length > 0 && (
            <>
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                Method
              </div>
              <ol className="list-decimal space-y-1 pl-4 text-sm text-ink/90">
                {spec.steps.map((st, i) => (
                  <li key={i}>{st}</li>
                ))}
              </ol>
            </>
          )}
          {/* A prep card's other half: not what goes in it, but what it goes
              into. Read straight off the line builds, so it can never drift. */}
          <UsedIn name={spec.name} className="mt-3 border-t border-black/5 pt-3" />
          <div className="mt-3 border-t border-black/5 pt-3">
            {archived ? (
              <button
                onClick={onRestore}
                className="inline-flex items-center gap-1.5 rounded-lg bg-up px-3 py-1.5 text-xs font-semibold text-white"
              >
                <ArchiveRestore size={13} /> Restore to menu
              </button>
            ) : (
              <button
                onClick={onArchive}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-muted hover:border-down/40 hover:text-down"
              >
                <Archive size={13} /> Move to Oldies
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-black/5 px-1.5 py-0.5">{children}</span>
}
