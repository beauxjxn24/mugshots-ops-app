import { useState } from 'react'
import { Check } from 'lucide-react'
import { usePersistentState, today } from '../lib/store'
import { prepDoneKey, prepWho, setPrepWho, type PrepCheck } from '../lib/prepdone'
import { shiftPerson } from '../lib/daycode'
import { prepSpecName } from '../lib/specs'
import { SpecPeek } from './SpecPeek'

export interface ChecklistItem {
  name: string
  unit: string
  need: number
  section: string
}

/**
 * The prep list as a cook meets it on a phone.
 *
 * The manager's sheet is a twelve-column grid built for a desk and a printer —
 * on a phone it is a horizontal scroll, which is unusable one-handed in a
 * kitchen. This is the same list as a plain column: what to make, how much,
 * and a box to tick.
 *
 * A tick records initials and the time, so the sheet says who did it rather
 * than only that somebody did.
 */
export function PrepChecklist({ items }: { items: ChecklistItem[] }) {
  const [done, setDone] = usePersistentState<Record<string, PrepCheck>>(prepDoneKey(today()), {})
  // Whoever signed in for this shift. Only falls back to asking when nobody
  // did -- a manager's own device, or a session that predates the sign-in step.
  const [who, setWho] = useState(() => shiftPerson() || prepWho())
  const [peek, setPeek] = useState<string | null>(null)

  const toggle = (it: ChecklistItem) => {
    if (done[it.name]) {
      // Unticking is allowed but leaves nothing behind — the record is of work
      // done, and a wrong tap shouldn't be a permanent accusation.
      setDone((d) => {
        const n = { ...d }
        delete n[it.name]
        return n
      })
      return
    }
    const initials = who || (window.prompt('Your initials:') ?? '').trim().toUpperCase().slice(0, 4)
    if (!initials) return
    if (initials !== who) {
      setWho(initials)
      setPrepWho(initials)
    }
    setDone((d) => ({
      ...d,
      [it.name]: { by: initials, at: new Date().toISOString(), qty: it.need, unit: it.unit },
    }))
  }

  const todo = items.filter((i) => !done[i.name])
  const complete = items.length - todo.length

  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-black/[0.03] px-4 py-3">
        <span className="text-sm font-bold text-ink">
          {complete}/{items.length} done
        </span>
        {who && <span className="ml-auto truncate text-xs text-muted">checking off as {who}</span>}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.07]">
        {items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">Nothing on the prep list today.</p>
        )}
        {items.map((it) => {
          const rec = done[it.name]
          const card = prepSpecName(it.name)
          return (
            <div
              key={it.name}
              className={`flex items-center gap-3 border-b border-black/5 px-3 py-3 last:border-0 ${
                rec ? 'bg-up/[0.04]' : ''
              }`}
            >
              <button
                onClick={() => toggle(it)}
                aria-label={rec ? `Undo ${it.name}` : `Mark ${it.name} done`}
                className={`grid size-9 shrink-0 place-items-center rounded-xl border-2 transition-colors ${
                  rec ? 'border-up bg-up text-white' : 'border-black/15 text-transparent hover:border-brand'
                }`}
              >
                <Check size={18} strokeWidth={3} />
              </button>

              <div className="min-w-0 flex-1">
                {card ? (
                  <button
                    onClick={() => setPeek(card)}
                    className={`block w-full truncate text-left text-[15px] font-bold underline-offset-2 hover:underline ${
                      rec ? 'text-muted line-through' : 'text-ink'
                    }`}
                  >
                    {it.name}
                  </button>
                ) : (
                  <div className={`truncate text-[15px] font-bold ${rec ? 'text-muted line-through' : 'text-ink'}`}>
                    {it.name}
                  </div>
                )}
                {rec ? (
                  <div className="text-[11px] font-semibold text-up">
                    {rec.by} · {new Date(rec.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted">{it.section}</div>
                )}
              </div>

              {!rec && it.need > 0 && (
                <span className="shrink-0 rounded-full bg-brand/15 px-2.5 py-1 font-mono text-xs font-extrabold text-brand-600">
                  {Number.isInteger(it.need) ? it.need : it.need.toFixed(1)} {it.unit}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <SpecPeek name={peek} onClose={() => setPeek(null)} />
    </>
  )
}
