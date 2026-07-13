// Permanent import history (prototype spec: every drop is logged). Each entry
// says what came in and WHERE IT WENT, so nobody ever wonders whether an
// import "took". Persisted per store; survives reloads.
import { create } from 'zustand'
import { load, save } from './store'
import { useScope } from './scope'

export interface ImportEntry {
  id: string
  file: string
  outcome: string // e.g. "14 nights → Nightly Numbers"
  at: string // "Jul 13, 9:41 AM"
}

const key = () => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::imports:history`
}

interface ImportLogState {
  entries: ImportEntry[]
  log: (file: string, outcome: string) => void
  clear: () => void
  reload: () => void
}

export const useImportLog = create<ImportLogState>((set) => ({
  entries: load<ImportEntry[]>(key(), []),
  log: (file, outcome) =>
    set((s) => {
      const entry: ImportEntry = {
        id: `im${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`,
        file,
        outcome,
        at: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      }
      const entries = [entry, ...s.entries].slice(0, 100)
      save(key(), entries)
      return { entries }
    }),
  clear: () => {
    save(key(), [])
    set({ entries: [] })
  },
  reload: () => set({ entries: load<ImportEntry[]>(key(), []) }),
}))

/** Log an import event from anywhere (components, libs). */
export function logImport(file: string, outcome: string): void {
  useImportLog.getState().log(file, outcome)
}
