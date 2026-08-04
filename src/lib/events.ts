import { load, save } from './store'
import { useScope } from './scope'

/**
 * Local events — things happening around town that could swing business
 * (games, concerts, festivals, conventions). Shown as a ticker banner on the
 * Dashboard. Entered by managers today; the planned email-watcher automation
 * (backend upgrade) will feed this same list automatically.
 */
export interface LocalEvent {
  id: string
  name: string
  date: string // YYYY-MM-DD
  note?: string
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

/** Upcoming events (today onward), soonest first. */
export function upcomingEvents(today: string): LocalEvent[] {
  return getEvents()
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
}
