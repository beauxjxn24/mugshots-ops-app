// Tonight's cuts.
//
// The duty sheet says what side work exists. It cannot say who does it, because
// that depends on how many people walked in: four servers one night, seven the
// next. Welding duties to a fixed "Section 1" only works if staffing is fixed,
// and it isn't — so the sheet is the library, and this is the deal.
//
// Per day, per role and phase: how many cuts there are, who has each one, and
// which duties were dealt to it. Nothing is assigned by default — the closer
// deals them out, because who gets what depends on who is working and what the
// night looked like.

/** A duty's stable id — the same key the check-offs already use. */
export const dutyId = (role: string, phase: string, section: string, task: string): string =>
  `${role}|${phase}|${section}|${task}`

export interface ShiftPlan {
  /** How many cuts are working this shift. */
  cuts: number
  /** Cut number (1-based) → the person on it. */
  people: Record<number, string>
  /** Duty id → the cut it was dealt to. Absent means still in the pool. */
  assign: Record<string, number>
  /**
   * When each cut was actually cut, and by whom.
   *
   * Being dealt a list is not the same as being released from the floor. A
   * server given cut 3 at four o'clock is still on section until the closer
   * cuts them, and showing them their sidework before that invites it being
   * started early — which is how a section goes unwatched at seven.
   *
   * Absent means still on the floor.
   */
  cutAt?: Record<number, { at: string; by: string }>
}

export const emptyPlan = (cuts = 4): ShiftPlan => ({ cuts, people: {}, assign: {}, cutAt: {} })

/** Release a cut to their sidework, or put them back on the floor. */
export function setCutReleased(
  plan: ShiftPlan,
  cut: number,
  released: boolean,
  by: string,
): ShiftPlan {
  const cutAt = { ...(plan.cutAt ?? {}) }
  if (released) cutAt[cut] = { at: new Date().toISOString(), by: by || 'manager' }
  else delete cutAt[cut]
  return { ...plan, cutAt }
}

/** Has this cut been released from the floor? */
export const isReleased = (plan: ShiftPlan, cut: number): boolean => !!plan.cutAt?.[cut]

export const planKey = (date: string): string => `sidework:cuts:${date}`

/** The duties dealt to one cut, in the sheet's own order. */
export function dutiesForCut(plan: ShiftPlan, cut: number, all: string[]): string[] {
  return all.filter((id) => plan.assign[id] === cut)
}

/** Duties nobody has been given yet. */
export function unassigned(plan: ShiftPlan, all: string[]): string[] {
  return all.filter((id) => plan.assign[id] == null)
}

/** Which cut a person is on, or 0 if they aren't on one. */
export function cutFor(plan: ShiftPlan, person: string): number {
  if (!person) return 0
  const hit = Object.entries(plan.people).find(
    ([, who]) => who.toLowerCase() === person.toLowerCase(),
  )
  return hit ? Number(hit[0]) : 0
}

/**
 * Drop a cut, returning its duties to the pool.
 *
 * Reducing the count must not strand work: if cut 5 goes away and its duties
 * stayed pinned to it, they would vanish off every screen while still needing
 * doing. They go back in the pool for the closer to re-deal.
 */
export function setCutCount(plan: ShiftPlan, cuts: number): ShiftPlan {
  const n = Math.max(1, Math.min(12, cuts))
  if (n >= plan.cuts) return { ...plan, cuts: n }
  const assign: Record<string, number> = {}
  for (const [id, c] of Object.entries(plan.assign)) if (c <= n) assign[id] = c
  const people: Record<number, string> = {}
  for (const [c, who] of Object.entries(plan.people)) if (Number(c) <= n) people[Number(c)] = who
  const cutAt: Record<number, { at: string; by: string }> = {}
  for (const [c, rec] of Object.entries(plan.cutAt ?? {})) if (Number(c) <= n) cutAt[Number(c)] = rec
  return { cuts: n, people, assign, cutAt }
}

/**
 * Spread every duty across the cuts, in the sheet's own order.
 *
 * Contiguous blocks rather than round-robin: duties sitting next to each other
 * on the sheet tend to be the same part of the room, and handing one person
 * every third line scatters them across the building. Remainders go to the
 * earlier cuts, which are usually the ones staying latest.
 *
 * This is a starting point, not an answer — the closer moves things afterwards,
 * which is the whole reason the duties aren't welded to a section any more.
 */
export function dealEvenly(plan: ShiftPlan, all: string[]): ShiftPlan {
  const cuts = Math.max(1, plan.cuts)
  const per = Math.floor(all.length / cuts)
  const extra = all.length % cuts
  const assign: Record<string, number> = {}
  let i = 0
  for (let c = 1; c <= cuts; c++) {
    const take = per + (c <= extra ? 1 : 0)
    for (let n = 0; n < take && i < all.length; n++, i++) assign[all[i]] = c
  }
  return { ...plan, assign }
}
