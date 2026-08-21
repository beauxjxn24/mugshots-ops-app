// The closers — the two people who actually shut the building down.
//
// A cut is a server being released: they get a share of the sidework sheet and
// go home. A CLOSER is not that. They stay after the cuts have gone, and the
// work they do isn't on the sidework sheet at all — breaking down drink
// stations, the final wipe-downs, the last walk of the building. Dealing them a
// share of the servers' duties, which is what the app did by having no concept
// of them, is simply the wrong job.
//
// There are two, and they cover different halves of the building: front of
// house and back of house, each checking their own side's sidework. So they're
// designated together, once, for the shift — not per role tab, because the
// person closing the front is the same person whether you're looking at the
// Server sheet or the Host one.
//
// "Front" and "back" are about which side of the wall the work is on, NOT about
// who uses it — the BOH closer has the passout, the drink stations and the tea
// urns even though those are the servers' service points. See
// DEFAULT_CLOSER_DUTIES.
//
// A closer may ALSO take a cut on a short night, so nothing here removes them
// from the cut roster. The two roles are separate, not exclusive.
import { load, save } from './store'
import { useScope } from './scope'

export type Side = 'FOH' | 'BOH'
export const SIDES: Side[] = ['FOH', 'BOH']
export const SIDE_LABEL: Record<Side, string> = {
  FOH: 'Front of house',
  BOH: 'Back of house',
}

/** Who's closing each side, per phase (AM Opening / PM Closing / …). */
export type CloserAssignment = Partial<Record<Side, string>>

const key = (date: string): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::sidework:closers:${date}`
}

export const getClosers = (date: string): Record<string, CloserAssignment> => {
  const r = load<Record<string, CloserAssignment>>(key(date), {})
  return r && typeof r === 'object' ? r : {}
}

export function setCloser(date: string, phase: string, side: Side, who: string): void {
  const all = getClosers(date)
  const forPhase = { ...(all[phase] ?? {}) }
  if (who) forPhase[side] = who
  else delete forPhase[side]
  save(key(date), { ...all, [phase]: forPhase })
}

/**
 * The closing duties, per side.
 *
 * ── Where the line actually falls ─────────────────────────────────────────────
 *
 * Not where you'd guess, and this app guessed wrong the first time. The service
 * points the SERVERS use — the server side of the passout, the drink stations,
 * the tea urns — belong to the BOH closer, not the FOH one. The obvious reading
 * is that anything a server touches is front of house; it isn't. Those three sit
 * on the kitchen's side of the wall and the BOH closer breaks them down.
 *
 * Written down here because it's the kind of fact that gets silently "corrected"
 * back to the intuitive version by the next person to read the list.
 *
 * The rest of both lists is still a starting point rather than the store's real
 * sheet — editable in the app and stored per store, because the real one lives
 * on a clipboard and will replace this.
 */
export const DEFAULT_CLOSER_DUTIES: Record<Side, string[]> = {
  FOH: [
    'Final wipe-down — tables, booths, host stand',
    'Sweep and mop the dining room',
    'Check both restrooms one last time',
    'Walk every section — chairs up, nothing left behind',
    'Lock the front doors and set the alarm panel',
  ],
  BOH: [
    // The server-facing half — the BOH closer's, not the FOH closer's.
    // Deliberately uncounted: Flowood has two drink stations, other stores have
    // more, and a store that wants them broken out one per line adds the rows.
    'Break down the server side of the passout',
    'Break down the drink stations',
    'Empty, wash and refill the tea urns',
    // The kitchen itself.
    'Shut down the line — flat top, fryers, hood',
    'Break down and wash the drink machine lines',
    'Final wipe-down — prep tables, reach-in handles, shelving',
    'Sweep and mop the kitchen',
    'Trash out, boxes broken down',
    'Walk-in and reach-ins closed and temping right',
    'Back door locked, lights out',
  ],
}

/**
 * Jobs a closer owns even though the role's sidework sheet still lists them.
 *
 * The clipboard sheet predates the app having any idea of a closer, so the
 * server sheet still hands "break down dining room drink station" to Section 3
 * and "break down bar drink station" to Section 5. Deal one to a cut AND leave
 * it on the closer's list and two people do one job, which is how a tool stops
 * getting used.
 *
 * Flagged, not deleted. The sheet is the store's, and quietly dropping rows out
 * of it isn't the app's call.
 *
 * Note what is NOT here: which side owns each subject. That is read off the
 * store's own closer list at match time, because stores split this differently
 * — Flowood's BOH closer has the drink stations, somewhere else it's the FOH
 * closer, and a store with four stations writes four rows. Baking the side in
 * here would mean the warning contradicting a list a manager had just edited.
 */
export const CLOSER_SUBJECTS: { subject: string; re: RegExp }[] = [
  { subject: 'the passout', re: /\bpass[\s-]?out\b/i },
  { subject: 'the drink stations', re: /\bdrink station/i },
  { subject: 'the tea urns', re: /\btea urn/i },
]

/**
 * Naming the subject isn't enough — it has to be the job of SHUTTING IT DOWN.
 *
 * The AM Closing sheet hands "restock drink station for dining side" to Section
 * 5 and the AM Opening sheet says "set up drink station for dining room".
 * Neither is the closer's; one is a shift-change restock and the other is the
 * morning. Only the breakdown belongs to them.
 *
 * This is the test rather than "is it a closing phase", because "AM Closing"
 * contains the word Closing and is not the close, and because phase names are
 * editable per store — a rename shouldn't quietly switch this off.
 */
const BREAKING_DOWN = /\b(break(?:ing)?[\s-]?down|breakdown|shut(?:ting)?[\s-]?down|shutdown|empty(?:ing)?|wash(?:ing)?)\b/i

/**
 * Does a closer own this sheet duty, and which one?
 *
 * Answered from `duties` — the store's own editable lists — not from a rule in
 * this file. Move the drink stations to the FOH closer and the warning follows
 * you; take them off both lists entirely and it goes quiet, because then the
 * sheet really is where that job lives.
 */
export function closerOwns(
  task: string,
  duties: Record<Side, string[]>,
): { side: Side; subject: string } | null {
  if (!BREAKING_DOWN.test(task)) return null
  const hit = CLOSER_SUBJECTS.find((o) => o.re.test(task))
  if (!hit) return null
  const side = SIDES.find((s) =>
    (duties[s] ?? []).some((t) => BREAKING_DOWN.test(t) && hit.re.test(t)),
  )
  return side ? { side, subject: hit.subject } : null
}

const dutiesKey = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::sidework:closerduties`
}

