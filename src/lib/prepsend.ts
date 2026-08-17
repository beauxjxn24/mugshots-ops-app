// Sending the prep list to the floor.
//
// Until now the floor saw the sheet live: whatever numbers were on it at that
// second, including a half-counted list at eight in the morning with three
// coolers still to walk. A cook would start on a number that was about to
// change, and the manager had no way to say "this is the list" — the sheet was
// simply always visible and always provisional.
//
// So it's sent, deliberately, the same way a server is cut before they see
// their sidework. Nothing reaches the floor until a manager says it's the list.
//
// What's stored is a SNAPSHOT, not a flag. If it were a flag, a manager
// carrying on counting after sending would move the numbers under people
// already working to them. The list a cook is holding is the list that was
// sent; changing it takes a deliberate re-send, which says so.
import { load, save, today } from './store'

export interface SentItem {
  name: string
  unit: string
  need: number
  section: string
}

export interface PrepSend {
  /** ISO timestamp of the send. */
  at: string
  /** Who sent it. */
  by: string
  /** Exactly what went out — the floor works from this, not the live sheet. */
  items: SentItem[]
}

export const prepSendKey = (date: string = today()): string => `prep:sent:${date}`

export const getSend = (date: string = today()): PrepSend | null =>
  load<PrepSend | null>(prepSendKey(date), null)

export function sendPrep(items: SentItem[], by: string, date: string = today()): PrepSend {
  const rec: PrepSend = { at: new Date().toISOString(), by: by || 'Manager', items }
  save(prepSendKey(date), rec)
  return rec
}

export function unsendPrep(date: string = today()): void {
  save(prepSendKey(date), null)
}

/**
 * What's changed on the sheet since it went out.
 *
 * A manager who counts another cooler after sending should be told the floor is
 * holding an older list — quietly leaving them out of step is how a cook makes
 * four pans of something that was changed to two.
 */
export function driftFrom(sent: PrepSend | null, live: SentItem[]): {
  added: string[]
  removed: string[]
  changed: string[]
} {
  if (!sent) return { added: [], removed: [], changed: [] }
  const was = new Map(sent.items.map((i) => [i.name, i]))
  const now = new Map(live.map((i) => [i.name, i]))
  return {
    added: live.filter((i) => !was.has(i.name)).map((i) => i.name),
    removed: sent.items.filter((i) => !now.has(i.name)).map((i) => i.name),
    changed: live
      .filter((i) => was.has(i.name) && was.get(i.name)!.need !== i.need)
      .map((i) => i.name),
  }
}

/** Is the floor holding a list that no longer matches the sheet? */
export const hasDrift = (d: ReturnType<typeof driftFrom>): boolean =>
  d.added.length + d.removed.length + d.changed.length > 0
