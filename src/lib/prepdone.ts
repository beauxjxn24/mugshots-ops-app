// Who prepped what, and when.
//
// Checking a box records the initials, the moment, and the quantity that was
// on the sheet at the time — so "was the alfredo done?" has an answer the next
// morning, and a par that keeps coming up short can be traced to a shift rather
// than argued about.
//
// Scoped to the day and the store, like the counts and the sidework sign-off.
import { load, save, today } from './store'

export interface PrepCheck {
  /** Initials of whoever checked it — until real accounts, this is the name. */
  by: string
  /** ISO timestamp of the tap. */
  at: string
  /** What the sheet asked for at that moment, kept for the record. */
  qty: number
  unit: string
}

export const prepDoneKey = (date: string = today()): string => `prep:done:${date}`

/** The initials in use on this device today — asked once, not per item. */
const WHO_KEY = '__prepWho'

export function prepWho(): string {
  const rec = load<{ on: string; who: string } | null>(WHO_KEY, null)
  return rec && rec.on === today() ? rec.who : ''
}

export function setPrepWho(who: string): void {
  save(WHO_KEY, { on: today(), who: who.trim().toUpperCase().slice(0, 4) })
}
