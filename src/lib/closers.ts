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
 * Shipped as a starting point, not as the store's real list — these are the
 * jobs described when the feature was asked for, so a closer has something to
 * work from on day one. Editable in the app and stored per store, because the
 * real sheet lives on a clipboard somewhere and will replace this.
 */
export const DEFAULT_CLOSER_DUTIES: Record<Side, string[]> = {
  FOH: [
    'Break down both drink stations',
    'Empty, wash and refill tea urns',
    'Final wipe-down — tables, booths, host stand',
    'Sweep and mop the dining room',
    'Check both restrooms one last time',
    'Walk every section — chairs up, nothing left behind',
    'Lock the front doors and set the alarm panel',
  ],
  BOH: [
    'Shut down the line — flat top, fryers, hood',
    'Break down and wash the drink machine lines',
    'Final wipe-down — prep tables, reach-in handles, shelving',
    'Sweep and mop the kitchen',
    'Trash out, boxes broken down',
    'Walk-in and reach-ins closed and temping right',
    'Back door locked, lights out',
  ],
}

const dutiesKey = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::sidework:closerduties`
}

export function getCloserDuties(): Record<Side, string[]> {
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
