import { useMemo, useState } from 'react'
import { PageHeader, Card } from '../components/ui'
import { SPECS } from '../lib/specs'
import { usePersistentState, today } from '../lib/store'
import type { Spec } from '../lib/types'

export function Prep() {
  const prepItems = useMemo(() => SPECS.filter((s) => s.g === 'Prep'), [])
  // Done-state is scoped to today's date, so it resets automatically each day.
  const [done, setDone] = usePersistentState<Record<string, boolean>>(`prep:done:${today()}`, {})
  // Par targets persist across days.
  const [par, setPar] = usePersistentState<Record<string, string>>('prep:par', {})
  const [open, setOpen] = useState<string | null>(null)

  const doneCount = prepItems.filter((s) => done[s.name]).length

  return (
    <>
      <PageHeader
        title="Prep List"
        subtitle={`${doneCount} of ${prepItems.length} done · ${today()}`}
        right={
          <div className="flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${(doneCount / prepItems.length) * 100}%` }}
              />
            </div>
            {doneCount > 0 && (
              <button
                onClick={() => setDone({})}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-muted"
              >
                Reset
              </button>
            )}
          </div>
        }
      />
      <div className="mx-auto max-w-3xl space-y-2 p-4 sm:p-6 lg:p-8">
        {prepItems.map((s) => (
          <PrepRow
            key={s.name}
            spec={s}
            done={!!done[s.name]}
            par={par[s.name] ?? ''}
            open={open === s.name}
            onToggleDone={() => setDone((d) => ({ ...d, [s.name]: !d[s.name] }))}
            onPar={(v) => setPar((p) => ({ ...p, [s.name]: v }))}
            onOpen={() => setOpen(open === s.name ? null : s.name)}
          />
        ))}
      </div>
    </>
  )
}

function PrepRow({
  spec,
  done,
  par,
  open,
  onToggleDone,
  onPar,
  onOpen,
}: {
  spec: Spec
  done: boolean
  par: string
  open: boolean
  onToggleDone: () => void
  onPar: (v: string) => void
  onOpen: () => void
}) {
  return (
    <Card className={`overflow-hidden transition-colors ${done ? 'bg-up/5' : ''}`}>
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={onToggleDone}
          aria-label={done ? 'Mark not done' : 'Mark done'}
          className={`grid size-7 shrink-0 place-items-center rounded-md border-2 transition-colors ${
            done ? 'border-up bg-up text-white' : 'border-black/20'
          }`}
        >
          {done && '✓'}
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className={`font-semibold ${done ? 'text-muted line-through' : 'text-ink'}`}>
            {spec.name}
          </div>
          <div className="truncate text-xs text-muted">
            {spec.storage} · {spec.shelf}
          </div>
        </button>
        <input
          value={par}
          onChange={(e) => onPar(e.target.value)}
          placeholder="par"
          className="w-16 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-center text-xs outline-none focus:border-brand"
        />
      </div>
      {open && (spec.ing.length > 0 || spec.steps.length > 0) && (
        <div className="border-t border-black/5 bg-white/60 p-3 text-sm">
          {spec.ing.length > 0 && (
            <ul className="mb-2 space-y-0.5">
              {spec.ing.map(([n, q], i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{n}</span>
                  <span className="font-mono text-xs text-muted">{q}</span>
                </li>
              ))}
            </ul>
          )}
          {spec.steps.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-4 text-ink/90">
              {spec.steps.map((st, i) => (
                <li key={i}>{st}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  )
}
