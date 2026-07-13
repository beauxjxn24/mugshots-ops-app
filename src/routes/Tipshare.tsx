import { useMemo, useState } from 'react'
import { HandCoins, ClipboardCheck, Undo2 } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { requirePin, usePin } from '../lib/pin'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import type { Person } from '../lib/staff'

interface Entry {
  id: string
  name: string
  role: 'Bar' | 'Expo' | 'Host'
  hours: number
  /** Manager-approved pickup stamp (handoff spec): who approved, when. */
  pickedUp?: { by: string; at: string }
}

/** A logged shift — kept with a full audit trail (who logged/reopened, when). */
interface Shift {
  id: string
  date: string
  pool: number
  entries: Entry[]
  events: string[]
}

const ROLES: Entry['role'][] = ['Bar', 'Expo', 'Host']
const ROLE_FROM_STAFF: Record<string, Entry['role']> = {
  Bartender: 'Bar',
  Expo: 'Expo',
  Host: 'Host',
}
const money = (n: number) => `$${n.toFixed(2)}`
const now = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
let seq = 0

export function Tipshare() {
  const [pool, setPool] = usePersistentState<number>('tips:pool', 0)
  const [entries, setEntries] = usePersistentState<Entry[]>('tips:entries', [])
  const [shifts, setShifts] = usePersistentState<Shift[]>('tips:shifts', [])
  const [staff] = usePersistentState<Person[]>('staff:list', [])
  const [name, setName] = useState('')
  const [role, setRole] = useState<Entry['role']>('Bar')
  const [hours, setHours] = useState('')
  const [showLog, setShowLog] = useState(false)
  const manager = usePin((s) => s.unlockedBy)

  // Picking a name from the roster auto-sets their tip role.
  const onName = (v: string) => {
    setName(v)
    const match = staff.find((s) => s.name.toLowerCase() === v.toLowerCase())
    if (match && ROLE_FROM_STAFF[match.role]) setRole(ROLE_FROM_STAFF[match.role])
  }

  const totalHours = useMemo(() => entries.reduce((s, e) => s + (e.hours || 0), 0), [entries])
  const perHour = totalHours > 0 ? pool / totalHours : 0

  const add = () => {
    const h = parseFloat(hours)
    if (!name.trim() || !Number.isFinite(h) || h <= 0) return
    setEntries((es) => [...es, { id: `t${++seq}-${Date.now()}`, name: name.trim(), role, hours: h }])
    setName('')
    setHours('')
  }

  // Manager-approved pickup: stamps who approved + time (audit trail).
  const pickup = async (id: string) => {
    if (!(await requirePin('Approve a tip pickup'))) return
    const by = usePin.getState().unlockedBy || 'Manager'
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, pickedUp: { by, at: now() } } : e)))
  }

  // Manager sign-off closes the shift into the log; the pool resets.
  const logShift = async () => {
    if (entries.length === 0) return
    if (!(await requirePin('Log this shift'))) return
    const by = usePin.getState().unlockedBy || 'Manager'
    // If this shift was reopened for a correction, keep its earlier trail.
    let trail: string[] = []
    try {
      trail = JSON.parse(sessionStorage.getItem('tips:reopen-trail') ?? '[]')
      sessionStorage.removeItem('tips:reopen-trail')
    } catch {
      /* no prior trail */
    }
    setShifts((s) => [
      {
        id: `s${Date.now()}`,
        date: today(),
        pool,
        entries,
        events: [...trail, `Logged by ${by} · ${now()}`],
      },
      ...s,
    ])
    setEntries([])
    setPool(0)
  }

  // Corrections require a manager: reopening moves the shift back live and
  // stamps the audit trail (kept on the shift when it is re-logged).
  const reopen = async (shift: Shift) => {
    if (!(await requirePin('Reopen a logged shift (correction)'))) return
    const by = usePin.getState().unlockedBy || 'Manager'
    if (entries.length > 0) {
      alert('Finish or log the current shift before reopening an old one.')
      return
    }
    setPool(shift.pool)
    setEntries(shift.entries)
    setShifts((s) => s.filter((x) => x.id !== shift.id))
    // Preserve the trail for when it's logged again.
    sessionStorage.setItem('tips:reopen-trail', JSON.stringify([...shift.events, `Reopened by ${by} · ${now()}`]))
  }

  return (
    <>
      <PageHeader
        title="Tipshare"
        subtitle={`Pooled tips split by hours worked · ${today()}`}
        right={
          entries.length > 0 && (
            <div className="flex gap-1.5">
              <button
                onClick={logShift}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
              >
                <ClipboardCheck size={14} /> Log shift
              </button>
              <button
                onClick={async () => {
                  if (await confirmDelete('Clear all entries and the pool without logging?', 'Nothing is saved to the shift log.', 'Clear')) {
                    setEntries([])
                    setPool(0)
                  }
                }}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-down"
              >
                Clear
              </button>
            </div>
          )
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Pool */}
        <Card className="p-5">
          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            Total tip pool
          </label>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-3xl font-semibold text-brand">$</span>
            <input
              type="number"
              inputMode="decimal"
              value={pool || ''}
              onChange={(e) => setPool(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-40 border-b-2 border-brand bg-transparent font-display text-3xl font-semibold text-ink outline-none"
            />
            <div className="ml-auto text-right text-sm text-muted">
              <div>
                {entries.length} staff · {totalHours.toFixed(2)} hrs
              </div>
              <div>
                <b className="text-ink">{money(perHour)}</b> / hour
              </div>
            </div>
          </div>
        </Card>

        {/* Add entry */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Name"
              list="tip-staff"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <datalist id="tip-staff">
              {staff.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Entry['role'])}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input
              type="number"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Hrs"
              className="w-20 rounded-lg border border-black/10 bg-white px-3 py-2 text-center text-sm outline-none focus:border-brand"
            />
            <button
              onClick={add}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Add
            </button>
          </div>
        </Card>

        {/* Payouts */}
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Add staff and their hours — payouts calculate automatically.
          </p>
        ) : (
          <Card className="divide-y divide-black/5">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{e.name}</div>
                  <div className="text-xs text-muted">
                    {e.role} · {e.hours} hrs
                    {e.pickedUp && (
                      <span className="ml-2 rounded-full bg-up/10 px-1.5 py-0.5 text-[10px] font-bold text-up">
                        picked up ✓ {e.pickedUp.by} · {e.pickedUp.at}
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-display text-lg font-semibold text-up">
                  {money(perHour * e.hours)}
                </div>
                {!e.pickedUp && (
                  <button
                    onClick={() => pickup(e.id)}
                    title="Manager-approved pickup"
                    className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs font-bold text-brand hover:bg-brand hover:text-white"
                  >
                    <HandCoins size={13} /> Pick up
                  </button>
                )}
                <button
                  onClick={async () => { if (await confirmDelete(`Remove ${e.name}?`)) setEntries((es) => es.filter((x) => x.id !== e.id)) }}
                  aria-label={`Remove ${e.name}`}
                  className="text-muted hover:text-down"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between p-4 font-semibold">
              <span className="text-muted">Distributed</span>
              <span className="font-display text-lg text-ink">{money(perHour * totalHours)}</span>
            </div>
          </Card>
        )}

        {/* Shift log + audit trail */}
        {shifts.length > 0 && (
          <div>
            <button onClick={() => setShowLog((v) => !v)} className="mb-2 px-1 text-xs font-semibold text-muted">
              Shift log ({shifts.length}) · {showLog ? 'Hide' : 'Show'}
            </button>
            {showLog && (
              <div className="space-y-2">
                {shifts.map((s) => {
                  const hrs = s.entries.reduce((t2, e) => t2 + e.hours, 0)
                  return (
                    <Card key={s.id} className="p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-ink">{s.date}</span>
                        <span className="font-display text-lg font-semibold text-brand">{money(s.pool)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {s.entries.length} staff · {hrs.toFixed(2)} hrs ·{' '}
                        {s.entries.filter((e) => e.pickedUp).length}/{s.entries.length} picked up
                      </div>
                      <div className="mt-2 space-y-0.5">
                        {s.events.map((ev, i) => (
                          <div key={i} className="text-[11px] text-muted">
                            · {ev}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => reopen(s)}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink"
                      >
                        <Undo2 size={12} /> Reopen (correction)
                      </button>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {manager && (
          <p className="text-center text-[11px] text-muted">Manager unlocked: {manager}</p>
        )}
      </div>
    </>
  )
}
