// What the checklists still owe, and how close they are to running out of week.
//
// A weekly checklist resets on Monday whether or not anybody did it. The list
// that never got worked doesn't get flagged, doesn't get carried, doesn't get
// mentioned — it just quietly becomes a clean sheet on Monday morning, and the
// only way you find out is the walk-in nobody defrosted.
//
// So the reset is the deadline, and this counts down to it. The point isn't to
// say "six left" on Sunday night when it's too late to staff it; it's to say
// "six left, two days" on Friday, while there's still a shift to put them on.
import { useEffect, useState } from 'react'
import { load } from './store'
import { useScope, useScopeKey } from './scope'
import { today } from './store'
import { periodWeek } from './forecast'
import MAINT from '../data/maintenance-checklists.json'
import AM_MANAGER from '../data/am-manager-checklist.json'
import PM_MANAGER from '../data/pm-manager-checklist.json'

export type Phase = 'AM' | 'PM' | 'Weekly' | 'Period'
export const PHASES: Phase[] = ['AM', 'PM', 'Weekly', 'Period']

export interface Section {
  title: string // '' renders with no section header
  items: string[]
}

// AM and PM are the managers' real shift walkthroughs, sectioned by the clock
// the way the printed forms are; Weekly/Period come straight from the owner's
// maintenance checklist (same source the Maintenance page uses).
//
// These live here rather than on the page because the badge has to know what a
// list holds BEFORE anyone has opened the page. A checklist is only written to
// storage once the screen mounts, so a page-owned default meant a manager who
// never opened Checklists on their phone saw a permanently silent badge — the
// exact person the reminder exists for.
export const DEFAULTS: Record<Phase, Section[]> = {
  AM: AM_MANAGER as Section[],
  PM: PM_MANAGER as Section[],
  Weekly: MAINT.weekly as Section[],
  Period: MAINT.period as Section[],
}

export const SECTIONS_KEY = 'checklists:sections:v2'
const scoped = (k: string): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}

export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** The stamp that scopes a phase's ticks — must match Checklists.tsx exactly. */
export function scopeFor(phase: Phase, t = today()): string {
  if (phase === 'Weekly') return mondayOf(t)
  if (phase === 'Period') return `${t.slice(0, 4)}-P${periodWeek(t).period}`
  return t
}

/** Days until this phase's ticks are wiped. Daily lists end tonight. */
export function daysLeft(phase: Phase, t = today()): number {
  const [y, m, d] = t.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // Monday = 0
  if (phase === 'Weekly') return 6 - dow // Sunday is the last day on it
  // A period runs weeks, so there's no useful countdown on it — it never earns
  // the "you're about to lose this" warning that makes the weekly one worth
  // having. Returned as a large number so nothing reads it as due tomorrow.
  if (phase === 'Period') return 99
  return 0
}

export type Urgency = 'clear' | 'open' | 'soon' | 'late'

export interface PhaseDue {
  phase: Phase
  total: number
  done: number
  left: number
  /** Days before the ticks reset. 0 = today is the last day. */
  days: number
  urgency: Urgency
}

/**
 * How a phase stands right now.
 *
 * `late` is the one that matters: work still owed with the reset in sight. Two
 * days is the threshold because that's the last point a manager can still put
 * it on somebody's shift — flagging it on the day is a complaint, not a
 * reminder.
 */
export function dueFor(phase: Phase, t = today()): PhaseDue {
  const sections = load<Partial<Record<Phase, Section[]>>>(scoped(SECTIONS_KEY), {})
  const list = Array.isArray(sections?.[phase]) ? (sections[phase] as Section[]) : DEFAULTS[phase]
  const keys = list.flatMap((s) => s.items.map((it) => `${s.title}|${it}`))
  const done = load<Record<string, boolean>>(scoped(`checklists:done:${phase}:${scopeFor(phase, t)}`), {})
  const doneN = keys.filter((k) => done?.[k]).length
  const left = keys.length - doneN
  const days = daysLeft(phase, t)

  let urgency: Urgency = 'clear'
  if (left > 0) {
    if (phase === 'Weekly') urgency = days <= 1 ? 'late' : days <= 3 ? 'soon' : 'open'
    else if (phase === 'Period') urgency = 'open'
    // A shift list is owed for the shift it belongs to, and there is no
    // tomorrow on it — the ticks are gone at midnight either way.
    else urgency = 'soon'
  }
  return { phase, total: keys.length, done: doneN, left, days, urgency }
}

export const allDue = (t = today()): PhaseDue[] => PHASES.map((p) => dueFor(p, t))

/** Cheap identity for a whole reading, so nothing re-renders on an equal one. */
const sig = (d: PhaseDue[]): string => d.map((x) => `${x.phase}${x.done}/${x.total}@${x.days}`).join()

/**
 * The live reading — every screen that shows this shows the same thing.
 *
 * Three things can change it and none of them is a page load: a box gets ticked
 * (here or on another tab), the store gets switched, or the clock rolls the day
 * over. The first two announce themselves; midnight doesn't, so it gets a slow
 * poll rather than a stale badge sitting there until someone reloads.
 */
export function useDue(): PhaseDue[] {
  const scope = useScopeKey()
  const [due, setDue] = useState<PhaseDue[]>(() => allDue())

  useEffect(() => {
    const refresh = (): void =>
      setDue((prev) => {
        const next = allDue()
        return sig(prev) === sig(next) ? prev : next
      })
    refresh()

    // Every write in the app goes through save(), which announces the key. Only
    // the checklist keys can move these numbers, so a count typed on the prep
    // sheet doesn't re-render the rail.
    const onSave = (e: Event): void => {
      const k = (e as CustomEvent<string>).detail
      if (typeof k === 'string' && !k.includes('checklists:')) return
      refresh()
    }
    window.addEventListener('mugops:save', onSave)
    window.addEventListener('storage', refresh)
    // Nobody touches the app at midnight, but the day rolls anyway and Monday
    // wipes the weekly list. A minute's lag on that is invisible.
    const tick = setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('mugops:save', onSave)
      window.removeEventListener('storage', refresh)
      clearInterval(tick)
    }
  }, [scope])

  return due
}

/* badgeFrom() and checklistBadge() lived here to feed a count pill on the nav.
   That pill is gone — a number that rides every screen all day stops being a
   prompt and becomes wallpaper, and there is no way to clear it except to go
   and do the work, which is not what you want a permanent red dot for. The due
   state is still computed; it is just shown on the Checklists screen, where
   you went to deal with it. */

/** "2 days left" / "last day" / "resets tonight". */
export function whenLabel(d: PhaseDue): string {
  if (d.phase === 'AM' || d.phase === 'PM') return 'resets tonight'
  if (d.phase === 'Period') return 'this period'
  if (d.days <= 0) return 'last day — resets tomorrow'
  if (d.days === 1) return '1 day left'
  return `${d.days} days left`
}
