import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, ChevronLeft, ChevronRight, CalendarCheck2, PencilLine } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useRole } from '../lib/role'
import { DEFAULT_USERS, type User } from '../lib/users'
import {
  CHIP,
  CODE_LABEL,
  DOW,
  PICK_CODES,
  fmtMD,
  mondayOf,
  shiftDays,
  type AllWeeks,
} from './Schedule'
import { periodWeek, periodStartNum } from '../lib/forecast'

/**
 * Posted schedule — the clean, read-only face of the manager schedule. Staff and
 * managers see ONLY the weeks the GM has published: no draft weeks, no time-off
 * inbox, no rules or balance chrome. It's the "what am I working" view, and it
 * prints straight to the wall.
 */
export function Posted() {
  const [rawUsers] = usePersistentState<User[]>('users:list', DEFAULT_USERS)
  const users = Array.isArray(rawUsers) ? rawUsers : DEFAULT_USERS
  const [weeks] = usePersistentState<AllWeeks>('mgrsched:weeks', {})
  const [published] = usePersistentState<Record<string, boolean>>('mgrsched:published', {})
  const role = useRole((s) => s.role)
  const canEdit = role === 'admin' || role === 'manager'

  const t = today()
  const curPeriod = periodWeek(t).period
  const [period, setPeriod] = useState(curPeriod)
  const pStart = periodStartNum(t, period)
  const weekStarts = [0, 1, 2, 3].map((i) => shiftDays(pStart, i * 7))

  // Only the weeks the GM actually published show here.
  const postedWeeks = useMemo(() => weekStarts.filter((ws) => published[ws]), [weekStarts, published])
  const thisWeekStart = mondayOf(t)

  return (
    <>
      <PageHeader
        title={`Posted schedule · Period ${period}`}
        subtitle={`${fmtMD(pStart)} – ${fmtMD(shiftDays(pStart, 27))} · the weeks your GM has published`}
        right={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {canEdit && (
              <Link
                to="/schedule"
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
              >
                <PencilLine size={13} /> Build / edit
              </Link>
            )}
            <div className="inline-flex items-center gap-1 rounded-lg bg-black/5 p-1">
              <button
                onClick={() => setPeriod(period - 1)}
                disabled={period <= 1}
                aria-label="Previous period"
                className="grid size-7 place-items-center rounded-md bg-white text-ink shadow-sm disabled:opacity-25"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-[76px] text-center text-xs font-extrabold text-ink">
                Period {period}
                {period === curPeriod && <span className="ml-1 text-[10px] font-bold text-brand">now</span>}
              </span>
              <button
                onClick={() => setPeriod(period + 1)}
                disabled={period >= 13}
                aria-label="Next period"
                className="grid size-7 place-items-center rounded-md bg-white text-ink shadow-sm disabled:opacity-25"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              onClick={() => window.print()}
              aria-label="Print"
              className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink"
            >
              <Printer size={14} />
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PICK_CODES.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.03] py-0.5 pl-0.5 pr-2">
              <span className={`grid h-5 min-w-6 place-items-center rounded-full px-1 text-[10px] ${CHIP[c]}`}>{c}</span>
              <span className="text-[10px] font-semibold text-muted">{CODE_LABEL[c]}</span>
            </span>
          ))}
        </div>

        {postedWeeks.length === 0 ? (
          <Card className="p-10 text-center">
            <CalendarCheck2 size={28} className="mx-auto mb-2 text-muted/50" />
            <p className="text-sm font-semibold text-ink">Nothing posted yet for Period {period}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted text-pretty">
              Once the GM publishes a week it shows up here for everyone.
              {canEdit && (
                <>
                  {' '}
                  <Link to="/schedule" className="font-semibold text-brand underline">
                    Build the schedule →
                  </Link>
                </>
              )}
            </p>
          </Card>
        ) : (
          postedWeeks.map((ws) => {
            const grid = weeks[ws] ?? {}
            const isThisWeek = ws === thisWeekStart
            // Only show people who actually have a coded shift this week.
            const rows = users.filter((u) => (grid[u.id] ?? []).some((c) => c))
            return (
              <Card key={ws} className="overflow-x-auto break-inside-avoid">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-extrabold text-white ${isThisWeek ? 'bg-brand' : 'bg-navy'}`}
                  >
                    {isThisWeek ? 'This week' : 'Week'}
                  </span>
                  <span className="text-sm font-bold text-ink">
                    {fmtMD(ws)} – {fmtMD(shiftDays(ws, 6))}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-up">
                    <CalendarCheck2 size={13} /> Posted
                  </span>
                </div>

                <div className="min-w-[820px]">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(7,minmax(70px,1fr))] items-end gap-1 border-b border-black/10 px-4 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                    <span>Manager</span>
                    {DOW.map((d, i) => {
                      const date = shiftDays(ws, i)
                      const isToday = date === t
                      return (
                        <span key={d} className={`text-center ${isToday ? 'text-brand-600' : ''}`}>
                          <span className="block">{d}</span>
                          <span className={`block font-mono text-[9px] font-bold ${isToday ? 'text-brand-600' : 'text-muted/70'}`}>
                            {fmtMD(date)}
                          </span>
                        </span>
                      )
                    })}
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-muted">No shifts on this posted week.</p>
                  ) : (
                    rows.map((u) => (
                      <div
                        key={u.id}
                        className="grid grid-cols-[minmax(0,1.4fr)_repeat(7,minmax(70px,1fr))] items-center gap-1 border-b border-black/5 px-4 py-2.5 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-ink">{u.name}</div>
                          <div className="text-[10px] text-muted">{u.role}</div>
                        </div>
                        {Array.from({ length: 7 }, (_, day) => {
                          const code = grid[u.id]?.[day] ?? ''
                          const isToday = shiftDays(ws, day) === t
                          return (
                            <div
                              key={day}
                              title={CODE_LABEL[code] ?? ''}
                              className={`mx-auto flex h-8 min-w-12 items-center justify-center rounded-lg px-2 text-center text-xs tracking-tight ${
                                code ? CHIP[code] : 'text-muted/25'
                              } ${isToday ? 'ring-2 ring-brand/40' : ''}`}
                            >
                              {code || '·'}
                            </div>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </>
  )
}
