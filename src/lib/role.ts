import { create } from 'zustand'
import { load, save } from './store'

// Which experience to show. Real per-account roles come with the backend; for
// now this is a device toggle so you can feel each side.
//  - admin   : the owner. The ONLY role that can switch stores/concepts and see
//              other stores' numbers (roll-ups + Stores & Concepts editing).
//  - manager : runs ONE store. Full day-to-day ops, but locked to their store —
//              no store switching, no cross-store visibility.
//  - staff   : the focused "My Shift" experience.
export type Role = 'admin' | 'manager' | 'staff'

const saved = load<Role | null>('__role', null)

// One-time migration: the app used to top out at 'manager'. The owner running
// it is the admin, so promote a saved 'manager' to 'admin' exactly once. A real
// store manager's device gets flipped back to 'manager' from the role switch.
let init: Role = saved ?? 'admin'
if (!load<boolean>('__roleV2', false)) {
  if (saved === 'manager') init = 'admin'
  save('__roleV2', true)
  save('__role', init)
}

interface RoleStore {
  role: Role
  setRole: (r: Role) => void
}

export const useRole = create<RoleStore>((set) => ({
  role: init,
  setRole: (role) => {
    set({ role })
    save('__role', role)
  },
}))

/** Only the admin (owner) may switch stores and see other stores' info. */
export const isAdminRole = (r: Role): boolean => r === 'admin'
