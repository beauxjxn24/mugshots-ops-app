// The BOH deep-clean tab — today's jobs first, the whole schedule under it.
//
// Ordered that way on purpose. The wall sheet is a reference you have to search;
// this is a shift, so the jobs actually due today come first and the rest is
// there for looking ahead.
import { useMemo, useState } from 'react'
import { Pencil, Check, RotateCcw, CalendarDays, Sparkles, X } from 'lucide-react'
import { Card } from './ui'
import {
  getSchedule,
  setSchedule,
  resetSchedule,
  dueOn,
  cleanTickId,
  DOW_LONG,
  ORDINAL,
  liveRepeats,
  dropPlacement,
  placeLabel,
  type CleanSchedule,
  type CleanDay,
} from '../lib/bohclean'

/**
 * Today's BOH cleaning, as one card.
 *
 * This is the bar's weekly-sidework card applied to the kitchen: a station's
 * own duties are its sheet, and the deep clean is the other thing that has to
 * happen on that shift. Shown on every station tab, because the schedule is
 * kitchen-wide — it isn't the fry cook's list or the dish list, it's the
 * building's, and whoever is on tonight does the line that's due.
 */
export function CleaningToday({
  date,
  done,
  onToggle,
}: {
  date: string
  done: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  const schedule = useMemo(() => getSchedule(), [])
  const due = useMemo(() => dueOn(date, schedule), [date, schedule])
  const has = (due.weekly.AM?.length ?? 0) + (due.weekly.PM?.length ?? 0) > 0
  if (!has && !due.monthly) return null

  return (
    <Card className="overflow-hidden border-warn/30">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-warn/[0.07] px-4 py-2.5">
        <Sparkles size={14} className="shrink-0 text-warn" />
        <span className="font-display text-sm font-semibold text-ink">
          Deep clean — {DOW_LONG[due.weekday]}
        </span>
        {due.nth > 0 && due.monthly && (
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-600">
            + {ORDINAL[due.nth]} Sunday · {due.monthly.title}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted">everyone in the BOH, not one station</span>
      </div>
      <Slots day={due.weekly} scope="w" done={done} onToggle={onToggle} />
      {due.monthly && (
        <div className="border-t-2 border-brand/25">
          <div className="bg-brand/[0.05] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-600">
            Monthly · {ORDINAL[due.nth]} Sunday · {due.monthly.title}
          </div>
          <Slots day={due.monthly} scope="m" done={done} onToggle={onToggle} />
        </div>
      )}
      {schedule.note && (
        <p className="border-t border-black/5 bg-black/[0.02] px-4 py-2 text-[11px] leading-snug text-ink/70">
          {schedule.note}
        </p>
      )}
    </Card>
  )
}

/** Both shifts of one day, every line tickable. */
function Slots({
  day,
  scope,
  done,
  onToggle,
}: {
  day: CleanDay
  scope: 'w' | 'm'
  done: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  return (
    <div className="divide-y divide-black/5">
      {(['AM', 'PM'] as const).map((slot) => {
        const list = day[slot] ?? []
        if (list.length === 0) return null
        return (
          <div key={slot} className="flex gap-2 px-4 py-2">
            <span className="w-7 shrink-0 pt-1.5 font-mono text-xs font-extrabold text-muted">
              {slot}
            </span>
            <div className="min-w-0 flex-1">
              {list.map((text) => {
                const id = cleanTickId(scope, slot, text)
                const on = !!done[id]
                return (
                  <button
                    key={id}
                    onClick={() => onToggle(id)}
                    className="flex w-full items-start gap-2.5 py-1 text-left text-sm"
                  >
                    <span
                      className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                        on ? 'border-up bg-up text-white' : 'border-black/25'
                      }`}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className={on ? 'text-muted line-through' : 'text-ink/90'}>{text}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {day.note && (
        <p className="px-4 py-2 text-[11px] leading-snug text-ink/60">{day.note}</p>
      )}
    </div>
  )
}

/** The full schedule tab — today at the top, the week and the month under it. */
export function BohCleaning({
  date,
  done,
  onToggle,
  canEdit,
}: {
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
  const repeats = useMemo(() => liveRepeats(schedule), [schedule])
  const [editing, setEditing] = useState(false)

  const write = (fn: (s: CleanSchedule) => CleanSchedule) => {
    setSchedule(fn(schedule))
    bump()
  }
  // Edited as one box per shift, a line per row — the same way the sheet reads
  // on the wall, and far less fiddly than a row of inputs that have to be added
  // and removed one at a time.
  const editDay = (kind: 'weekly' | 'monthly', i: number, slot: 'AM' | 'PM', v: string) =>
    write((s) => ({
      ...s,
      [kind]: s[kind].map((d, x) =>
        x === i ? { ...d, [slot]: v.split('\n').map((l) => l.trim()).filter(Boolean) } : d,
      ),
    }))
  const editTitle = (i: number, v: string) =>
    write((s) => ({ ...s, monthly: s.monthly.map((d, x) => (x === i ? { ...d, title: v } : d)) }))

  return (
    <div className="space-y-4">
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
        <Slots day={due.weekly} scope="w" done={done} onToggle={onToggle} />
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
              <Slots day={due.monthly} scope="m" done={done} onToggle={onToggle} />
            ) : (
              // A fifth Sunday has nothing on it. Saying so is the answer; an
              // empty box reads as something that failed to load.
              <p className="px-4 py-3 text-xs text-muted">
                Nothing monthly on a {ORDINAL[due.nth]} Sunday — the schedule runs to the 4th.
              </p>
            )}
          </div>
        )}
        {schedule.note && (
          <p className="border-t border-black/5 bg-black/[0.02] px-4 py-2 text-[11px] leading-snug text-ink/70">
            {schedule.note}
          </p>
        )}
      </Card>

      {/* Every copy of the sheet is in. What's left is the same job landing on
          two days, which is a thing only the kitchen can settle — so it's
          listed rather than guessed at. */}
      {canEdit && repeats.length > 0 && (
        <Card className="overflow-hidden border-warn/30">
          <div className="flex flex-wrap items-baseline gap-2 border-b border-black/5 bg-warn/[0.07] px-4 py-2.5">
            <span className="font-display text-sm font-semibold text-ink">On two days</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-muted">
              {repeats.length}
            </span>
            <span className="ml-auto text-[11px] text-muted">
              take off the one you don’t run — the job stays on the other day
            </span>
          </div>
          {repeats.map((r) => (
            <div key={r.id} className="border-b border-black/5 px-4 py-2.5 last:border-0">
              <div className="text-[13px] font-bold text-ink">{r.job}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {r.at.map((p, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white py-1 pl-2.5 pr-1 text-[11px]"
                  >
                    <span className="font-bold text-ink">{placeLabel(p)}</span>
                    <span className="max-w-[16rem] truncate text-muted">{p.text}</span>
                    <button
                      onClick={() => {
                        dropPlacement(p)
                        bump()
                      }}
                      aria-label={`Take ${r.job} off ${placeLabel(p)}`}
                      title={`Take it off ${placeLabel(p)}`}
                      className="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-down/10 hover:text-down"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

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
          <DayBlock
            key={i}
            label={DOW_LONG[i]}
            today={i === due.weekday}
            day={d}
            editing={editing}
            onEdit={(slot, v) => editDay('weekly', i, slot, v)}
          />
        ))}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="font-display text-sm font-semibold text-ink">Monthly cleaning</span>
          <span className="text-[11px] text-muted">on the Sunday listed</span>
        </div>
        {schedule.monthly.map((d, i) => (
          <DayBlock
            key={i}
            label={`${ORDINAL[i + 1]} Sunday`}
            today={due.nth === i + 1}
            day={d}
            editing={editing}
            title={d.title}
            onTitle={(v) => editTitle(i, v)}
            onEdit={(slot, v) => editDay('monthly', i, slot, v)}
          />
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

function DayBlock({
  label,
  today,
  day,
  editing,
  title,
  onTitle,
  onEdit,
}: {
  label: string
  today: boolean
  day: CleanDay
  editing: boolean
  title?: string
  onTitle?: (v: string) => void
  onEdit: (slot: 'AM' | 'PM', v: string) => void
}) {
  return (
    <div className={`border-t border-black/5 px-4 py-2.5 ${today ? 'bg-brand/[0.06]' : ''}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span
          className={`text-xs font-extrabold uppercase tracking-wide ${
            today ? 'text-brand-600' : 'text-muted'
          }`}
        >
          {label}
        </span>
        {onTitle &&
          (editing ? (
            <input
              value={title ?? ''}
              onChange={(e) => onTitle(e.target.value)}
              placeholder="What it is"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm font-bold text-ink outline-none focus:border-brand"
            />
          ) : (
            title && <span className="text-sm font-bold text-ink">{title}</span>
          ))}
        {today && (
          <span className="rounded-full bg-brand px-1.5 py-px text-[9px] font-extrabold uppercase text-white">
            today
          </span>
        )}
      </div>
      {(['AM', 'PM'] as const).map((slot) => {
        const list = day[slot] ?? []
        if (!editing && list.length === 0) return null
        return (
          <div key={slot} className="flex gap-2.5 py-0.5">
            <span className="w-7 shrink-0 pt-1 font-mono text-xs font-extrabold text-muted">
              {slot}
            </span>
            {editing ? (
              <textarea
                value={list.join('\n')}
                onChange={(e) => onEdit(slot, e.target.value)}
                rows={Math.max(1, list.length)}
                placeholder="One job per line"
                className="min-w-0 flex-1 resize-y rounded-lg border border-black/10 bg-white px-2 py-1 text-sm text-ink outline-none focus:border-brand"
              />
            ) : (
              <ul className="min-w-0 flex-1 space-y-0.5">
                {list.map((t, i) => (
                  <li key={i} className="text-sm text-ink/90">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {day.note && <p className="pl-9 pt-1 text-[11px] leading-snug text-ink/60">{day.note}</p>}
    </div>
  )
}
