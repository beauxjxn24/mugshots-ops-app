import { useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, UtensilsCrossed, LayoutGrid, Rows3, Printer } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { useSearchParams } from 'react-router-dom'
import { SearchInput } from '../components/SearchInput'
import { SPECS, OG_SPECS, GROUP_ORDER, slug } from '../lib/specs'
import { buildPhoto } from '../lib/linebuilds'
import { buildForSpec } from '../lib/buildmatch'
import { BuildReconcile } from '../components/BuildReconcile'
import { LineBuildCard } from '../components/LineBuildCard'
import { UsedIn } from '../components/UsedIn'
import { dishPhoto } from '../lib/photos'
import { isFood } from '../lib/categories'
import { useArchived } from '../lib/archived'
import { usePersistentState } from '../lib/store'
import { BoardCard } from '../components/BoardCard'
import type { Spec } from '../lib/types'

const OLDIES = 'Oldies'
const OG = 'OG'
// Food only — drinks live in the Signature Drinks section.
const FOOD_SPECS = SPECS.filter(isFood)

/**
 * The categories, in menu order.
 *
 * They used to come out in whatever order specs.json happened to be written in,
 * which is why Kids landed between Sandwiches and Pasta. GROUP_ORDER is the
 * order the menu reads in; anything new that isn't on that list goes on the end
 * rather than disappearing.
 */
const FOOD_GROUPS = (() => {
  const present = new Set(FOOD_SPECS.map((s) => s.g))
  const known = GROUP_ORDER.filter((g) => present.has(g))
  const extras = [...present].filter((g) => !GROUP_ORDER.includes(g))
  return [...known, ...extras]
})()

const groupAnchor = (g: string): string => `grp-${slug(g)}`

/**
 * Chip and jump-bar wording.
 *
 * Every category on this page is a build, so eleven chips all ending in
 * "Builds" spend their width saying the same word. The section headings keep
 * the full name; the chips say the part that differs.
 */
const shortGroup = (g: string): string => (g === 'Prep' ? 'Prep' : g.replace(/ Builds$/, ''))

