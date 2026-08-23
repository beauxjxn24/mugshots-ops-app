// The BOH deep-clean tab — today's jobs first, the whole schedule under it.
//
// Ordered that way on purpose. The wall sheet is a reference you have to search;
// this is a shift, so the two lines that are actually due today come first and
// the rest is there for looking ahead.
import { useMemo, useState } from 'react'
import { Pencil, Check, RotateCcw, CalendarDays } from 'lucide-react'
import { Card } from './ui'
import {
  getSchedule,
  setSchedule,
  resetSchedule,
  dueOn,
  cleanTickId,
  DOW_LONG,
  ORDINAL,
  type CleanSchedule,
} from '../lib/bohclean'

export function BohCleaning({
  date,
  done,
  onToggle,
  canEdit,
}: {
  /** Today, as the rest of the screen reckons it. */
  date: string
  done: Record<string, boolean>
  onToggle: (id: string) => void
  canEdit: boolean
}) {
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const schedule = useMemo(() => getSchedule(), [tick])
  const bump = () => setTick((n) => n + 1)
  const due = useMemo(() => dueOn(date, schedule), [date, schedule])
  const [editing, setEditing] = useState(false)

  const write = (fn: (s: CleanSchedule) => CleanSchedule) => {
    setSchedule(fn(schedule))
    bump()
  }
  const editWeekly = (i: number, slot: 'AM' | 'PM' | 'note', v: string) =>
    write((s) => ({ ...s, weekly: s.weekly.map((d, x) => (x === i ? { ...d, [slot]: v } : d)) }))
  const editMonthly = (i: number, slot: 'AM' | 'PM' | 'title', v: string) =>
    write((s) => ({ ...s, monthly: s.monthly.map((d, x) => (x === i ? { ...d, [slot]: v } : d)) }))

  return (
    <div className="space-y-4">
      {/* ── Due today ─────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden border-brand/30">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-brand/[0.08] px-4 py-2.5">
          <CalendarDays size={15} className="shrink-0 text-brand-600" />
          <span className="font-display text-sm font-semibold text-ink">
            Due today — {DOW_LONG[due.weekday]}
          </span>
          {due.nth > 0 && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-600">
              {ORDINAL[due.nth]} Sunday
            </span>
          )}
        </div>
        <div className="divide-y divide-black/5">
          <Line
            slot="AM"
            text={due.weekly.AM}
            id={due.weekly.AM ? cleanTickId('w', 'AM', due.weekly.AM) : undefined}
            done={done}
            onToggle={onToggle}
          />
          <Line
            slot="PM"
            text={due.weekly.PM}
            id={due.weekly.PM ? cleanTickId('w', 'PM', due.weekly.PM) : undefined}
            done={done}
            onToggle={onToggle}
          />
        </div>
        {due.weekly.note && (
          <p className="border-t border-black/5 bg-black/[0.02] px-4 py-2 text-[11px] leading-snug text-ink/70">
            {due.weekly.note}
          </p>
        )}

        {/* The monthly job, stacked on today rather than sitting on a second
            sheet nobody remembers to check. */}
        {due.nth > 0 && (
          <div className="border-t-2 border-brand/25">
            <div className="flex flex-wrap items-center gap-2 bg-brand/[0.05] px-4 py-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600">
                Monthly · {ORDINAL[due.nth]} Sunday
              </span>
              {due.monthly?.title && (
                <span className="text-sm font-bold text-ink">{due.monthly.title}</span>
              )}
            </div>
            {due.monthly ? (
              <div className="divide-y divide-black/5">
                <Line
                  slot="AM"
                  text={due.monthly.AM}
                  id={due.monthly.AM ? cleanTickId('m', 'AM', due.monthly.AM) : undefined}
                  done={done}
                  onToggle={onToggle}
                />
                <Line
                  slot="PM"
                  text={due.monthly.PM}
                  id={due.monthly.PM ? cleanTickId('m', 'PM', due.monthly.PM) : undefined}
                  done={done}
                  onToggle={onToggle}
                />
              </div>
            ) : (
              // A fifth Sunday has nothing on it. Saying so is the answer; an
              // empty box reads as something that failed to load.
              <p className="px-4 py-3 text-xs text-muted">
                Nothing monthly on a {ORDINAL[due.nth]} Sunday — the schedule runs to the 4th.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── The whole schedule ────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="font-display text-sm font-semibold text-ink">Weekly cleaning</span>
          <span className="text-[11px] text-muted">every shift</span>
          {canEdit && (
            <button
              onClick={() => setEditing((v) => !v)}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                editing
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-ink hover:border-brand/40'
              }`}
            >
              {editing ? <Check size={12} /> : <Pencil size={12} />}
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
        {schedule.weekly.map((d, i) => (
          <div
            key={i}
            className={`border-t border-black/5 px-4 py-2.5 ${
              i === due.weekday ? 'bg-brand/[0.06]' : ''
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`text-xs font-extrabold uppercase tracking-wide ${
                  i === due.weekday ? 'text-brand-600' : 'text-muted'
                }`}
              >
                {DOW_LONG[i]}
              </span>
              {i === due.weekday && (
                <span className="rounded-full bg-brand px-1.5 py-px text-[9px] font-extrabold uppercase text-white">
                  today
                </span>
              )}
            </div>
            {(['AM', 'PM'] as const).map((slot) => (
              <div key={slot} className="flex gap-2.5 py-0.5 text-sm">
                <span className="w-7 shrink-0 font-mono text-xs font-extrabold text-muted">{slot}</span>
                {editing ? (
                  <input
                    value={d[slot] ?? ''}
                    onChange={(e) => editWeekly(i, slot, e.target.value)}
                    placeholder="—"
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm text-ink outline-none focus:border-brand"
                  />
                ) : (
                  <span className="text-ink/90">{d[slot] || '—'}</span>
                )}
              </div>
            ))}
            {(d.note || editing) && (
              <div className="flex gap-2.5 pt-1">
                <span className="w-7 shrink-0" />
                {editing ? (
                  <input
                    value={d.note ?? ''}
                    onChange={(e) => editWeekly(i, 'note', e.target.value)}
                    placeholder="Note for this day (optional)"
                    className="min-w-0 flex-1 rounded-lg border border-dashed border-black/15 bg-white px-2 py-1 text-xs text-ink outline-none focus:border-brand"
                  />
                ) : (
                  <span className="text-[11px] leading-snug text-ink/60">{d.note}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="font-display text-sm font-semibold text-ink">Monthly cleaning</span>
          <span className="text-[11px] text-muted">on the Sunday listed</span>
        </div>
        {schedule.monthly.map((d, i) => (
          <div
            key={i}
            className={`border-t border-black/5 px-4 py-2.5 ${
              due.nth === i + 1 ? 'bg-brand/[0.06]' : ''
            }`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={`text-xs font-extrabold uppercase tracking-wide ${
                  due.nth === i + 1 ? 'text-brand-600' : 'text-muted'
                }`}
              >
                {ORDINAL[i + 1]} Sunday
              </span>
              {editing ? (
                <input
                  value={d.title ?? ''}
                  onChange={(e) => editMonthly(i, 'title', e.target.value)}
                  placeholder="What it is"
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm font-bold text-ink outline-none focus:border-brand"
                />
              ) : (
                d.title && <span className="text-sm font-bold text-ink">{d.title}</span>
              )}
              {due.nth === i + 1 && (
                <span className="rounded-full bg-brand px-1.5 py-px text-[9px] font-extrabold uppercase text-white">
                  today
                </span>
              )}
            </div>
            {(['AM', 'PM'] as const).map((slot) =>
              editing ? (
                <div key={slot} className="flex gap-2.5 py-0.5 text-sm">
                  <span className="w-7 shrink-0 font-mono text-xs font-extrabold text-muted">{slot}</span>
                  <input
                    value={d[slot] ?? ''}
                    onChange={(e) => editMonthly(i, slot, e.target.value)}
                    placeholder="—"
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm text-ink outline-none focus:border-brand"
                  />
                </div>
              ) : (
                d[slot] && (
                  <div key={slot} className="flex gap-2.5 py-0.5 text-sm">
                    <span className="w-7 shrink-0 font-mono text-xs font-extrabold text-muted">
                      {slot}
                    </span>
                    <span className="text-ink/90">{d[slot]}</span>
                  </div>
                )
              ),
            )}
          </div>
        ))}
        {canEdit && editing && (
          <div className="border-t border-black/5 p-3">
            <button
              onClick={() => {
                resetSchedule()
                bump()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-bold text-muted hover:border-down/40 hover:text-down"
            >
              <RotateCcw size={12} /> Reset to the shipped sheet
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}

/** One AM/PM line, tickable when there's something on it. */
function Line({
  slot,
  text,
  id,
  done,
  onToggle,
}: {
  slot: 'AM' | 'PM'
  text?: string
  id?: string
  done: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  if (!text)
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
        <span className="w-7 shrink-0 font-mono text-xs font-extrabold text-muted">{slot}</span>
        <span className="text-muted">Nothing on this shift</span>
      </div>
    )
  const on = id ? !!done[id] : false
  return (
    <button
      onClick={() => id && onToggle(id)}
      className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-black/[0.02] ${
        on ? 'opacity-55' : ''
      }`}
    >
      <span className="w-7 shrink-0 pt-0.5 font-mono text-xs font-extrabold text-muted">{slot}</span>
      <span
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
          on ? 'border-up bg-up text-white' : 'border-black/25'
        }`}
      >
        {on && <Check size={11} />}
      </span>
      <span className={`min-w-0 flex-1 ${on ? 'text-muted line-through' : 'text-ink/90'}`}>
        {text}
      </span>
    </button>
  )
}
