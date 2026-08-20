import { useState } from 'react'
import { Minus, Plus, ChevronDown } from 'lucide-react'
import { Card } from './ui'
import {
  dealEvenly,
  dutiesForCut,
  isReleased,
  setCutCount,
  setCutReleased,
  unassigned,
  type ShiftPlan,
} from '../lib/shiftcuts'
import { shiftPerson } from '../lib/daycode'
import { NamePicker } from './NamePicker'

export interface Duty {
  id: string
  task: string
  section: string
}

/**
 * Dealing tonight's side work.
 *
 * Pick a cut, then tap duties to give them to it — tap again to take one back.
 * Chosen over dragging because this is done on a tablet, usually standing up,
 * and dealing fifteen duties by drag is fifteen chances to drop one on the
 * wrong pile.
 *
 * The sheet arrives already dealt into even blocks, so the closer starts from a
 * working split and moves the handful that need moving. That is a starting
 * point and not a decision — which duties belong to which cut depends on who is
 * working and how the night went, and the app doesn't pretend to know.
 */
export function CutPlanner({
  plan,
  setPlan,
  duties,
  crew,
  done,
}: {
  plan: ShiftPlan
  setPlan: (next: ShiftPlan) => void
  duties: Duty[]
  crew: string[]
  done: Record<string, boolean>
}) {
  const [active, setActive] = useState(1)
  // Cuts opened alongside the active one, for moving work across. The active
  // cut is always open; this is the "and also show me that one" set.
  const [opened, setOpened] = useState<Set<number>>(new Set())
  const ids = duties.map((d) => d.id)
  const pool = unassigned(plan, ids)
  const byId = new Map(duties.map((d) => [d.id, d]))

  // Tap a duty on the selected cut and it goes back to the pool; tap one
  // anywhere else -- pool or another cut -- and it moves here. One tap to move
  // work between cuts, which is what rebalancing a night actually is.
  const deal = (id: string) =>
    setPlan({
      ...plan,
      assign:
        plan.assign[id] === active
          ? Object.fromEntries(Object.entries(plan.assign).filter(([k]) => k !== id))
          : { ...plan.assign, [id]: active },
    })

  const cuts = Array.from({ length: plan.cuts }, (_, i) => i + 1)
  /**
   * Who's closing, picked by name.
   *
   * The old way was a cut COUNT on a stepper and then one dropdown per cut --
   * six fiddly interactions with identical native selects, on a tablet, usually
   * standing up. And every dropdown offered the whole roster including people
   * already on a cut, so double-assigning someone was a slip away.
   *
   * A closer doesn't think "I need five cuts". They think "Dana, Marcus, Vic,
   * Sam and Tasha are closing". So that's the control: tap the names. Tap order
   * IS cut order, because the first one you name is the first one you cut.
   *
   * Once anyone is named, the number of cuts IS the number of people named --
   * naming five and getting nine cuts (four empty ones left over from the
   * default, plus five) is not what anybody meant.
   *
   * Work follows the PERSON, not the cut number. Take someone out of the middle
   * and everyone behind them moves up a cut, but each of them keeps the duties
   * they were given; only the person leaving hands theirs back to the pool.
   * Renumbering by position instead would silently shuffle four people's work
   * because a fifth went home.
   */
  const onCut = cuts.map((c) => plan.people[c]).filter(Boolean)
  const togglePerson = (name: string) => {
    // EVERY cut they're on, not the first.
    //
    // The dropdowns this replaced let the same person be put on two cuts, and
    // plenty of saved plans have that in them. Removing only the first left the
    // chip still lit — it reads as a button that won't turn off — and quietly
    // dropped a cut on every tap, which is what made the last rows behave
    // strangely. One tap takes them off the close entirely.
    const mine = cuts.filter((c) => plan.people[c] === name)

    // ---- naming someone ---------------------------------------------------
    // The sheet opens with cuts already dealt and nobody on them. Naming
    // someone fills the first of those, so the even deal survives; only once
    // they're all taken does a new cut get added. Setting the count to "how
    // many are named" instead collapsed the whole thing to one cut on the
    // first tap and dumped three quarters of the duties back in the pool.
    if (mine.length === 0) {
      const empty = cuts.find((c) => !plan.people[c])
      const to = empty ?? plan.cuts + 1
      setPlan({ ...plan, cuts: Math.max(plan.cuts, to), people: { ...plan.people, [to]: name } })
      setActive(to)
      return
    }

    // ---- taking someone off ------------------------------------------------
    // Everyone behind them moves up and keeps the duties they were given; only
    // the leaver's work goes back to the pool.
    const kept = cuts.filter((c) => !mine.includes(c))
    const renumbered = new Map(kept.map((c, i) => [c, i + 1]))

    const people: Record<number, string> = {}
    for (const c of kept) {
      const who = plan.people[c]
      const to = renumbered.get(c)
      if (who && to) people[to] = who
    }
    const assign: Record<string, number> = {}
    for (const [id, c] of Object.entries(plan.assign)) {
      const to = renumbered.get(c)
      if (to) assign[id] = to // no new home = back to the pool
    }
    const cutAt: Record<number, { at: string; by: string }> = {}
    for (const [c, rec] of Object.entries(plan.cutAt ?? {})) {
      const to = renumbered.get(Number(c))
      if (to) cutAt[to] = rec
    }
    const count = Math.max(1, kept.length)
    setPlan({ cuts: count, people, assign, cutAt })
    setActive((a) => Math.min(a, count))
  }

  // Load bars are relative to the busiest cut, so the comparison is between
  // tonight's cuts rather than against some fixed idea of a full load.
  const heaviest = Math.max(1, ...cuts.map((c) => dutiesForCut(plan, c, ids).length))

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-2.5">
        <span className="font-display text-sm font-semibold text-ink">Tonight's cuts</span>
        <span className="text-xs text-muted">
          {pool.length > 0 ? `${pool.length} of ${duties.length} still to deal` : `${duties.length} duties dealt`}
        </span>
        {/* Changing the cut count doesn't re-spread on its own -- a closer who
            has already moved things would lose that. One tap when they do want
            it back to an even split. */}
        <button
          onClick={() => setPlan(dealEvenly(plan, ids))}
          className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-bold text-muted hover:border-brand/40 hover:text-brand-600"
        >
          Deal evenly
        </button>
        {/* The full override: throw the deal away and hand it out by hand. */}
        <button
          onClick={() => setPlan({ ...plan, assign: {} })}
          className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-bold text-muted hover:border-down/40 hover:text-down"
        >
          Clear
        </button>
        <span className="ml-auto flex items-center gap-1 rounded-lg border border-black/10 bg-white p-0.5">
          <button
            onClick={() => setPlan(setCutCount(plan, plan.cuts - 1))}
            aria-label="One fewer cut"
            title="Add or remove a cut without naming anyone"
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
          >
            <Minus size={13} />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs font-bold text-ink">
            {plan.cuts} {plan.cuts === 1 ? 'cut' : 'cuts'}
          </span>
          <button
            onClick={() => setPlan(setCutCount(plan, plan.cuts + 1))}
            aria-label="One more cut"
            title="Add or remove a cut without naming anyone"
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
          >
            <Plus size={13} />
          </button>
        </span>
      </div>

      {/* Staffing the close: tap the names. */}
      {crew.length > 0 && (
        <div className="border-b border-black/5 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted">
              Who&rsquo;s closing?
            </span>
            <span className="text-[11px] text-muted/70">
              {onCut.length === 0
                ? 'tap a name — first one tapped is cut 1'
                : `${onCut.join(' → ')}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {crew.map((name) => {
              const at = cuts.find((c) => plan.people[c] === name)
              return (
                <button
                  key={name}
                  onClick={() => togglePerson(name)}
                  aria-pressed={!!at}
                  title={at ? `On cut ${at} — tap to take them off` : 'Tap to put them on the next cut'}
                  // Sized for a thumb on a tablet, because that is what this is
                  // used on and the dropdowns it replaces were not.
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                    at
                      ? 'bg-brand text-white'
                      : 'border border-black/10 bg-white text-muted hover:border-brand/50 hover:text-ink'
                  }`}
                >
                  {at && (
                    <span className="grid size-4 place-items-center rounded-full bg-white/25 text-[10px] font-extrabold">
                      {at}
                    </span>
                  )}
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* One card per cut: who's on it, how much they're carrying, and their
          duties when it's open.
          Every cut used to sit open at once so a closer could see who was
          overloaded -- but on a four-cut close that's thirty-odd lines of duty
          text on screen together, and it read as a wall rather than a plan. The
          load bar carries that same comparison in a glance, so only the cut
          being dealt to needs its duties open. Any other can be opened
          alongside it to move work across. */}
      <div className="space-y-2 p-3">
        {pool.length > 0 && (
          <>
            <div className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Not dealt yet · {pool.length}
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {pool.map((id) => (
                <button
                  key={id}
                  onClick={() => deal(id)}
                  title={`Give to cut ${active}`}
                  className="rounded-lg border border-dashed border-black/25 bg-white px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:border-brand hover:bg-brand/5"
                >
                  {byId.get(id)?.task}
                </button>
              ))}
            </div>
          </>
        )}

        {cuts.map((c) => {
          const mine = dutiesForCut(plan, c, ids)
          const open = c === active || opened.has(c)
          const doneN = mine.filter((id) => done[id]).length
          return (
            <div
              key={c}
              className={`overflow-hidden rounded-xl border transition-colors ${
                c === active ? 'border-brand/50 bg-brand/[0.04]' : 'border-black/10 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 p-2.5">
                <button
                  onClick={() => setActive(c)}
                  title={c === active ? 'Duties you tap land here' : 'Deal to this cut'}
                  className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider ${
                    c === active ? 'bg-brand text-white' : 'bg-black/5 text-muted hover:text-ink'
                  }`}
                >
                  Cut {c}
                </button>

                {/* Who's on it, set right here. It used to be one dropdown
                    above the board that re-pointed as you switched cuts, so
                    staffing four cuts was four round trips through the same
                    control -- and which cut you were naming was off-screen. */}
                <NamePicker
                  value={plan.people[c] ?? ''}
                  options={crew}
                  taken={onCut}
                  placeholder={`Who's on cut ${c}?`}
                  onChange={(name) => {
                    const people = { ...plan.people }
                    if (name) people[c] = name
                    else delete people[c]
                    setPlan({ ...plan, people })
                  }}
                />

                {/* Load at a glance -- this is what replaces having every cut's
                    duties on screen together. Widths are relative to the
                    heaviest cut, so an uneven deal is obvious without counting. */}
                <span className="flex shrink-0 items-center gap-1.5" title={`${mine.length} duties`}>
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10">
                    <span
                      className={`block h-full rounded-full ${c === active ? 'bg-brand' : 'bg-ink/30'}`}
                      style={{ width: `${heaviest ? (mine.length / heaviest) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-9 text-right text-[11px] font-bold text-muted">
                    {doneN > 0 ? `${doneN}/${mine.length}` : mine.length}
                  </span>
                </span>

                {/* Being dealt a list isn't being cut. Until this is pressed
                    the server is still on section and sees nothing. */}
                {plan.people[c] &&
                  (isReleased(plan, c) ? (
                    <button
                      onClick={() => setPlan(setCutReleased(plan, c, false, shiftPerson()))}
                      title={`Cut by ${plan.cutAt?.[c]?.by} at ${new Date(plan.cutAt![c].at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — tap to put them back on the floor`}
                      className="shrink-0 rounded-full bg-up/15 px-2 py-0.5 text-[10px] font-extrabold uppercase text-up"
                    >
                      cut {new Date(plan.cutAt![c].at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </button>
                  ) : (
                    <button
                      onClick={() => setPlan(setCutReleased(plan, c, true, shiftPerson()))}
                      title={`Cut ${plan.people[c]} — releases their sidework to them`}
                      className="shrink-0 rounded-full border border-brand/40 px-2 py-0.5 text-[10px] font-extrabold uppercase text-brand-600 hover:bg-brand/10"
                    >
                      cut them
                    </button>
                  ))}

                <button
                  onClick={() =>
                    setOpened((s) => {
                      const n = new Set(s)
                      if (n.has(c)) n.delete(c)
                      else n.add(c)
                      return n
                    })
                  }
                  aria-label={open ? `Hide cut ${c}'s duties` : `Show cut ${c}'s duties`}
                  aria-expanded={open}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
                >
                  <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {open && (
                <div className="border-t border-black/5 px-2.5 pb-2.5 pt-2">
                  {mine.length === 0 ? (
                    // Naming a fifth person after the sheet was dealt four ways
                    // leaves them empty with nothing in the pool to take -- so
                    // don't point at a pool that isn't there, offer the re-deal.
                    <p className="flex flex-wrap items-center gap-1.5 px-1 py-1 text-xs text-muted">
                      {pool.length > 0 ? (
                        'Tap duties from the pool above to deal them here.'
                      ) : (
                        <>
                          Nothing dealt to {plan.people[c] || `cut ${c}`} yet — everything is on the other cuts.
                          <button
                            onClick={() => setPlan(dealEvenly(plan, ids))}
                            className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-bold text-white"
                          >
                            Re-deal evenly
                          </button>
                          <span>or take some from another cut.</span>
                        </>
                      )}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {mine.map((id) => (
                        <button
                          key={id}
                          onClick={() => deal(id)}
                          title={c === active ? 'Tap to put it back in the pool' : `Move to cut ${active}`}
                          className={`rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] ${
                            done[id]
                              ? 'border-up/40 bg-up/10 text-up line-through'
                              : c === active
                                ? 'border-brand/50 bg-brand/15 text-ink'
                                : 'border-black/10 bg-white text-ink hover:border-brand/50'
                          }`}
                        >
                          {byId.get(id)?.task}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
