import { create } from 'zustand'
import { load, save } from './store'

// Which experience to show. Real per-account roles come with the backend; for
// now this is a device toggle so you can feel both sides.
export type Role = 'manager' | 'staff'

const saved = load<Role | null>('__role', null)

interface RoleStore {
  role: Role
  setRole: (r: Role) => void
}

export const useRole = create<RoleStore>((set) => ({
  role: saved ?? 'manager',
  setRole: (role) => {
    set({ role })
    save('__role', role)
  },
}))
