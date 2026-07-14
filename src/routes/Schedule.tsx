import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Printer, Lock, LockOpen, CheckCircle2 } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { requirePin, usePin } from '../lib/pin'
import { DEFAULT_USERS, type User } from '../lib/users'

/** week map: weekStart(YYYY-MM-DD, Monday) -> userId -> 7 shift codes (Mon..Sun) */
type AllWeeks = Record<string, Record<string, string[]>>

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Shift codes per the handoff: O open · C close · M mid · OFF · RO requested off · R✓ granted
const CYCLE = ['', 'O', 'C', 'M', 'OFF', 'RO', 'R✓'] as const
const CHIP: Record<string, string> = {
  '': 'border border-dashed border-black/15 text-muted/50',
  O: 'bg-brand/15 text-brand-600 font-extrabold',
  C: 'bg-navy text-white font-extrabold',
  M: 'bg-sky-100 text-sky-800 font-extrabold',
  OFF: 'bg-black/5 text-muted font-bold',
  RO: 'bg-down/10 text-down font-bold',
  'R✓': 'bg-up/10 text-up font-bold',
}
const DEFAULT_RULES =
  'Every manager gets 2 weekend days off per period · no clopens · GM closes ≤ 6 per period. Build week 4 from these rules — adjust and publish.'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return iso(new Date(y, m - 1, d + delta))
}
function firstMonday(year: number): string {
  const d = new Date(year, 0, 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return iso(d)
}
function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}
function fmtMD(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

/**
 * Mgr schedule — runs BY THE PERIOD, not the week (prototype): four week
 * tabs inside a period, chip grid that cycles O/C/M/OFF/RO/R✓ once
 * unlocked with a GM PIN, period rules, and a live period-balance card.
 */
export function Schedule() {
  const [users] = usePersistentState<User[]>('users:list', DEFAULT_USERS)
  const [weeks, setWeeks] = usePersistentState<AllWeeks>('mgrsched:weeks', {})
  const [published, setPublished] = usePersistentState<Record<string, boolean>>('mgrsched:published', {})
  const [rules, setRules] = usePersistentState<string>('mgrsched:rules', DEFAULT_RULES)
  const unlocked = usePin((s) => Date.now() < s.unlockedUntil)
  const unlockedBy = usePin((s) => s.unlockedBy)
  const lock = usePin((s) => s.lock)

  const t = today()
  const anchor = firstMonday(Number(t.slice(0, 4)))
  const curPeriod = Math.floor(daysBetween(anchor, mondayOf(t)) / 28) + 1
  const [period, setPeriod] = useState(curPeriod)
  const pStart = shiftDays(anchor, (period - 1) * 28)
  const weekStarts = [0, 1, 2, 3].map((i) => shiftDays(pStart, i * 7))
  const curWeekIdx = weekStarts.findIndex((ws) => t >= ws && t <= shiftDays(ws, 6))
  const [weekIdx, setWeekIdx] = useState(curWeekIdx >= 0 ? curWeekIdx : 0)
  const weekStart = weekStarts[weekIdx]
  const grid = weeks[weekStart] ?? {}
  const isPublished = !!published[weekStart]

  const cycleCell = async (uid: string, day: number) => {
    if (!unlocked) {
      if (!(await requirePin('Edit the schedule'))) return
    }
    setWeeks((w) => {
      const week = { ...(w[weekStart] ?? {}) }
      const row = [...(week[uid] ?? Array(7).fill(''))]
      row[day] = CYCLE[(CYCLE.indexOf((row[day] ?? '') as (typeof CYCLE)[number]) + 1) % CYCLE.length]
      week[uid] = row
      return { ...w, [weekStart]: week }
    })
  }

  const copyLastWeek = async () => {
    if (!(await requirePin('Copy last week into this one'))) return
    const prev = shiftDays(weekStart, -7)
    setWeeks((w) => (w[prev] ? { ...w, [weekStart]: structuredClone(w[prev]) } : w))
  }
  const publish = async () => {
    if (!(await requirePin(isPublished ? 'Unpublish this week' : 'Publish this week'))) return
    setPublished((p) => ({ ...p, [weekStart]: !isPublished }))
  }

  const shiftsInWeek = (uid: string) => (grid[uid] ?? []).filter((c) => ['O', 'C', 'M'].includes(c)).length

  // Period balance: closes + weekend days off per manager, across all 4 weeks.
  const balance = useMemo(() => {
    return users.map((u) => {
      let closes = 0
      let weekendOff = 0
      for (const ws of weekStarts) {
        const row = weeks[ws]?.[u.id] ?? []
        closes += row.filter((c) => c === 'C').length
        if (row[5] === 'OFF' || row[5] === 'R✓') weekendOff++
        if (row[6] === 'OFF' || row[6] === 'R✓') weekendOff++
      }
      return { name: u.name.split(' ')[0], closes, weekendOff }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, weeks, period])
  const anyScheduled = balance.some((b) => b.closes > 0 || b.weekendOff > 0)

  return (
    <>
      <PageHeader
        title={`Manager schedule · Period ${period}`}
        subtitle={`${fmtMD(pStart)} – ${fmtMD(shiftDays(pStart, 27))} · O open · C close · M mid · OFF day off · RO request off · R✓ granted${unlocked ? '' : ' · locked — GM PIN to edit'}`}
        right={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {unlocked ? (
              <button onClick={lock} className="inline-flex items-center gap-1.5 rounded-lg bg-up/10 px-3 py-2 text-xs font-bold text-up">
                <LockOpen size={13} /> {unlockedBy} — tap to lock
              </button>
            ) : (
              <button
                onClick={() => requirePin('Edit the schedule')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
              >
                <Lock size={13} /> Unlock to edit
              </button>
            )}
            <Link to="/users" className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink">
              Manage roster →
            </Link>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1">
              {[period - 1, period, period + 1].map((p) => (
                <button
                  key={p}
                  disabled={p < 1 || p > 13}
                  onClick={() => {
                    setPeriod(p)
                    setWeekIdx(0)
                  }}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${p === period ? 'bg-white text-ink shadow-sm' : 'text-muted disabled:opacity-30'}`}
                >
                  P{p}
                </button>
              ))}
            </div>
            {period < 13 && (
              <button
                onClick={() => {
                  setPeriod(period + 1)
                  setWeekIdx(0)
                }}
                className="rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white"
              >
                Work on P{period + 1} →
              </button>
            )}
            <button onClick={() => window.print()} aria-label="Print" className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink">
              <Printer size={14} />
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="overflow-x-auto">
          {/* Week tabs */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="rounded-lg bg-navy px-2.5 py-1 text-xs font-extrabold text-white">P{period}</span>
            {weekStarts.map((ws, i) => {
              const cur = i === curWeekIdx && period === curPeriod
              const pub = !!published[ws]
              return (
                <button
                  key={ws}
                  onClick={() => setWeekIdx(i)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                    i === weekIdx
                      ? cur
                        ? 'bg-brand text-white'
                        : 'bg-navy text-white'
                      : 'bg-black/5 text-muted hover:text-ink'
                  }`}
                >
                  Week {i + 1} {pub ? '✓' : cur ? '· current' : '· draft'}
                </button>
              )
            })}
            <span className="ml-auto text-xs text-muted">
              Week {weekIdx + 1} · {fmtMD(weekStart)} – {fmtMD(shiftDays(weekStart, 6))}
            </span>
          </div>

          {/* Grid */}
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(7,minmax(64px,1fr))_80px] items-center gap-1 border-b border-black/10 px-4 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <span>Manager</span>
              {DOW.map((d) => (
                <span key={d} className="text-center">
                  {d}
                </span>
              ))}
              <span className="text-right">W{weekIdx + 1} shifts</span>
            </div>
            {users.map((u) => (
              <div
                key={u.id}
                className="grid grid-cols-[minmax(0,1.4fr)_repeat(7,minmax(64px,1fr))_80px] items-center gap-1 border-b border-black/5 px-4 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink">{u.name}</div>
                  <div className="text-[10px] text-muted">{u.role}</div>
                </div>
                {Array.from({ length: 7 }, (_, day) => {
                  const code = grid[u.id]?.[day] ?? ''
                  return (
                    <button
                      key={day}
                      onClick={() => cycleCell(u.id, day)}
                      title={unlocked ? 'Click to cycle' : 'Unlock to edit'}
                      className={`mx-auto min-w-12 rounded-lg px-2 py-1.5 text-center font-mono text-[11px] ${CHIP[code]}`}
                    >
                      {code || '·'}
                    </button>
                  )
                })}
                <span className="text-right font-mono text-sm text-ink">{shiftsInWeek(u.id)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-black/5 p-3 print:hidden">
            <button
              onClick={copyLastWeek}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
            >
              <Copy size={12} /> Copy last week
            </button>
            <button
              onClick={publish}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold ${
                isPublished ? 'bg-up/10 text-up' : 'bg-brand text-white'
              }`}
            >
              <CheckCircle2 size={13} /> {isPublished ? `Week ${weekIdx + 1} published — tap to unpublish` : `Publish week ${weekIdx + 1}`}
            </button>
            <span className="text-[11px] text-muted">Managers come from Admin → Users &amp; privileges.</span>
          </div>
        </Card>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="border-brand/25 bg-brand/[0.06] p-4">
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">Period rules</div>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-transparent bg-transparent text-xs leading-relaxed text-ink/80 outline-none hover:border-black/10 focus:border-brand"
            />
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-sm font-bold text-ink">P{period} balance</div>
            {!anyScheduled ? (
              <p className="text-xs text-muted">Fills in as shifts land on the grid.</p>
            ) : (
              <>
                <p className="text-xs text-ink/80">
                  <b>Closes</b> — {balance.map((b) => `${b.name} ${b.closes}`).join(' · ')}
                </p>
                <p className="mt-1 text-xs text-ink/80">
                  <b>Weekend days off</b> —{' '}
                  {balance.every((b) => b.weekendOff >= 2)
                    ? 'everyone at 2+ ✓'
                    : balance
                        .filter((b) => b.weekendOff < 2)
                        .map((b) => `${b.name} at ${b.weekendOff}`)
                        .join(' · ') + ' — short of the rule'}
                </p>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
