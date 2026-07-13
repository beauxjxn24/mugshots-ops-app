import { create } from 'zustand'
import { pinMatches } from './users'

/**
 * PIN gate (handoff spec): gated actions ask for a GM / Area Director / Admin
 * PIN. A successful unlock lasts 20 minutes, then re-locks; there's a manual
 * lock too. Honor-system UI until real accounts land on the backend — but the
 * same gate points at real auth later.
 */
const UNLOCK_MS = 20 * 60 * 1000

interface PinState {
  open: boolean
  action: string
  unlockedUntil: number
  unlockedBy: string
  _resolve?: (ok: boolean) => void
  ask: (action: string) => Promise<boolean>
  submit: (pin: string) => boolean
  cancel: () => void
  lock: () => void
  isUnlocked: () => boolean
}

export const usePin = create<PinState>((set, get) => ({
  open: false,
  action: '',
  unlockedUntil: 0,
  unlockedBy: '',
  ask: (action) => {
    if (get().isUnlocked()) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => set({ open: true, action, _resolve: resolve }))
  },
  submit: (pin) => {
    const user = pinMatches(pin)
    if (!user) return false
    const r = get()._resolve
    set({ open: false, _resolve: undefined, unlockedUntil: Date.now() + UNLOCK_MS, unlockedBy: user.name })
    r?.(true)
    return true
  },
  cancel: () => {
    const r = get()._resolve
    set({ open: false, _resolve: undefined })
    r?.(false)
  },
  lock: () => set({ unlockedUntil: 0, unlockedBy: '' }),
  isUnlocked: () => Date.now() < get().unlockedUntil,
}))

/** Await before a gated action. True once a valid PIN is entered (or still unlocked). */
export function requirePin(action: string): Promise<boolean> {
  return usePin.getState().ask(action)
}
