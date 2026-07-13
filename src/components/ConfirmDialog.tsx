import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useConfirm } from '../lib/confirm'

/** Rendered once at the app root; shows whenever confirmDelete(...) is awaited. */
export function ConfirmDialog() {
  const { open, message, detail, confirmLabel, respond } = useConfirm()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') respond(false)
      if (e.key === 'Enter') respond(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, respond])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={() => respond(false)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-down/10 text-down">
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold text-ink">{message}</div>
            {detail && <div className="mt-0.5 text-sm text-muted text-pretty">{detail}</div>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => respond(false)}
            className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => respond(true)}
            autoFocus
            className="rounded-lg bg-down px-4 py-2 text-sm font-semibold text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
