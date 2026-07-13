import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Printer, Lock, LockOpen, CheckCircle2 } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { requirePin, usePin } from '../lib/pin'
import { DEFAULT_USERS, type User } from '../lib/users'

/** week map: weekStart(YYYY-MM-DD, Monday) -> userId -> 7 shift codes (Mon..Sun) */
type AllWeeks = Record<string, Record<string, string[]>>

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Shift codes per the handoff: O open · C close · M mid · OFF · RO requested off · R✓ granted
const CODES = ['', 'O', 'C', 'M', 'OFF', 'RO', 'R✓'] as const
const CODE_LABEL: Record<string, string> = {
  '': '—', O: 'O · open', C: 'C · close', M: 'M · mid', OFF: 'OFF', RO: 'RO · req. off', 'R✓': 'R✓ · granted',
}

function mondayOf(dateIso: string, offsetWeeks = 0): string {
  const d = new Date(dateIso + 'T12:00:00')
  const shift = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shift + offsetWeeks * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayOfWeek(weekStart: string, i: number): string {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + i)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * Mgr Schedule (handoff spec): rows come from Admin → Users & privileges;
 * shifts are the prototype's dropdown codes; the grid is read-only until
 * unlocked with a GM/Admin PIN (20 min), and each week is published
 * explicitly — a draft banner shows until then.
 */
export function Schedule() {
  const [users] = usePersistentState<User[]>('users:list', DEFAULT_USERS)
  const [weeks, setWeeks] = usePersistentState<AllWeeks>('mgrsched:weeks', {})
  const [published, setPublished] = usePersistentState<Record<string, boolean>>('mgrsched:published', {})
  const [offset, setOffset] = useState(0)
  const unlocked = usePin((s) => Date.now() < s.unlockedUntil)
  const unlockedBy = usePin((s) => s.unlockedBy)
  const lock = usePin((s) => s.lock)

  const weekStart = useMemo(() => mondayOf(today(), offset), [offset])
  const prevStart = useMemo(() => mondayOf(today(), offset - 1), [offset])
  const grid = weeks[weekStart] ?? {}
  const isPublished = !!published[weekStart]

  const setCell = (uid: string, day: number, value: string) =>
    setWeeks((w) => {
      const week = { ...(w[weekStart] ?? {}) }
      const row = [...(week[uid] ?? Array(7).fill(''))]
      row[day] = value
      week[uid] = row
      return { ...w, [weekStart]: week }
    })

  const copyLastWeek = async () => {
    if (!(await requirePin('Copy last week into this one'))) return
    setWeeks((w) => (w[prevStart] ? { ...w, [weekStart]: structuredClone(w[prevStart]) } : w))
  }

  const publish = async () => {
    if (!(await requirePin(isPublished ? 'Unpublish this week' : 'Publish this week'))) return
    setPublished((p) => ({ ...p, [weekStart]: !isPublished }))
  }

  const weekLabel = new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <>
      <PageHeader
        title="Mgr Schedule"
        subtitle={`Week of ${weekLabel} · ${users.length} manager${users.length === 1 ? '' : 's'} · ${isPublished ? 'published' : 'draft'}`}
        right={
          <div className="flex items-center gap-1.5 print:hidden">
            <button onClick={() => setOffset((o) => o - 1)} aria-label="Previous week" className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink">
              <ChevronLeft size={16} />
            </button>
            {offset !== 0 && (
              <button onClick={() => setOffset(0)} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-ink">
                Today
              </button>
            )}
            <button onClick={() => setOffset((o) => o + 1)} aria-label="Next week" className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => window.print()} aria-label="Print" className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink">
              <Printer size={15} />
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Lock / publish bar */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {unlocked ? (
            <button
              onClick={lock}
              className="inline-flex items-center gap-1.5 rounded-lg bg-up/10 px-3 py-2 text-sm font-semibold text-up"
            >
              <LockOpen size={14} /> Editing as {unlockedBy} — tap to lock
            </button>
          ) : (
            <button
              onClick={() => requirePin('Edit the schedule')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink"
            >
              <Lock size={14} /> Unlock to edit
            </button>
          )}
          <button
            onClick={publish}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
              isPublished ? 'bg-up/10 text-up' : 'bg-brand text-white'
            }`}
          >
            <CheckCircle2 size={14} /> {isPublished ? 'Published ✓' : 'Publish week'}
          </button>
          {weeks[prevStart] && !weeks[weekStart] && (
            <button
              onClick={copyLastWeek}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink"
            >
              <Copy size={14} /> Copy last week
            </button>
          )}
          <Link to="/users" className="ml-auto text-sm font-semibold text-brand">
            Manage roster →
          </Link>
        </div>

        {!isPublished && (
          <Card className="border-warn/30 bg-warn/5 px-4 py-2.5 text-xs font-semibold text-ink/70 print:hidden">
            Draft — the team sees this week once you hit Publish.
          </Card>
        )}

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/[0.02] text-left">
                <th className="px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-muted">Manager</th>
                {DOW.map((d, i) => (
                  <th key={d} className="px-1.5 py-2.5 text-center text-xs font-extrabold uppercase tracking-wide text-muted">
                    {d}
                    <span className="block text-[9px] font-semibold text-muted/70">{dayOfWeek(weekStart, i)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="font-semibold text-ink">{m.name}</div>
                    <div className="text-[10px] text-muted">{m.role}</div>
                  </td>
                  {DOW.map((_, i) => {
                    const v = grid[m.id]?.[i] ?? ''
                    return (
                      <td key={i} className="p-1 text-center">
                        {unlocked ? (
                          <select
                            value={v}
                            onChange={(e) => setCell(m.id, i, e.target.value)}
                            className={`w-full min-w-16 rounded-md border px-1 py-1.5 text-center text-xs font-semibold outline-none focus:border-brand ${cellTone(v)}`}
                          >
                            {CODES.map((c) => (
                              <option key={c} value={c}>
                                {CODE_LABEL[c]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-block w-full min-w-16 rounded-md border px-1 py-1.5 text-xs font-semibold ${cellTone(v)}`}>
                            {v || '—'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <p className="text-center text-xs text-muted print:hidden">
          O open · C close · M mid · OFF · RO requested off · R✓ granted. Unlock with a GM,
          Area Director, or Admin PIN (Users &amp; privileges).
        </p>
      </div>
    </>
  )
}

function cellTone(v: string): string {
  if (v === 'O') return 'border-up/25 bg-up/10 text-up'
  if (v === 'C') return 'border-navy/20 bg-navy/5 text-navy'
  if (v === 'M') return 'border-brand/25 bg-brand/10 text-ink'
  if (v === 'OFF') return 'border-black/5 bg-black/[0.03] text-muted'
  if (v === 'RO') return 'border-warn/30 bg-warn/10 text-ink/70'
  if (v === 'R✓') return 'border-up/25 bg-up/5 text-up'
  return 'border-black/10 bg-white text-muted'
}
