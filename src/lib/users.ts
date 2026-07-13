// Admin → Users & privileges. SEPARATE from the hourly Staff roster BY DESIGN
// (owner-confirmed, docs/handoff/AUDIT.md #4): Users are managers — name, role,
// PIN, permissions — used for the schedule and PIN-gated actions. Staff are
// hourly — tip role + hours. Do not merge.
import { load } from './store'
import { useScope } from './scope'

export interface User {
  id: string
  name: string
  role: (typeof USER_ROLES)[number]
  pin: string // 4 digits; empty = no unlock rights
}

export const USER_ROLES = ['Admin', 'Area Director', 'GM', 'AGM', 'Manager'] as const

/** Roles whose PIN can unlock gated actions (schedule edit/publish, add store…). */
const UNLOCK_ROLES = new Set(['Admin', 'Area Director', 'GM'])

// The owner, per the handoff (default admin PIN 2424).
export const DEFAULT_USERS: User[] = [{ id: 'owner', name: 'Beau Bartholomew', role: 'Admin', pin: '2424' }]

export function getUsers(): User[] {
  const s = useScope.getState()
  return load<User[]>(`${s.currentConcept}|${s.currentLocation}::users:list`, DEFAULT_USERS)
}

/** Does this PIN belong to a user allowed to unlock gated actions? */
export function pinMatches(pin: string): User | null {
  if (!/^\d{4}$/.test(pin)) return null
  return getUsers().find((u) => u.pin === pin && UNLOCK_ROLES.has(u.role)) ?? null
}

export function newUserId(): string {
  return `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}
