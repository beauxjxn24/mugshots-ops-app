// The ingredient list, times however many batches you're making.
//
// A prep card is written for one batch. Making three meant doing the arithmetic
// at the bench, mid-shift, with your hands full — which is exactly when a third
// of a cup times three turns into a guess.
//
// Two things this is careful about, because a wrong number in a recipe is worse
// than no multiplier at all:
//
//   The card's own wording stays on screen next to every scaled figure, so the
//   maths can be checked against the card without leaving the card.
//
//   Anything it won't multiply is SAID, not skipped. A rate ("8–10 per
//   bottle"), a portion size ("7 oz portions"), "as needed" — those are marked
//   with the reason, so nobody reads a silent line as a finished one.
import { useState } from 'react'
import { Minus, Plus, TriangleAlert } from 'lucide-react'
import { scaleAmount, worthScaling, BATCHES } from '../lib/scale'

export function BatchScaler({
  group,
  ing,
  yields,
  className = '',
}: {
  /** The card's category — batches are a prep idea, a build is one plate. */
  group: string
  ing: [string, string][]
  yields?: string
  className?: string
}) {
  const [by, setBy] = useState(1)
  const show = worthScaling({ g: group, ing })
  const rows = ing.map(([n, qty]) => ({ n, ...scaleAmount(qty, show ? by : 1) }))
  const flagged = rows.filter((r) => !r.ok || r.note)
  const batch = yields ? scaleAmount(yields, by) : null

  // Nothing here to multiply — a plate build, or a card that reads "as needed"
  // end to end. Just the list, with no control offering to do maths that isn't
  // there to do.
  if (!show)
    return (
      <div className={className}>
        <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
          Ingredients
        </div>
        <ul className="space-y-1">
          {ing.map(([n, qty], i) => (
            <li key={i} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 text-ink">{n}</span>
              <span className="shrink-0 font-mono text-xs text-muted">{qty}</span>
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
          Ingredients
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-0.5 text-[11px] font-semibold text-muted">Batches</span>
          <button
            onClick={() => setBy((b) => Math.max(1, b - 1))}
            disabled={by <= 1}
            aria-label="One less batch"
            className="grid size-7 place-items-center rounded-lg border border-black/10 bg-white text-muted disabled:opacity-35"
          >
            <Minus size={13} />
          </button>
          {BATCHES.map((n) => (
            <button
              key={n}
              onClick={() => setBy(n)}
              aria-pressed={by === n}
              className={`min-w-8 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors ${
                by === n ? 'bg-brand text-white' : 'border border-black/10 bg-white text-muted hover:text-ink'
              }`}
            >
              {n}×
            </button>
          ))}
          <button
            onClick={() => setBy((b) => Math.min(99, b + 1))}
            aria-label="One more batch"
            className="grid size-7 place-items-center rounded-lg border border-black/10 bg-white text-muted"
          >
            <Plus size={13} />
          </button>
          {by > 4 && (
            <span className="rounded-lg bg-brand px-2 py-1.5 text-xs font-bold text-white">{by}×</span>
          )}
        </div>
      </div>

      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-ink">{r.n}</span>
            <span className="shrink-0 text-right">
              <span className={`font-mono text-xs ${by > 1 && r.ok ? 'font-bold text-ink' : 'text-muted'}`}>
                {r.text}
              </span>
              {/* The card's own figure, so the arithmetic can be checked
                  against it without leaving the card. */}
              {by > 1 && r.ok && r.text !== r.from && (
                <span className="ml-1.5 font-mono text-[10px] text-muted/70">({r.from})</span>
              )}
              {by > 1 && !r.ok && (
                <span className="ml-1.5 text-[10px] font-semibold text-warn">not multiplied</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {by > 1 && batch?.ok && batch.text !== batch.from && (
        <p className="mt-2 text-xs text-muted">
          Makes <b className="text-ink/80">{batch.text}</b>{' '}
          <span className="text-muted/70">(one batch: {batch.from})</span>
        </p>
      )}

      {by > 1 && flagged.length > 0 && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-warn/[0.08] px-2.5 py-2">
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0 text-[11px] leading-snug text-muted">
            {flagged.map((r, i) => (
              <div key={i}>
                <b className="text-ink/70">{r.n}</b> — {r.note ?? 'read the card’s own amount'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
