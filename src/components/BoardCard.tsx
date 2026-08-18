// A build as the line reads it: photo, name, ingredients numbered in build
// order, nothing else. Dense and printable — this is the board that goes up by
// the window, not the card you study.
//
// Lives here rather than in a screen because Specs & Recipes shows it as its
// "Board" view. The two used to be separate pages over the same specs.json,
// which is how archiving could hide a pulled item on one and leave it printing
// on the other.
import { Archive } from 'lucide-react'
import { dishPhoto } from '../lib/photos'
import type { Spec } from '../lib/types'

export function BoardCard({ spec, onPark }: { spec: Spec; onPark?: () => void }) {
  const photo = dishPhoto(spec.name)
  const tag = spec.g.replace(' Builds', '')
  return (
    <article className="group break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.07] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:ring-black/10 print:rounded-none print:border print:shadow-none print:ring-0 print:transition-none print:hover:translate-y-0">
      {photo && (
        // Square, because the photos are square-to-portrait (0.54–1.79, most
        // near 0.75–1.0). A letterbox crop kept a thin band across the middle
        // and cut the dish off top and bottom.
        <div className="relative aspect-square overflow-hidden bg-navy/5 print:hidden">
          <img
            src={photo}
            alt={spec.name}
            loading="lazy"
            className="size-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white backdrop-blur-sm">
            {tag}
          </span>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10">
            <h3 className="font-display text-[15px] font-semibold leading-tight text-white">{spec.name}</h3>
          </div>
        </div>
      )}
      {/* The name again for print and for builds with no photo yet — the
          overlay above rides on an image that print drops. */}
      <div className={`items-center justify-between gap-2 px-3.5 pt-3 ${photo ? 'hidden print:flex' : 'flex'}`}>
        <div className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-ink">{spec.name}</div>
        <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wide text-muted">{tag}</span>
      </div>
      <ol className="space-y-0.5 p-3.5">
        {spec.ing.map(([n, qty], i) => (
          <li key={i} className="flex items-baseline justify-between gap-2 text-[13px] leading-snug">
            <span className="text-ink/85">
              <span className="mr-1.5 font-mono text-[10px] text-muted">{i + 1}</span>
              {n}
            </span>
            {qty && <span className="shrink-0 font-mono text-[11px] font-semibold text-brand">{qty}</span>}
          </li>
        ))}
      </ol>
      {onPark && (
        <div className="flex justify-end border-t border-black/5 px-3.5 py-2 print:hidden">
          <button
            onClick={onPark}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-muted transition-colors hover:bg-black/5 hover:text-ink"
          >
            <Archive size={12} />
            Park
          </button>
        </div>
      )}
    </article>
  )
}
