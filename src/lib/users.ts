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
  /**
   * What this person may clear, overriding what their role gives them.
   *
   * Absent means "whatever the role says". Always read it through permsOf() so
   * everyone on the list before this existed keeps working unchanged.
   */
  perms?: Perm[]
}

export const USER_ROLES = ['Admin', 'Area Director', 'GM', 'AGM', 'Manager'] as const

/**
 * What a manager's PIN can clear.
 *
 * Role decided everything — GM and up cleared every gate, everyone else
 * cleared none. That breaks the first time an AGM has to run closes alone, or
 * a GM shouldn't be in store setup. The role now only sets a starting point;
 * each grant is handed out or taken back per person on the Users screen.
 *
 * `unlock` is the master key and clears every gate by itself. The others are
 * for someone who should be able to do exactly one thing.
 */
export const PERMS = [
  { key: 'unlock', label: 'Unlock all', hint: 'Master key — their PIN clears every gated action.' },
  { key: 'schedule', label: 'Schedule', hint: 'Edit and publish the manager schedule.' },
  { key: 'tips', label: 'Tip-out', hint: 'Log a shift and approve tip pickups.' },
  { key: 'catalog', label: 'Catalog', hint: 'Change pars, order sheets and spec cards.' },
  { key: 'stores', label: 'Stores', hint: 'Add or edit stores and concepts.' },
] as const

export type Perm = (typeof PERMS)[number]['key']

/**
 * What each role starts with.
 *
 * Deliberately the same as the old role-only rule: the three senior roles hold
 * the master key, the other two hold nothing. Nobody's rights move until
 * somebody ticks a box — which is the only safe way to introduce this to a
 * store that is running on the app today.
 */
const ROLE_DEFAULTS: Record<User['role'], Perm[]> = {
  Admin: ['unlock'],
  'Area Director': ['unlock'],
  GM: ['unlock'],
  AGM: [],
  Manager: [],
}

/** This person's grants — their own if they've been set, otherwise the role's. */
export const permsOf = (u: Pick<User, 'role' | 'perms'>): Perm[] =>
  u.perms ?? ROLE_DEFAULTS[u.role] ?? []

/** May this person clear that gate? The master key clears all of them. */
export function can(u: Pick<User, 'role' | 'perms'>, perm: Perm): boolean {
  const held = permsOf(u)
  return held.includes(perm) || held.includes('unlock')
}

// The owner, per the handoff (default admin PIN 2424).
export const DEFAULT_USERS: User[] = [{ id: 'owner', name: 'Beau Bartholomew', role: 'Admin', pin: '2424' }]

export function getUsers(): User[] {
  const s = useScope.getState()
  return load<User[]>(`${s.currentConcept}|${s.currentLocation}::users:list`, DEFAULT_USERS)
}

/**
 * Does this PIN belong to someone allowed to clear this particular gate?
 *
 * Defaults to the master key so a call site that names no permission behaves
 * exactly as it always has.
 */
export function pinMatches(pin: string, perm: Perm = 'unlock'): User | null {
  if (!/^\d{4}$/.test(pin)) return null
  return getUsers().find((u) => u.pin === pin && can(u, perm)) ?? null
}

export function newUserId(): string {
  return `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}
