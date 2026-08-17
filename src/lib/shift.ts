// Which shift the restaurant is in right now.
//
// Half a dozen screens already had an opinion about this and none of them
// agreed: Tipshare always opened on lunch, Sidework always opened on whatever
// phase happened to be first in the sheet, the My Shift greeting read the clock
// on its own. Somebody walking in at six had to correct the app on every screen
// before it matched the night they were actually working.
//
// One answer, derived from the clock, with a manual override for the days that
// don't fit. Everything that cares reads it from here.
import { useEffect, useState } from 'react'
import { load, save } from './store'
import { useScope } from './scope'

export type Shift = 'AM' | 'PM'

/**
 * When lunch becomes dinner.
 *
 * Four o'clock — the shift change, not the menu change. If a store's changeover
 * really sits somewhere else this is the one number to move; day to day, the
 * override on the badge is the faster fix.
 */
const CHANGE_HOUR = 16

/**
 * When a new business day starts.
 *
 * Not midnight. A closer finishing side work at half past twelve is still on
 * tonight's dinner shift, and rolling the date over on them at 12:00 would take
 * tonight's cut plan, tonight's check-offs and tonight's login code away while
 * they are still standing in the building using them.
 */
const DAY_START_HOUR = 4

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The date the shift belongs to — the small hours still count as last night. */
export function businessDay(at: Date = new Date()): string {
  const d = new Date(at)
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1)
  return ymd(d)
}

/** What the clock says, before any override. */
export function autoShift(at: Date = new Date()): Shift {
  const h = at.getHours()
  if (h < DAY_START_HOUR) return 'PM' // still last night
  return h < CHANGE_HOUR ? 'AM' : 'PM'
}

// Keyed to the business day so it clears itself overnight. A manager who flips
// to dinner at two in the afternoon to set up the close should not find the app
// still insisting on dinner at eleven the next morning.
interface Override {
  on: string
  shift: Shift
}
const overrideKey = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::shift:override`
}

/** A shift someone set by hand today, or null if the clock is in charge. */
export function shiftOverride(): Shift | null {
  const rec = load<Override | null>(overrideKey(), null)
  return rec && rec.on === businessDay() ? rec.shift : null
}

/** Pin the shift for the rest of the business day, or pass null to hand it back to the clock. */
export function setShiftOverride(shift: Shift | null): void {
  save(overrideKey(), shift ? { on: businessDay(), shift } : null)
}

/** The shift the app is running on: what was set by hand, else what the clock says. */
export const currentShift = (): Shift => shiftOverride() ?? autoShift()

export const shiftLabel = (s: Shift): string => (s === 'AM' ? 'Lunch' : 'Dinner')

/**
 * The current shift, kept current.
 *
 * A tablet on the expo line is opened at ten in the morning and not touched
 * again until close, so the changeover has to happen under it rather than on
 * the next reload. Checked every half minute, which is far cheaper than it
 * sounds and means the badge is never more than that behind.
 */
export function useShift(): {
  shift: Shift
  auto: Shift
  overridden: boolean
  day: string
  setShift: (s: Shift | null) => void
} {
  const [, tick] = useState(0)

  useEffect(() => {
    const bump = () => tick((n) => n + 1)
    const id = setInterval(bump, 30_000)
    window.addEventListener('mugops:save', bump)
    // Coming back to a backgrounded tab, the interval may not have run.
    window.addEventListener('focus', bump)
    return () => {
      clearInterval(id)
      window.removeEventListener('mugops:save', bump)
      window.removeEventListener('focus', bump)
    }
  }, [])

  const over = shiftOverride()
  const auto = autoShift()
  return {
    shift: over ?? auto,
    auto,
    overridden: over != null,
    day: businessDay(),
    setShift: setShiftOverride,
  }
}

/**
 * Pick the sheet phase that goes with a shift.
 *
 * The sidework sheets each name their phases their own way: Servers run "AM
 * Opening", "AM Closing" and "PM Closing", the bar "AM Opening" and "PM
 * Closing", and Host and To-Go just "Opening" and "Closing" with no shift in
 * the name at all. Narrow to
 * the shift's own phases where the sheet says which shift it means, then take
 * the close for dinner and the open for lunch. Sheets are written in the order
 * they're worked, so where the wording doesn't say, last and first do.
 */
export function phaseForShift(phases: string[], shift: Shift): string {
  if (phases.length === 0) return ''
  const prefixed = phases.filter((p) => p.startsWith(shift))
  const pool = prefixed.length > 0 ? prefixed : phases
  const word = shift === 'PM' ? /clos/i : /open/i
  return pool.find((p) => word.test(p)) ?? (shift === 'PM' ? pool[pool.length - 1] : pool[0])
}
