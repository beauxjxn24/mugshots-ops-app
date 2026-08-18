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
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
          >
            <Minus size={13} />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs font-bold text-ink">
            {plan.cuts} cuts
          </span>
          <button
            onClick={() => setPlan(setCutCount(plan, plan.cuts + 1))}
            aria-label="One more cut"
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
          >
            <Plus size={13} />
          </button>
        </span>
      </div>

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
                <select
                  value={plan.people[c] ?? ''}
                  onChange={(e) => {
                    const people = { ...plan.people }
                    if (e.target.value) people[c] = e.target.value
                    else delete people[c]
                    setPlan({ ...plan, people })
                  }}
                  className={`min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm font-semibold outline-none focus:border-brand ${
                    plan.people[c] ? 'border-black/10 bg-white text-ink' : 'border-dashed border-black/25 bg-transparent text-muted'
                  }`}
                >
                  <option value="">— nobody yet —</option>
                  {crew.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  {plan.people[c] && !crew.includes(plan.people[c]) && (
                    <option value={plan.people[c]}>{plan.people[c]}</option>
                  )}
                </select>

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
                      n.has(c) ? n.delete(c) : n.add(c)
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
                    <p className="px-1 py-1 text-xs text-muted">
                      {c === active ? 'Tap duties from the pool above to deal them here.' : 'Nothing yet.'}
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
