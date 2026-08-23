import { load, save } from './store'
import { useScope } from './scope'

/**
 * Local events — things happening around town that could swing business
 * (games, concerts, festivals, conventions). Shown as a ticker banner on the
 * Dashboard.
 *
 * Typed in by managers today. Nothing feeds it automatically: the sources it
 * WOULD be fed from are settled in `eventsources.ts` and listed on Connections,
 * but there is no server to read them, so this is a hand-kept list until there
 * is one. The fields below are the shape that fetcher will write into.
 */
export interface LocalEvent {
  id: string
  name: string
  date: string // YYYY-MM-DD
  note?: string
  /**
   * Which source fed it. Absent means a manager typed it.
   *
   * Worth keeping apart: "Brandon Amphitheater says Jason Aldean" and "the GM
   * heard there's a wedding" are different kinds of confident, and only one of
   * them should be quietly overwritten by tomorrow's fetch.
   */
  from?: string
  /** Venue or town, so a name on a ticker reads as near or far. */
  where?: string
  /** Straight to the listing it came from. */
  url?: string
  /**
   * Taken off the ticker by a manager.
   *
   * Hidden rather than deleted, because a fed event that is simply removed
   * comes straight back on the next fetch — which is how a dismiss button
   * turns into a thing nobody trusts.
   */
  hidden?: boolean
}

const key = () => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::events:local`
}

export const getEvents = (): LocalEvent[] => {
  const r = load<LocalEvent[]>(key(), [])
  return Array.isArray(r) ? r.filter((e) => e && typeof e.name === 'string' && typeof e.date === 'string') : []
}
export const setEvents = (e: LocalEvent[]): void => save(key(), e)

export function addEvent(name: string, date: string, note = ''): void {
  const n = name.trim()
  if (!n || !date) return
  setEvents([...getEvents(), { id: `ev${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name: n, date, note: note.trim() || undefined }])
}
export function removeEvent(id: string): void {
  setEvents(getEvents().filter((e) => e.id !== id))
}

/** Upcoming events (today onward), soonest first. Dismissed ones stay off. */
export function upcomingEvents(today: string): LocalEvent[] {
  return getEvents()
    .filter((e) => e.date >= today && !e.hidden)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Take one off the ticker.
 *
 * A hand-typed event is deleted outright — nothing will put it back. One that
 * came from a source is only hidden, so the next fetch doesn't return it.
 */
export function dismissEvent(id: string): void {
  setEvents(
    getEvents().flatMap((e) =>
      e.id !== id ? [e] : e.from ? [{ ...e, hidden: true }] : [],
    ),
  )
}