/**
 * Rows the app itself put on the FOH list before it knew better.
 *
 * A device that opened the duty editor once has these saved, so changing the
 * defaults alone won't reach it. Matched EXACTLY, so a manager who typed their
 * own wording onto FOH on purpose keeps it.
 */
const MISFILED_ON_FOH = ['Break down both drink stations', 'Empty, wash and refill tea urns']

/**
 * ONCE. Not a standing rule.
 *
 * This started life inside getCloserDuties() with no flag, which made it a rule
 * that re-ran on every read: a manager at a store that puts the drink stations
 * on their FOH closer would move the row across, and the app would drag it back
 * to BOH on the next render. Forever. A fix that overrules the person using it
 * isn't a fix.
 *
 * So it corrects the app's own old default exactly once per store, and after
 * that the list is entirely theirs.
 */
function migrateOnce(): void {
  const flag = `${dutiesKey()}:foh2boh`
  if (load<boolean>(flag, false)) return
  save(flag, true)

  const r = load<Partial<Record<Side, string[]>>>(dutiesKey(), {})
  const savedFOH = Array.isArray(r?.FOH) ? r.FOH : null
  if (!savedFOH) return // Never edited — the new defaults already read right.

  const moving = savedFOH.filter((t) => MISFILED_ON_FOH.includes(t))
  if (moving.length === 0) return

  // Off FOH always. Onto BOH only where BOH isn't already covering that subject.
  const boh = Array.isArray(r?.BOH) ? r.BOH : DEFAULT_CLOSER_DUTIES.BOH
  const subjectOf = (t: string) => CLOSER_SUBJECTS.find((o) => o.re.test(t))?.subject
  const add = moving.filter((t) => !boh.some((b) => subjectOf(b) === subjectOf(t)))

  save(dutiesKey(), { FOH: savedFOH.filter((t) => !moving.includes(t)), BOH: [...add, ...boh] })
}

export function getCloserDuties(): Record<Side, string[]> {
  migrateOnce()
  const r = load<Partial<Record<Side, string[]>>>(dutiesKey(), {})
  return {
    FOH: Array.isArray(r?.FOH) ? r.FOH : DEFAULT_CLOSER_DUTIES.FOH,
    BOH: Array.isArray(r?.BOH) ? r.BOH : DEFAULT_CLOSER_DUTIES.BOH,
  }
}

export function setCloserDuties(side: Side, tasks: string[]): void {
  save(dutiesKey(), { ...getCloserDuties(), [side]: tasks })
}

/**
 * A closer duty's check-off id.
 *
 * Shares the same `sidework:done:<date>` map the rest of the sheet uses, so a
 * closer's ticks survive a reload and clear overnight like everything else.
 * Namespaced so it can never collide with a dealt duty's id.
 */
export const closerDutyId = (phase: string, side: Side, task: string): string =>
  `closer|${phase}|${side}|${task}`
