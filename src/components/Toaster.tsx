import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import type { ToastKind } from '../lib/toast'

interface Toast { id: number; message: string; kind: ToastKind }
let seq = 0

/** Renders toasts fired via toast() — a big, centered banner near the top that
 *  auto-dismisses. Mounted once in the app shell. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { message: string; kind: ToastKind }
      const id = ++seq
      setToasts((t) => [...t, { id, message: d.message, kind: d.kind }])
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
    }
    window.addEventListener('mugops:toast', onToast)
    return () => window.removeEventListener('mugops:toast', onToast)
  }, [])

  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[200] flex flex-col items-center gap-2 px-3 print:hidden">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : Info
        const ring =
          t.kind === 'success' ? 'border-up/40 shadow-[0_0_40px_-8px_rgba(67,213,155,0.55)]' :
          t.kind === 'error' ? 'border-down/40 shadow-[0_0_40px_-8px_rgba(255,111,143,0.55)]' :
          'border-signal/40 shadow-[0_0_40px_-8px_rgba(79,227,193,0.5)]'
        const tint = t.kind === 'success' ? 'text-up' : t.kind === 'error' ? 'text-down' : 'text-signal'
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border bg-[var(--surface)]/95 px-4 py-3.5 backdrop-blur-md animate-[toastin_.28s_cubic-bezier(.2,.9,.3,1.4)] ${ring}`}
            role="status"
          >
            <Icon size={22} className={`shrink-0 ${tint}`} />
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{t.message}</span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss"
              className="shrink-0 text-muted hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        )
      })}
      <style>{`@keyframes toastin{from{opacity:0;transform:translateY(-14px) scale(.96)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}