export function Specs() {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string>('All')
  const [openName, setOpenName] = useState<string | null>(null)
  // Archived recipes (soft-deleted). Shared with Line Builds now — that screen
  // renders these same specs, so a card pulled here has to leave the line's
  // board too, not just this list.
  const { archived, setArchived, archivedSet } = useArchived()
  const viewingOldies = group === OLDIES
  const viewingOG = group === OG

  // Which reading of the cards is on. Remembered per device, because whichever
  // one you work from you work from every day — a cook lives on the board, a
  // manager writing specs lives on the cards.
  const [view, setView] = usePersistentState<'cards' | 'board'>('specs:view', 'cards')
  // Prep cards have no build to put on a board — they're a recipe and a shelf
  // life, not a plate — so Board shows the build groups only.
  const board = view === 'board'
  // Declared ABOVE filtered on purpose: that useMemo reads `board`, and its
  // callback runs during render, so a const declared below it throws "cannot
  // access before initialization". TypeScript passes it — the read is inside a
  // closure, which looks deferred to the compiler.


  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const base = viewingOG
      ? FOOD_SPECS.filter((s) => s.og)
      : viewingOldies
        ? FOOD_SPECS.filter((s) => archivedSet.has(s.name) && !s.og)
        : FOOD_SPECS.filter((s) => !archivedSet.has(s.name))
    return base.filter((s) => {
      // The board is the line's plating reference, so prep cards are out: a
      // shelf life and a yield aren't a build, and they'd print as cards with
      // one ingredient on them.
      if (board && !s.g.endsWith('Builds')) return false
      if (!viewingOldies && !viewingOG && group !== 'All' && s.g !== group) return false
      if (!query) return true
      if (s.name.toLowerCase().includes(query)) return true
      if (s.ing.some(([n]) => n.toLowerCase().includes(query))) return true
      // A build's own lines are searchable too — "comeback" should find every
      // dish it goes on, not just the prep card.
      const b = buildForSpec(s.name)
      return !!b?.sections.some((sec) => sec.lines.some((l) => l.toLowerCase().includes(query)))
    })
  }, [q, group, viewingOldies, viewingOG, archivedSet, board])

  /**
   * The results, cut into their categories.
   *
   * A hundred and twenty cards in one flat grid is the reason this page felt
   * like scrolling with no direction: nothing on screen ever told you where you
   * were or how much was left. Sectioned and headed, the same list reads as a
   * menu — and the jump bar above turns "scroll until you see it" into one tap.
   */
  const sections = useMemo(() => {
    const by = new Map<string, Spec[]>()
    for (const s of filtered) {
      const list = by.get(s.g)
      if (list) list.push(s)
      else by.set(s.g, [s])
    }
    const order = [...FOOD_GROUPS, ...[...by.keys()].filter((g) => !FOOD_GROUPS.includes(g))]
    return order.filter((g) => by.has(g)).map((g) => ({ group: g, items: by.get(g)! }))
  }, [filtered])

  // Counts drive the chips, so a category that's empty under the current search
  // says so instead of looking like a dead button.
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const s of filtered) c.set(s.g, (c.get(s.g) ?? 0) + 1)
    return c
  }, [filtered])

  const jumpTo = (g: string) =>
    document.getElementById(groupAnchor(g))?.scrollIntoView({ block: 'start', behavior: 'smooth' })

  const archive = (name: string) => setArchived((a) => [...new Set([...a, name])])
  const restore = (name: string) => setArchived((a) => a.filter((n) => n !== name))

  // Arriving from a ?open= link — the prep sheet, or a "used in" chip. These
  // links have been generated for a while and did nothing on landing: the page
  // opened with every card closed and no hint which one you had asked for.
  // Clear the group filter too, or a card outside the current tab stays hidden.
  const [params, setParams] = useSearchParams()
  const wanted = params.get('open')
  // /builds redirects here as ?view=board, so links and bookmarks to the old
  // page still land on the board rather than the cards.
  const wantedView = params.get('view')
  useEffect(() => {
    if (wantedView !== 'board' && wantedView !== 'cards') return
    setView(wantedView)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedView])
  /**
   * The card a ?open= link asked for.
   *
   * DERIVED from the URL rather than copied into state by an effect. The
   * effect version opened the card and cleared the param in the same pass,
   * which meant the first link followed after a cold load opened for about
   * half a second and then closed itself: this page mounts twice on boot, and
   * the second mount started from fresh state with the param already gone.
   *
   * Held this way the URL stays the answer until the reader does something,
   * so it survives any number of mounts. Closing the card is what clears it.
   */
  const wantedHit = useMemo(
    () => (wanted ? FOOD_SPECS.find((s) => s.name.toLowerCase() === wanted.toLowerCase()) : undefined),
    [wanted],
  )
  const openCard = openName ?? wantedHit?.name ?? null
  const toggleCard = (name: string) => {
    setOpenName(openCard === name ? null : name)
    // Once the reader has taken over, the link has done its job — drop it so a
    // refresh doesn't reopen what they just closed.
    if (wanted) setParams({}, { replace: true })
  }
  // A card outside the current tab would stay hidden, so a link resets the
  // filters. Only when one is actually being asked for.
  useEffect(() => {
    if (!wantedHit) return
    setGroup('All')
    setQ('')
    requestAnimationFrame(() =>
      document.getElementById(`spec-${slug(wantedHit.name)}`)?.scrollIntoView({ block: 'center' }),
    )
  }, [wantedHit])

  return (
    <>
      <PageHeader
        title="Specs & Recipes"
        subtitle={
          viewingOG
            ? `${OG_SPECS.length} OG builds — off the menu, still made on request`
            : viewingOldies
            ? `${archivedSet.size - OG_SPECS.length} retired — off the menu and not coming back`
            : `${FOOD_SPECS.length - archivedSet.size} active builds & prep cards`
        }
        right={
          <div className="flex w-full items-center gap-2">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search builds or ingredients…"
              className="w-full max-w-xs"
            />
            {/* Cards ⇄ Board. Board used to be its own page over the same
                cards; it's a way of looking at this list, not a second list. */}
            <div className="flex shrink-0 items-center rounded-lg border border-black/10 bg-white p-0.5">
              {([
                ['cards', 'Cards', LayoutGrid],
                ['board', 'Board', Rows3],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  aria-pressed={view === id}
                  title={id === 'board' ? 'Printable line board — builds only' : 'Full cards with prep and method'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    view === id ? 'bg-brand text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            {board && (
              <button
                onClick={() => window.print()}
                aria-label="Print the board"
                title="Print the board"
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-black/10 bg-white text-ink"
              >
                <Printer size={15} />
              </button>
            )}
          </div>
        }
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {/* A new sheet whose dish name is close to one already on the menu asks
            before it lands, rather than guessing which card it belongs to. */}
        <div className="mb-5">
          <BuildReconcile />
        </div>
        {/* Category chips — in menu order, each carrying its count so you can
            see how big a category is before you open it. */}
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setGroup('All')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              group === 'All'
                ? 'border-brand bg-brand text-white'
                : 'border-black/10 bg-white text-muted hover:border-brand/40'
            }`}
          >
            Everything
          </button>
          {FOOD_GROUPS.map((g) => {
            const n = counts.get(g) ?? 0
            return (
              <button
                key={g}
                onClick={() => setGroup(g)}
                disabled={n === 0 && group !== g}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  group === g
                    ? 'border-brand bg-brand text-white'
                    : n === 0
                      ? 'border-black/5 bg-white text-muted/40'
                      : 'border-black/10 bg-white text-muted hover:border-brand/40'
                }`}
              >
                {shortGroup(g)}
                <span className={group === g ? 'ml-1.5 text-white/60' : 'ml-1.5 text-muted/60'}>{n}</span>
              </button>
            )
          })}
          <button
            onClick={() => setGroup(OG)}
            title="Off the menu, still made on request"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewingOG
                ? 'border-brand bg-brand text-white'
                : 'border-dashed border-brand/40 bg-white text-brand-600 hover:border-brand'
            }`}
          >
            <UtensilsCrossed size={13} />
            {OG}
            {OG_SPECS.length > 0 && ` · ${OG_SPECS.length}`}
          </button>
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
            {archivedSet.size - OG_SPECS.length > 0 && ` · ${archivedSet.size - OG_SPECS.length}`}
          </button>
        </div>

        {/* Jump bar. The whole complaint about this page was scrolling without
            direction; this is the direction. Only earns its space when there is
            more than one section to jump between. */}
        {sections.length > 1 && (
          <div className="sticky top-0 z-20 -mx-4 mb-4 flex gap-1.5 overflow-x-auto border-b border-white/10 bg-cream/85 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <span className="shrink-0 self-center pr-1 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Jump
            </span>
            {sections.map(({ group: g, items }) => (
              <button
                key={g}
                onClick={() => jumpTo(g)}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-muted hover:bg-brand/10 hover:text-brand-600"
              >
                {shortGroup(g)} <span className="text-muted/50">{items.length}</span>
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-sm text-muted">
            {viewingOG
              ? 'Nothing on the OG list yet.'
              : viewingOldies
                ? 'Nothing retired yet.'
                : `No builds match “${q}”.`}
          </p>
        )}

        <div className="space-y-7">
          {sections.map(({ group: g, items }) => (
            <section key={g} id={groupAnchor(g)} className="scroll-mt-16">
              <h2 className="mb-2.5 flex items-baseline gap-2 border-b border-black/5 pb-1.5 print:border-black/30">
                <span className="font-display text-sm font-semibold text-ink">{g}</span>
                <span className="text-xs text-muted">{items.length}</span>
              </h2>
              {/* Two readings of the same cards. Cards is the one you study —
                  prep, method, what it's used in, archiving. Board is the one
                  that goes up by the window: photo, name, ingredients in build
                  order, printable three to a row. These were separate pages
                  over the same specs.json until now, which is how a pulled item
                  could vanish from one and keep printing on the other. */}
              <div
                className={
                  board
                    ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2'
                    : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
                }
              >
                {items.map((s) =>
                  board ? (
                    <BoardCard
                      key={s.name}
                      spec={s}
                      onPark={viewingOldies ? undefined : () => archive(s.name)}
                    />
                  ) : (
                    <SpecCard
                      key={s.name}
                      anchor={`spec-${slug(s.name)}`}
                      spec={s}
                      archived={viewingOldies}
                      open={openCard === s.name}
                      onToggle={() => toggleCard(s.name)}
                      onArchive={() => archive(s.name)}
                      onRestore={() => restore(s.name)}
                    />
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}

function SpecCard({
  spec,
  anchor,
  archived,
  open,
  onToggle,
  onArchive,
  onRestore,
}: {
  spec: Spec
  anchor: string
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
  // scroll-mt keeps a card arrived at from a ?open= link clear of the sticky
  // jump bar instead of landing underneath it.
  return (
    <Card id={anchor} className={`scroll-mt-28 overflow-hidden ${archived ? 'opacity-75' : ''}`}>
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
          {/* Why it left — "gone" and "moved to the OG menu" are different
              facts, and the kitchen asks which one. */}
          {spec.off && (
            <div className={`mt-0.5 text-[11px] font-semibold ${spec.og ? 'text-brand-600' : 'text-down'}`}>
              {spec.off}
            </div>
          )}
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
