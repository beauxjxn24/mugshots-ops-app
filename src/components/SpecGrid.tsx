import { useEffect, useRef, useState } from 'react'
import { Card } from './ui'
import type { Spec } from '../lib/types'

/** Shared recipe/build card grid used by Specs, Signature Drinks, and LTO. */
export function SpecGrid({
  specs,
  showGroup = true,
  initialOpen,
}: {
  specs: Spec[]
  showGroup?: boolean
  /** Name of a card to open + scroll to on arrival (deep link). */
  initialOpen?: string
}) {
  const [openName, setOpenName] = useState<string | null>(initialOpen ?? null)
  if (specs.length === 0) {
    return <p className="text-sm text-muted">Nothing here yet.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {specs.map((s) => (
        <SpecCard
          key={s.name}
          spec={s}
          showGroup={showGroup}
          open={openName === s.name}
          highlight={initialOpen === s.name}
          onToggle={() => setOpenName(openName === s.name ? null : s.name)}
        />
      ))}
    </div>
  )
}

function SpecCard({
  spec,
  open,
  showGroup,
  highlight,
  onToggle,
}: {
  spec: Spec
  open: boolean
  showGroup: boolean
  highlight?: boolean
  onToggle: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Deep-linked card: scroll to it once it renders, with a gold ring so the
  // eye lands on the right build immediately.
  useEffect(() => {
    if (highlight) {
      const t = setTimeout(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
      return () => clearTimeout(t)
    }
  }, [highlight])
  return (
    <div ref={ref}>
      <Card className={`overflow-hidden ${highlight ? 'ring-2 ring-brand' : ''}`}>
        <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-semibold text-ink">{spec.name}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
              {spec.storage && <Chip>{spec.storage}</Chip>}
              {spec.shelf && <Chip>{spec.shelf}</Chip>}
              {spec.yields && <Chip>{spec.yields}</Chip>}
            </div>
          </div>
          <span className={`mt-1 text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {open && (
          <div className="border-t border-black/5 p-4 pt-3">
            {spec.ing.length > 0 && (
              <>
                <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                  Ingredients
                </div>
                <ul className="mb-3 space-y-1">
                  {spec.ing.map(([n, qty], i) => (
                    <li key={i} className="flex justify-between gap-3 text-sm">
                      <span className="text-ink">{n}</span>
                      <span className="font-mono text-xs text-muted">{qty}</span>
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
        )}
      </Card>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-black/5 px-1.5 py-0.5">{children}</span>
}
