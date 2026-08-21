// Designating the closers, and the work only they do.
//
// Sits above the cuts because it's decided first and it's a different question:
// the cuts are "who's going home and in what order", this is "who's staying to
// shut it down". Both sides on one card, since a manager names them together.
import { useMemo, useState } from 'react'
import { Lock, Pencil, Check, X, Plus, AlertTriangle } from 'lucide-react'
import { Card } from './ui'
import { NamePicker } from './NamePicker'
import {
  SIDES,
  SIDE_LABEL,
  closerDutyId,
  closerOwns,
  getCloserDuties,
  setCloserDuties,
  type Side,
} from '../lib/closers'

export function Closers({
  phase,
  roster,
  closers,
  onSetCloser,
  done,
  onToggle,
  canEdit,
  sheet = [],
}: {
  phase: string
  /** Everyone on the roster — a closer isn't limited to the role tab you're on. */
  roster: string[]
  closers: Partial<Record<Side, string>>
  onSetCloser: (side: Side, who: string) => void
  done: Record<string, boolean>
  onToggle: (id: string) => void
  canEdit: boolean
  /** The role's own sheet, so overlaps with a closer's list can be named. */
  sheet?: { task: string; section: string }[]
}) {
  const [duties, setDuties] = useState(getCloserDuties)
  const [editing, setEditing] = useState<Side | null>(null)
  const [adding, setAdding] = useState('')

  // Rows still on the role's sheet that a closer owns. The clipboard sheet was
  // written before closers existed in the app, so the servers' Section 3 still
  // says "break down dining room drink station" -- and that's the BOH closer's.
  // Two people on one job is how a tool stops getting used, so it's named here
  // rather than left for someone to notice at midnight.
  const clashes = useMemo(() => {
    const out: { side: Side; section: string; task: string }[] = []
    for (const d of sheet) {
      const owned = closerOwns(d.task)
      if (owned) out.push({ side: owned.side, section: d.section, task: d.task })
    }
    return out
  }, [sheet])

  const save = (side: Side, tasks: string[]) => {
    setCloserDuties(side, tasks)
    setDuties((d) => ({ ...d, [side]: tasks }))
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-2.5">
        <Lock size={14} className="shrink-0 text-muted" />
        <span className="font-display text-sm font-semibold text-ink">Closers</span>
        <span className="text-xs text-muted">
          they stay after the cuts — this work isn’t on the sidework sheet
        </span>
      </div>

      <div className="grid gap-px bg-black/5 sm:grid-cols-2">
        {SIDES.map((side) => {
          const who = closers[side] ?? ''
          const tasks = duties[side]
          const doneN = tasks.filter((t) => done[closerDutyId(phase, side, t)]).length
          const isEditing = editing === side

          return (
            <div key={side} className="bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-black/5 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                  {side}
                </span>
                {/* Type the name. This was a native select styled
                    dashed-and-grey when empty, which read as disabled rather
                    than as "nobody yet" -- and picking anyone meant scrolling
                    the roster on a tablet. */}
                <NamePicker
                  value={who}
                  options={roster}
                  placeholder={`Who's closing ${SIDE_LABEL[side].toLowerCase()}?`}
                  onChange={(name) => onSetCloser(side, name)}
                />
                {who && (
                  <span className="shrink-0 text-[11px] font-bold text-muted">
                    {doneN}/{tasks.length}
                  </span>
                )}
                {canEdit && (
                  <button
                    onClick={() => {
                      setEditing(isEditing ? null : side)
                      setAdding('')
                    }}
                    aria-label={isEditing ? 'Done editing' : `Edit the ${side} closing list`}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
                  >
                    {isEditing ? <Check size={14} /> : <Pencil size={12} />}
                  </button>
                )}
              </div>

              {/* The list is worth seeing even before anyone is named — it's what
                  the closer is signing up for. */}
              <ul className="space-y-0.5">
                {tasks.map((t) => {
                  const id = closerDutyId(phase, side, t)
                  const on = !!done[id]
                  return (
                    <li key={t} className="flex items-start gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => save(side, tasks.filter((x) => x !== t))}
                            aria-label={`Remove ${t}`}
                            className="mt-1 shrink-0 text-muted hover:text-down"
                          >
                            <X size={13} />
                          </button>
                          <span className="text-[13px] leading-snug text-ink/85">{t}</span>
                        </>
                      ) : (
                        <button
                          onClick={() => onToggle(id)}
                          disabled={!who}
                          title={who ? undefined : 'Name a closer first'}
                          className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span
                            className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                              on ? 'border-up bg-up text-white' : 'border-black/25'
                            }`}
                          >
                            {on && <Check size={11} />}
                          </span>
                          <span className={`text-[13px] leading-snug ${on ? 'text-muted line-through' : 'text-ink/85'}`}>
                            {t}
                          </span>
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              {isEditing && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={adding}
                    onChange={(e) => setAdding(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || !adding.trim()) return
                      save(side, [...tasks, adding.trim()])
                      setAdding('')
                    }}
                    placeholder="Add a closing duty…"
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-[13px] outline-none focus:border-brand"
                  />
                  <button
                    onClick={() => {
                      if (!adding.trim()) return
                      save(side, [...tasks, adding.trim()])
                      setAdding('')
                    }}
                    aria-label="Add"
                    className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand text-white"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {clashes.length > 0 && (
        <div className="flex items-start gap-2.5 border-t border-black/5 bg-warn/[0.06] px-4 py-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">
              {clashes.length === 1 ? 'One duty is' : `${clashes.length} duties are`} on this sheet
              and on a closer’s list
            </p>
            <ul className="mt-1 space-y-0.5">
              {clashes.map((c) => (
                <li key={c.task} className="text-[12px] leading-snug text-muted">
                  <span className="font-semibold text-ink/70">{c.section}</span> — “{c.task}” is the{' '}
                  {c.side} closer’s
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[12px] leading-snug text-muted">
              Dealt to a cut as well, two people do it. Take it off the duty list below, or leave it
              unassigned.
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
