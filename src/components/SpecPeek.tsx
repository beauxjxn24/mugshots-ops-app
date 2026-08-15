import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { SPECS } from '../lib/specs'
import { dishPhoto } from '../lib/photos'

/**
 * A prep item's card, read without leaving the sheet.
 *
 * Someone counting the cooler taps an item to check a pan spec or a shelf life
 * and needs to be back on the same row a second later. Sending them to the
 * Specs page lost their place in a 49-row list mid-count, which is exactly when
 * you don't want to be scrolling back.
 *
 * Full card is one tap further on, for when they actually want to go and read
 * the whole thing.
 */
export function SpecPeek({ name, onClose }: { name: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!name) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [name, onClose])

  if (!name) return null
  const spec = SPECS.find((s) => s.name === name)
  if (!spec) return null
  const photo = dishPhoto(spec.name)

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-black/5 p-4">
          {photo && (
            <img src={photo} alt="" loading="lazy" className="size-12 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-semibold text-ink">{spec.name}</div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted">
              {[spec.storage, spec.shelf, spec.yields].filter(Boolean).map((c, i) => (
                <span key={i} className="rounded-full bg-black/5 px-2 py-0.5 font-semibold">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {spec.ing.length > 0 && (
            <>
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                Ingredients
              </div>
              <ul className="mb-4 space-y-1">
                {spec.ing.map(([n, qty], i) => (
                  <li key={i} className="flex justify-between gap-3 text-sm">
                    <span className="text-ink">{n}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{qty}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {spec.steps.length > 0 && (
            <>
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                Method
              </div>
              <ol className="list-decimal space-y-1 pl-4 text-sm text-ink/90">
                {spec.steps.map((st, i) => (
                  <li key={i}>{st}</li>
                ))}
              </ol>
            </>
          )}
        </div>

        <div className="border-t border-black/5 p-3">
          <Link
            to={`/specs?open=${encodeURIComponent(spec.name)}`}
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-black/10 py-2 text-xs font-bold text-muted hover:border-brand/40 hover:text-brand-600"
          >
            <ExternalLink size={13} /> Open the full card
          </Link>
        </div>
      </div>
    </div>
  )
}
