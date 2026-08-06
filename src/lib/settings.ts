import { load, save } from './store'
import { useScope } from './scope'
import { usePin } from './pin'

/**
 * Settings audit — every saved setting is stamped with WHO saved it and WHEN.
 *
 * The owner's rule for the whole app: nothing configurable changes silently.
 * A setting is locked until someone unlocks it with a manager PIN, and the
 * save that follows is recorded here, append-only. Managers can see who moved
 * the labor target or changed a vendor's delivery day, and when.
 *
 * This is the local half of the `settings_audit` table in the backend plan —
 * same shape, so these rows move up untouched when accounts land.
 */
export interface SettingChange {
  /** Which settings card, e.g. "Weekly targets". */
  area: string
  /** Plain-English description of what changed. */
  summary?: string
  /** Employee who unlocked and saved. */
  by: string
  /** ISO timestamp. */
  at: string
}

const KEEP = 200

const key = () => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::settings:audit`
}

export const getSettingsAudit = (): SettingChange[] => {
  const r = load<SettingChange[]>(key(), [])
  return Array.isArray(r) ? r.filter((x) => x && x.area && x.at) : []
}

/** Whoever is currently unlocked, for the stamp. */
export const currentEditor = (): string => usePin.getState().unlockedBy || 'Manager'

/** Record a save. Newest first; the log is capped so it can't grow forever. */
export function logSettingChange(area: string, summary?: string): SettingChange {
  const entry: SettingChange = { area, summary, by: currentEditor(), at: new Date().toISOString() }
  save(key(), [entry, ...getSettingsAudit()].slice(0, KEEP))
  return entry
}

/** The most recent save for one area — powers the "Saved by … " stamp. */
export function lastChangeFor(area: string): SettingChange | null {
  return getSettingsAudit().find((c) => c.area === area) ?? null
}

/** "Aug 6, 9:14 PM" — short, readable, no seconds. */
export function stampLabel(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
