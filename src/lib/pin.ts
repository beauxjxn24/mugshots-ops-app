import { create } from 'zustand'
import { holdsPerm, permsOf, pinMatches, type Perm } from './users'

/**
 * PIN gate (handoff spec): gated actions ask for a manager PIN, and the PIN has
 * to carry the right for that particular action — see PERMS in users.ts. A
 * successful unlock lasts 20 minutes, then re-locks; there's a manual lock too.
 * Honor-system UI until real accounts land on the backend — but the same gate
 * points at real auth later.
 */
const UNLOCK_MS = 20 * 60 * 1000

interface PinState {
  open: boolean
  action: string
  /** Which grant the PIN has to carry to clear the gate that's currently open. */
  perm: Perm
  unlockedUntil: number
  unlockedBy: string
  /**
   * What the person who unlocked actually holds.
   *
   * The unlock used to be a single "is it open" flag, so clearing a tip pickup
   * left every other gate open for twenty minutes too — an AGM given Tip-out
   * alone could walk from there straight into store setup. The window is still
   * shared; the rights inside it are the unlocker's own.
   */
  unlockedPerms: Perm[]
  _resolve?: (ok: boolean) => void
  ask: (action: string, perm?: Perm) => Promise<boolean>
  submit: (pin: string) => boolean
  cancel: () => void
  lock: () => void
  isUnlocked: () => boolean
}

export const usePin = create<PinState>((set, get) => ({
  open: false,
  action: '',
  perm: 'unlock',
  unlockedUntil: 0,
  unlockedBy: '',
  unlockedPerms: [],
  ask: (action, perm = 'unlock') => {
    if (get().isUnlocked() && holdsPerm(get().unlockedPerms, perm)) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => set({ open: true, action, perm, _resolve: resolve }))
  },
  submit: (pin) => {
    const user = pinMatches(pin, get().perm)
    if (!user) return false
    const r = get()._resolve
    set({
      open: false,
      _resolve: undefined,
      unlockedUntil: Date.now() + UNLOCK_MS,
      unlockedBy: user.name,
      unlockedPerms: permsOf(user),
    })
    r?.(true)
    return true
  },
  cancel: () => {
    const r = get()._resolve
    set({ open: false, _resolve: undefined })
    r?.(false)
  },
  lock: () => set({ unlockedUntil: 0, unlockedBy: '', unlockedPerms: [] }),
  isUnlocked: () => Date.now() < get().unlockedUntil,
}))

/**
 * Await before a gated action. True once a valid PIN is entered (or still
 * unlocked). Name the grant the action needs; omitting it demands the master
 * key, which is the right default for anything not explicitly delegated.
 */
export function requirePin(action: string, perm?: Perm): Promise<boolean> {
  return usePin.getState().ask(action, perm)
}
