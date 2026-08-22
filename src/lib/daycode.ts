// The daily staff code.
//
// Staff open the app, type today's code, and start working. It changes once a
// day, so someone who left last month can't still get in on a code a friend
// gave them, and nobody has to remember to rotate anything.
//
// It turns over at four in the morning, not at midnight: a closer who gets
// signed out at 12:10 while finishing side work would otherwise be locked out
// on a code nobody has handed out yet, in a building where the manager who
// could read them the new one has gone home.
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
import { businessDay } from './shift'

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
export function dayCode(date: string = businessDay()): string {
  const s = useScope.getState()
  // The store is part of the seed so two locations never share a code — a code
  // shouted across the Flowood kitchen shouldn't open the app in Pearl.
  const n = hash(`mugshots|${s.currentConcept}|${s.currentLocation}|${date}`) % 10000
  // 0000 reads like "unset" to anyone looking at it, so nudge it off zero.
  return String(n === 0 ? 7 : n).padStart(4, '0')
}

const UNLOCK_KEY = '__staffUnlockedOn'
const PERSON_KEY = '__shiftPerson'
const SEEN_KEY = '__lastSeen'

/**
 * How long the app stays open once you've stopped being there.
 *
 * It used to hold the unlock for the whole business day, in localStorage — so
 * once anyone typed the code, that browser was open until four in the morning.
 * Closing the tab didn't end it. Quitting the browser didn't end it. Restarting
 * the machine didn't end it. Typing the address again just walked straight in,
 * which is what the owner hit: no login, sitting on the admin dashboard.
 *
 * The first fix for that locked after fifteen minutes with no TAPS, which is a
 * different thing from fifteen minutes with nobody there. Reading a recipe,
 * working a count off the screen, following a prep list with your hands full —
 * all of that is being present, and none of it is a tap. So it threw people out
 * mid-shift.
 *
 * Now the clock only runs while you're AWAY: screen off, tab in the background,
 * app behind something else. A screen you're actually looking at never locks.
 * That's also the case the owner originally reported — coming back to the
 * address later and walking straight in — rather than the case it was
 * punishing.
 */
export const LOCK_CHOICES = [15, 60, 240, 0] as const
export const LOCK_LABEL: Record<number, string> = {
  15: '15 minutes',
  60: '1 hour',
  240: '4 hours',
  0: 'Only at 4am',
}
const DEFAULT_LOCK = 60

const lockKey = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::security:idleLock`
}
/** Minutes away before the code screen comes back. 0 = only the 4am rollover. */
export function idleLockMinutes(): number {
  const n = load<number>(lockKey(), DEFAULT_LOCK)
  return typeof n === 'number' && (LOCK_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_LOCK
}
export function setIdleLockMinutes(n: number): void {
  save(lockKey(), n)
}

/** Has this device been let in, and is that still current? */
export function unlockedToday(): boolean {
  if (load<string | null>(UNLOCK_KEY, null) !== businessDay()) return false
  const mins = idleLockMinutes()
  // 0 = the business day is the only thing that ends it, and the line above has
  // already answered that.
  if (mins === 0) return true
  const seen = load<number | null>(SEEN_KEY, null)
  if (typeof seen !== 'number') return false
  return Date.now() - seen < mins * 60_000
}

/** Remember the unlock — until the business day turns over, or it goes idle. */
export function rememberUnlock(): void {
  save(UNLOCK_KEY, businessDay())
  touchUnlock()
}

/**
 * "Someone is still here."
 *
 * Called on real interaction, not on a timer — a tab sitting open on a counter
 * is exactly the case this is meant to close, so time passing must never count
 * as someone being present.
 */
export function touchUnlock(): void {
  save(SEEN_KEY, Date.now())
}

/** Send the device back to the code screen (end of shift, wrong hands). */
export function forgetUnlock(): void {
  save(UNLOCK_KEY, null)
  save(SEEN_KEY, null)
  save(PERSON_KEY, null)
}

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
  return rec && rec.on === businessDay() ? rec.who : ''
}

export function setShiftPerson(who: string): void {
  save(PERSON_KEY, { on: businessDay(), who })
}
