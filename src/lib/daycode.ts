// The daily staff code.
//
// Staff open the app, type today's code, and start working. It changes at
// midnight, so someone who left last month can't still get in on a code a
// friend gave them, and nobody has to remember to rotate anything.
//
// Derived from the date and the store rather than stored, because this app
// keeps its data in the browser: a code a manager typed on the office laptop
// would not exist on the tablet in the kitchen. Deriving it means every device
// in the building shows the same four digits without anything syncing.
//
// This is a door, not a vault. It keeps the guest side of the app out of a
// cook's hands and keeps a cook out of the manager's screens; it is not
// protecting money, and anyone holding the code can share it. Manager PINs are
// the thing that actually gates the manager experience.
import { load, save } from './store'
import { useScope } from './scope'
import { today } from './store'

/** Stable 32-bit hash — same input, same digits, on every device. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Today's four-digit code for the store currently in scope. */
export function dayCode(date: string = today()): string {
  const s = useScope.getState()
  // The store is part of the seed so two locations never share a code — a code
  // shouted across the Flowood kitchen shouldn't open the app in Pearl.
  const n = hash(`mugshots|${s.currentConcept}|${s.currentLocation}|${date}`) % 10000
  // 0000 reads like "unset" to anyone looking at it, so nudge it off zero.
  return String(n === 0 ? 7 : n).padStart(4, '0')
}

const UNLOCK_KEY = '__staffUnlockedOn'

/** Has this device already been let in today? */
export function unlockedToday(): boolean {
  return load<string | null>(UNLOCK_KEY, null) === today()
}

/** Remember the unlock for the rest of the day — not forever. */
export function rememberUnlock(): void {
  save(UNLOCK_KEY, today())
}

/** Send the device back to the code screen (end of shift, wrong hands). */
export function forgetUnlock(): void {
  save(UNLOCK_KEY, null)
  save(PERSON_KEY, null)
}

const PERSON_KEY = '__shiftPerson'

/**
 * Who is on this device for this shift.
 *
 * The day code is shared — everyone on the floor types the same four digits —
 * so the code alone cannot say who is holding the phone. Asking once at sign-in
 * means the prep sheet and the sidework can stamp a name without prompting for
 * initials on every tick.
 *
 * Cleared with the unlock, so the next person to pick the tablet up identifies
 * themselves rather than inheriting the last person's name.
 */
export function shiftPerson(): string {
  const rec = load<{ on: string; who: string } | null>(PERSON_KEY, null)
  return rec && rec.on === today() ? rec.who : ''
}

export function setShiftPerson(who: string): void {
  save(PERSON_KEY, { on: today(), who })
}
