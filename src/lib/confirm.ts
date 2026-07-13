import { create } from 'zustand'

// App-wide "confirm before delete" gate. Any destructive action awaits
// confirmDelete(...) — a single, consistent dialog, hard-wired everywhere.
interface ConfirmState {
  open: boolean
  message: string
  detail?: string
  confirmLabel: string
  _resolve?: (ok: boolean) => void
  ask: (opts: { message: string; detail?: string; confirmLabel?: string }) => Promise<boolean>
  respond: (ok: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  open: false,
  message: '',
  confirmLabel: 'Delete',
  ask: ({ message, detail, confirmLabel = 'Delete' }) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, message, detail, confirmLabel, _resolve: resolve })
    }),
  respond: (ok) => {
    const r = get()._resolve
    set({ open: false, _resolve: undefined })
    r?.(ok)
  },
}))

/** Await this before deleting anything. Resolves true only if the user confirms. */
export function confirmDelete(message: string, detail?: string, confirmLabel = 'Delete'): Promise<boolean> {
  return useConfirm.getState().ask({ message, detail, confirmLabel })
}
