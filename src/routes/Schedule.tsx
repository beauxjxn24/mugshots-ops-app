import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Printer, Lock, LockOpen, CheckCircle2, CalendarClock, Check, X } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { requirePin, usePin } from '../lib/pin'
import { DEFAULT_USERS, type User } from '../lib/users'

/** week map: weekStart(YYYY-MM-DD, Monday) -> userId -> 7 shift codes (Mon..Sun) */
type AllWeeks = Record<string, Record<string, string[]>>

/** A manager's advance time-off request — GM sees it as RO, grants it to R✓/VAC. */
interface TimeOff {
  id: string
  userId: string
  dates: string[] // ISO days requested off
  type: 'off' | 'vac' // single day off vs a vacation block
  note?: string
  status: 'pending' | 'granted' | 'denied'
  at: string
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Shift codes per the handoff: O open · C close · M mid · OFF · RO requested off ·
// R✓ granted off · VAC vacation. Picked from a dropdown on each cell.
const CODES = ['', 'O', 'C', 'M', 'OFF', 'RO', 'R✓', 'VAC'] as const
const CHIP: Record<string, string> = {
  '': 'border border-dashed border-black/15 text-muted/50',
  O: 'bg-brand/15 text-brand-600 font-extrabold',
  C: 'bg-navy text-white font-extrabold',
  M: 'bg-sky-100 text-sky-800 font-extrabold',
  OFF: 'bg-black/5 text-muted font-bold',
  RO: 'bg-down/10 text-down font-bold',
  'R✓': 'bg-up/10 text-up font-bold',
  VAC: 'bg-[#EDE9FE] text-[#6D28D9] font-extrabold',
}
const CODE_HELP = 'O open · C close · M mid · OFF day off · RO requested off · R✓ granted · VAC vacation'
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

/** Read one date's cell out of the whole-schedule weeks store. */
function getCell(weeks: AllWeeks, uid: string, date: string): string {
  const ws = mondayOf(date)
  const idx = daysBetween(ws, date)
  return weeks[ws]?.[uid]?.[idx] ?? ''
}
/** Return a NEW weeks store with one date's cell set (may cross week boundaries). */
function withCell(weeks: AllWeeks, uid: string, date: string, val: string): AllWeeks {
  const ws = mondayOf(date)
  const idx = daysBetween(ws, date)
  const week = { ...(weeks[ws] ?? {}) }
  const row = [...(week[uid] ?? Array(7).fill(''))]
  row[idx] = val
  week[uid] = row
  return { ...weeks, [ws]: week }
}
function expandDates(from: string, to: string): string[] {
  if (!from) return []
  if (!to || to < from) return [from]
  const out: string[] = []
  let d = from
  let guard = 0
  while (d <= to && guard++ < 31) {
    out.push(d)
    d = shiftDays(d, 1)
  }
  return out
}

/**
 * Mgr schedule — runs BY THE PERIOD (prototype): four week tabs, a chip grid
 * where each cell is a dropdown (O/C/M/OFF/RO/R✓/VAC), advance time-off
 * requests that surface as RO for the GM to grant, period rules, and a live
 * period-balance card.
 */
export function Schedule() {
  const [users] = usePersistentState<User[]>('users:list', DEFAULT_USERS)
  const [weeks, setWeeks] = usePersistentState<AllWeeks>('mgrsched:weeks', {})
  const [published, setPublished] = usePersistentState<Record<string, boolean>>('mgrsched:published', {})
  const [rules, setRules] = usePersistentState<string>('mgrsched:rules', DEFAULT_RULES)
  const [requests, setRequests] = usePersistentState<TimeOff[]>('mgrsched:timeoff', [])
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

  // Pending requests → a lookup of (user|date) that still needs a decision.
  // A date already coded on the grid is considered handled, so it drops out.
  const pending = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests])
  const pendingSet = useMemo(() => {
    const s = new Set<string>()
    for (const r of pending) for (const d of r.dates) if (getCell(weeks, r.userId, d) === '') s.add(`${r.userId}|${d}`)
    return s
  }, [pending, weeks])

  // Auto-resolve: once every day of a request is coded on the grid, the
  // request is granted (so it leaves the inbox — no double-tracking).
  useEffect(() => {
    let changed = false
    const next = requests.map((r) => {
      if (r.status !== 'pending') return r
      if (r.dates.length && r.dates.every((d) => getCell(weeks, r.userId, d) !== '')) {
        changed = true
        return { ...r, status: 'granted' as const }
      }
      return r
    })
    if (changed) setRequests(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, requests])

  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? '?'

  const setCell = (uid: string, date: string, val: string) => setWeeks((w) => withCell(w, uid, date, val))

  const grant = async (req: TimeOff) => {
    if (!unlocked && !(await requirePin('Grant time off'))) return
    setWeeks((w) => req.dates.reduce((acc, d) => withCell(acc, req.userId, d, req.type === 'vac' ? 'VAC' : 'R✓'), w))
    setRequests((rs) => rs.map((r) => (r.id === req.id ? { ...r, status: 'granted' } : r)))
  }
  const deny = async (req: TimeOff) => {
    if (!unlocked && !(await requirePin('Deny time off'))) return
    setRequests((rs) => rs.map((r) => (r.id === req.id ? { ...r, status: 'denied' } : r)))
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
    const off = new Set(['OFF', 'R✓', 'VAC'])
    return users.map((u) => {
      let closes = 0
      let weekendOff = 0
      for (const ws of weekStarts) {
        const row = weeks[ws]?.[u.id] ?? []
        closes += row.filter((c) => c === 'C').length
        if (off.has(row[5])) weekendOff++
        if (off.has(row[6])) weekendOff++
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
        subtitle={`${fmtMD(pStart)} – ${fmtMD(shiftDays(pStart, 27))} · ${CODE_HELP}${unlocked ? '' : ' · locked — GM PIN to edit'}`}
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
        {/* Pending time-off — the GM sees requests before building the week */}
        {pending.length > 0 && (
          <Card className="border-down/25 bg-down/[0.04] p-4 print:hidden">
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock size={15} className="text-down" />
              <span className="text-sm font-bold text-ink">
                {pending.length} time-off request{pending.length === 1 ? '' : 's'} to review
              </span>
              <span className="text-[11px] text-muted">shown as RO on the grid — grant to R✓ / VAC</span>
            </div>
            <div className="space-y-2">
              {[...pending]
                .sort((a, b) => (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''))
                .map((req) => {
                  const span =
                    req.dates.length <= 1
                      ? fmtMD(req.dates[0] ?? '')
                      : `${fmtMD(req.dates[0])} – ${fmtMD(req.dates[req.dates.length - 1])} (${req.dates.length}d)`
                  return (
                    <div key={req.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2">
                      <span className="text-sm font-bold text-ink">{nameOf(req.userId)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${req.type === 'vac' ? 'bg-[#EDE9FE] text-[#6D28D9]' : 'bg-down/10 text-down'}`}>
                        {req.type === 'vac' ? 'VACATION' : 'DAY OFF'}
                      </span>
                      <span className="text-xs text-muted">{span}</span>
                      {req.note && <span className="truncate text-xs italic text-muted">“{req.note}”</span>}
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => void grant(req)}
                          className="inline-flex items-center gap-1 rounded-lg bg-up px-2.5 py-1.5 text-[11px] font-bold text-white"
                        >
                          <Check size={12} /> Grant → {req.type === 'vac' ? 'VAC' : 'R✓'}
                        </button>
                        <button
                          onClick={() => void deny(req)}
                          className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-bold text-muted hover:text-down"
                        >
                          <X size={12} /> Deny
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </Card>
        )}

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
                    i === weekIdx ? (cur ? 'bg-brand text-white' : 'bg-navy text-white') : 'bg-black/5 text-muted hover:text-ink'
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
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(7,minmax(66px,1fr))_80px] items-end gap-1 border-b border-black/10 px-4 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <span>Manager</span>
              {DOW.map((d, i) => {
                const date = shiftDays(weekStart, i)
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
              <span className="text-right">W{weekIdx + 1} shifts</span>
            </div>
            {users.map((u) => (
              <div
                key={u.id}
                className="grid grid-cols-[minmax(0,1.4fr)_repeat(7,minmax(66px,1fr))_80px] items-center gap-1 border-b border-black/5 px-4 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink">{u.name}</div>
                  <div className="text-[10px] text-muted">{u.role}</div>
                </div>
                {Array.from({ length: 7 }, (_, day) => {
                  const date = shiftDays(weekStart, day)
                  const raw = grid[u.id]?.[day] ?? ''
                  const pend = raw === '' && pendingSet.has(`${u.id}|${date}`)
                  const code = pend ? 'RO' : raw
                  if (!unlocked) {
                    return (
                      <div
                        key={day}
                        title={pend ? 'Requested off — unlock to grant' : ''}
                        className={`mx-auto min-w-12 rounded-lg px-2 py-1.5 text-center font-mono text-[11px] ${CHIP[code]} ${
                          pend ? 'ring-1 ring-dashed ring-down/40' : ''
                        }`}
                      >
                        {code || '·'}
                      </div>
                    )
                  }
                  return (
                    <select
                      key={day}
                      value={code}
                      onChange={(e) => setCell(u.id, date, e.target.value)}
                      title={pend ? 'Requested off — pick R✓ or VAC to grant' : 'Pick a shift code'}
                      className={`mx-auto min-w-12 cursor-pointer appearance-none rounded-lg px-1 py-1.5 text-center font-mono text-[11px] outline-none focus:ring-2 focus:ring-brand ${CHIP[code]} ${
                        pend ? 'ring-1 ring-dashed ring-down/40' : ''
                      }`}
                    >
                      {CODES.map((c) => (
                        <option key={c} value={c}>
                          {c || '·'}
                        </option>
                      ))}
                    </select>
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

        <RequestOff users={users} onSubmit={(r) => setRequests((rs) => [r, ...rs])} requests={requests} nameOf={nameOf} />

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

/** Advance time-off request — any manager submits; the GM grants on the grid. */
function RequestOff({
  users,
  onSubmit,
  requests,
  nameOf,
}: {
  users: User[]
  onSubmit: (r: TimeOff) => void
  requests: TimeOff[]
  nameOf: (uid: string) => string
}) {
  const [userId, setUserId] = useState(users[0]?.id ?? '')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState('')
  const [type, setType] = useState<'off' | 'vac'>('off')
  const [note, setNote] = useState('')

  const submit = () => {
    const dates = expandDates(from, to)
    if (!userId || dates.length === 0) return
    onSubmit({ id: `to${Date.now()}`, userId, dates, type, note: note.trim() || undefined, status: 'pending', at: today() })
    setNote('')
    setTo('')
  }

  const resolved = useMemo(
    () => requests.filter((r) => r.status !== 'pending').sort((a, b) => (b.dates[0] ?? '').localeCompare(a.dates[0] ?? '')),
    [requests],
  )

  return (
    <Card className="p-4 print:hidden">
      <div className="mb-2 text-sm font-bold text-ink">Request time off</div>
      <p className="mb-2 text-[11px] text-muted">
        Managers request off in advance — it lands here for the GM as an RO on the grid, granted to R✓ (or VAC).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-bold uppercase text-muted">
          Manager
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-0.5 block rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-muted">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 block rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="text-[10px] font-bold uppercase text-muted">
          To <span className="normal-case text-muted/70">(optional)</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 block rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="text-[10px] font-bold uppercase text-muted">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'off' | 'vac')}
            className="mt-0.5 block rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="off">Day off</option>
            <option value="vac">Vacation</option>
          </select>
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Reason (optional)"
          className="min-w-0 flex-1 self-stretch rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button onClick={submit} className="self-stretch rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
          Request
        </button>
      </div>

      {resolved.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Decided ({resolved.length})</summary>
          <div className="mt-2 divide-y divide-black/5">
            {resolved.slice(0, 12).map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="font-bold text-ink">{nameOf(r.userId)}</span>
                <span className="text-muted">
                  {r.dates.length <= 1 ? fmtMD(r.dates[0] ?? '') : `${fmtMD(r.dates[0])} – ${fmtMD(r.dates[r.dates.length - 1])}`}
                </span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-extrabold ${r.status === 'granted' ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'}`}>
                  {r.status === 'granted' ? `granted · ${r.type === 'vac' ? 'VAC' : 'R✓'}` : 'denied'}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  )
}
