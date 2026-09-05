import { useMemo, useState } from 'react'
import { Lock, Undo2, ChevronDown, HandCoins } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { requirePin, usePin } from '../lib/pin'
import { Page, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useShift } from '../lib/shift'
import { entryColumn, entryField } from '../lib/nextfield'
import type { Person } from '../lib/staff'

interface Entry {
  id: string
  name: string
  role: 'Bar' | 'Expo' | 'Host'
  hours: number
  /** Manager-approved pickup stamp (handoff spec): who approved, when. */
  pickedUp?: { by: string; at: string }
}
/**
 * A name on the sheet you can fix.
 *
 * Both lists let you type an amount and delete a row, but the name itself was
 * set once when it was added — so a typo, or the wrong Katie, meant deleting
 * the line and re-entering it, losing the hours or the tip-out already keyed
 * against it. Tap the name, fix it, Enter.
 */
function EditableName({
  value,
  options,
  onChange,
  children,
}: {
  value: string
  options: string[]
  onChange: (name: string) => void
  children?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const listId = `names-${value.replace(/\W+/g, '')}`
  if (!editing) {
    return (
      <span className="min-w-0">
        <button
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          title="Tap to fix this name"
          className="block max-w-full truncate text-left font-semibold hover:underline"
        >
          {value}
        </button>
        {children}
      </span>
    )
  }
  const commit = () => {
    const next = draft.trim()
    if (next && next !== value) onChange(next)
    setEditing(false)
  }
  return (
    <span className="min-w-0">
      <input
        autoFocus
        value={draft}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        aria-label={`Name — ${value}`}
        className="w-full rounded-md border border-white/30 bg-white/10 px-1.5 py-0.5 text-sm font-semibold text-white outline-none focus:border-white"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </span>
  )
}

interface ServerOut {
  id: string
  name: string
  amount: number
}
type Meal = 'AM' | 'PM'

/** A logged shift — kept with a full audit trail (who logged/reopened, when). */
interface Shift {
  id: string
  date: string
  meal?: Meal
  pool: number
  servers?: ServerOut[]
  entries: Entry[]
  events: string[]
}

interface Live {
  date: string
  meal: Meal
  servers: ServerOut[]
  entries: Entry[]
}
const EMPTY_LIVE: Live = { date: '', meal: 'AM', servers: [], entries: [] }

const ROLE_FROM_STAFF: Record<string, Entry['role']> = { Bartender: 'Bar', Expo: 'Expo', Host: 'Host' }
const money = (n: number) => `$${(n ?? 0).toFixed(2)}`

/**
 * What a person actually gets handed, to the dollar.
 *
 * Tip-out is paid in cash out of the drawer and nobody is counting quarters at
 * one in the morning — $1.54 goes out as $2. The rounding happens at the point
 * of payment rather than to the rate, so each person's share still tracks the
 * hours they worked; the couple of dollars of drift against the pool is shown
 * on the totals instead of being buried.
 */
const payout = (n: number) => Math.round(n ?? 0)
const whole = (n: number) => `$${payout(n)}`
const now = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
let seq = 0


// Command Deck: dark glass cards (matches the app), role-colored dots + Add buttons.
const SLATE = 'border border-white/10 !bg-white/[0.045] text-ink backdrop-blur-xl'
const ROLE_CARDS: Array<{ role: Entry['role']; title: string; hint: string; dot: string; btn: string }> = [
  { role: 'Bar', title: 'Bartenders', hint: 'Add bartenders.', dot: 'bg-brand', btn: 'bg-navy' },
  { role: 'Expo', title: 'Expos', hint: 'Add expos.', dot: 'bg-warn', btn: 'bg-navy' },
  { role: 'Host', title: 'Hosts', hint: 'Add hosts.', dot: 'bg-up', btn: 'bg-navy' },
]

export function Tipshare() {
  const t = today()
  const [live, setLive] = usePersistentState<Live>('tips:live', EMPTY_LIVE)
  const [rawShifts, setShifts] = usePersistentState<Shift[]>('tips:shifts', [])
  const shifts = Array.isArray(rawShifts) ? rawShifts : []
  const [staff] = usePersistentState<Person[]>('staff:list', [])
  const [viewDate, setViewDate] = useState(t)
  const [safeOpen, setSafeOpen] = useState(false)
  const manager = usePin((s) => s.unlockedBy)
  const { shift } = useShift()

  // A new day starts fresh (yesterday's unlogged pool doesn't leak forward), on
  // whichever shift the app is actually on — opening this at seven in the
  // evening and landing on lunch was one more thing to correct before starting.
  // The lock below still applies: dinner doesn't open until lunch is signed off.
  const rawCur: Live = live.date === t ? live : { ...EMPTY_LIVE, date: t, meal: shift }
  const cur: Live = {
    ...rawCur,
    entries: Array.isArray(rawCur.entries) ? rawCur.entries : [],
    servers: Array.isArray(rawCur.servers) ? rawCur.servers : [],
  }
  const setCur = (patch: Partial<Live>) => setLive({ ...cur, ...patch })

  const amLogged = shifts.some((s) => s.date === t && (s.meal ?? 'AM') === 'AM')
  const meal: Meal = cur.meal === 'PM' && !amLogged ? 'AM' : cur.meal

  const pool = useMemo(() => cur.servers.reduce((s, x) => s + x.amount, 0), [cur.servers])
  const totalHours = useMemo(() => cur.entries.reduce((s, e) => s + (e.hours || 0), 0), [cur.entries])
  const perHour = totalHours > 0 ? pool / totalHours : 0
  // Both sides are sums of what actually gets handed over, so they add up to
  // the same money the safe is holding — not to the raw pool, which is a cent
  // or two off once every share is rounded to the dollar.
  const pickedUp = cur.entries.filter((e) => e.pickedUp).reduce((s, e) => s + payout(perHour * e.hours), 0)
  const notPicked = cur.entries.filter((e) => !e.pickedUp).reduce((s, e) => s + payout(perHour * e.hours), 0)
  const paidOut = pickedUp + notPicked

  // Tip-out Safe: everything earned but not yet picked up, across ALL shifts.
  const safe = useMemo(() => {
    const rows: Array<{ shiftId: string | null; entryId: string; name: string; amount: number; when: string }> = []
    for (const s of shifts) {
      const sEntries = Array.isArray(s.entries) ? s.entries : []
      const hrs = sEntries.reduce((x, e) => x + e.hours, 0)
      const rate = hrs > 0 ? s.pool / hrs : 0
      for (const e of sEntries)
        if (!e.pickedUp && payout(rate * e.hours) > 0)
          rows.push({ shiftId: s.id, entryId: e.id, name: e.name, amount: payout(rate * e.hours), when: `${s.date} ${s.meal ?? ''}` })
    }
    for (const e of cur.entries)
      if (!e.pickedUp && payout(perHour * e.hours) > 0)
        rows.push({ shiftId: null, entryId: e.id, name: e.name, amount: payout(perHour * e.hours), when: 'this shift' })
    return rows
  }, [shifts, cur.entries, perHour])
  const safeTotal = safe.reduce((s, r) => s + r.amount, 0)

  // Manager-approved pickup — works on the live shift and on logged ones.
  const pickup = async (shiftId: string | null, entryId: string) => {
    if (!(await requirePin('Approve a tip pickup', 'tips'))) return
    const by = usePin.getState().unlockedBy || 'Manager'
    const stamp = { by, at: now() }
    if (shiftId === null) {
      setCur({ entries: cur.entries.map((e) => (e.id === entryId ? { ...e, pickedUp: stamp } : e)) })
    } else {
      setShifts((ss) =>
        ss.map((s) =>
          s.id === shiftId ? { ...s, entries: s.entries.map((e) => (e.id === entryId ? { ...e, pickedUp: stamp } : e)) } : s,
        ),
      )
    }
  }

  // Manager sign-off closes the meal into the log; lunch sign-off opens dinner.
  const logShift = async () => {
    if (cur.entries.length === 0 && cur.servers.length === 0) return
    if (!(await requirePin(`Log ${meal === 'AM' ? 'lunch' : 'dinner'} tip-out`, 'tips'))) return
    const by = usePin.getState().unlockedBy || 'Manager'
    let trail: string[] = []
    try {
      trail = JSON.parse(sessionStorage.getItem('tips:reopen-trail') ?? '[]')
      sessionStorage.removeItem('tips:reopen-trail')
    } catch {
      /* no prior trail */
    }
    setShifts((s) => [
      { id: `s${Date.now()}`, date: t, meal, pool, servers: cur.servers, entries: cur.entries, events: [...trail, `Logged by ${by} · ${now()}`] },
      ...s,
    ])
    setLive({ date: t, meal: meal === 'AM' ? 'PM' : 'AM', servers: [], entries: [] })
  }

  // Corrections require a manager; the audit trail survives re-logging.
  const reopen = async (shift: Shift) => {
    if (!(await requirePin('Reopen a logged shift (correction)', 'tips'))) return
    const by = usePin.getState().unlockedBy || 'Manager'
    if (cur.entries.length > 0 || cur.servers.length > 0) {
      alert('Finish or log the current shift before reopening an old one.')
      return
    }
    setLive({ date: t, meal: shift.meal ?? 'AM', servers: shift.servers ?? [], entries: shift.entries })
    setShifts((s) => s.filter((x) => x.id !== shift.id))
    sessionStorage.setItem('tips:reopen-trail', JSON.stringify([...shift.events, `Reopened by ${by} · ${now()}`]))
  }

  const dayShifts = shifts.filter((s) => s.date === viewDate)
  const titleDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
      <Page
        title={`Tipshare · ${titleDate}`}
        subtitle="Logged & corrected with manager sign-off — pick a past date to review or correct a closed shift"
        right={
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1">
              {(['AM', 'PM'] as Meal[]).map((m) => {
                const locked = m === 'PM' && !amLogged
                return (
                  <button
                    key={m}
                    disabled={locked}
                    onClick={() => setCur({ meal: m })}
                    className={`inline-flex items-center gap-1 rounded-md px-3.5 py-1.5 text-xs font-bold ${
                      meal === m ? 'bg-navy text-white shadow-sm' : locked ? 'text-muted/50' : 'text-muted'
                    }`}
                  >
                    {m}
                    {locked && <Lock size={10} />}
                  </button>
                )
              })}
            </div>
            <input
              type="date"
              value={viewDate}
              max={t}
              onChange={(e) => setViewDate(e.target.value || t)}
              className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs font-semibold outline-none focus:border-brand"
            />
          </div>
        }
      >
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          {/* Left: recipient role cards */}
          <div className="space-y-5">
            {ROLE_CARDS.map(({ role, title, hint, dot, btn }) => (
              <RoleCard
                key={role}
                title={title}
                hint={hint}
                dot={dot}
                btn={btn}
                entries={cur.entries.filter((e) => e.role === role)}
                perHour={perHour}
                staff={staff}
                roleOf={(nm) => ROLE_FROM_STAFF[staff.find((s) => s.name.toLowerCase() === nm.toLowerCase())?.role ?? ''] }
                onAdd={(nm, hrs) =>
                  setCur({ entries: [...cur.entries, { id: `t${++seq}-${Date.now()}`, name: nm, role, hours: hrs }] })
                }
                onRename={(e, nm) =>
                  setCur({ entries: cur.entries.map((x) => (x.id === e.id ? { ...x, name: nm } : x)) })
                }
                onHours={(e, hrs) =>
                  setCur({ entries: cur.entries.map((x) => (x.id === e.id ? { ...x, hours: hrs } : x)) })
                }
                onRemove={async (e) => {
                  if (await confirmDelete(`Remove ${e.name}?`)) setCur({ entries: cur.entries.filter((x) => x.id !== e.id) })
                }}
                onPickup={(e) => pickup(null, e.id)}
              />
            ))}
          </div>

          {/* Right: servers tip-out + shift totals */}
          <div className="space-y-5">
            <ServersCard
              servers={cur.servers}
              onAdd={(nm, amt) => setCur({ servers: [...cur.servers, { id: `sv${++seq}-${Date.now()}`, name: nm, amount: amt }] })}
              onRename={(sv, nm) =>
                setCur({ servers: cur.servers.map((x) => (x.id === sv.id ? { ...x, name: nm } : x)) })
              }
              onAmount={(sv, amt) =>
                setCur({ servers: cur.servers.map((x) => (x.id === sv.id ? { ...x, amount: amt } : x)) })
              }
              onRemove={async (sv) => {
                if (await confirmDelete(`Remove ${sv.name}'s tip-out?`)) setCur({ servers: cur.servers.filter((x) => x.id !== sv.id) })
              }}
              staff={staff}
            />

            <Card className={`${SLATE} p-4`}>
              <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-white/70">
                Shift totals · {meal}
              </div>
              <TotalRow label="Pool" value={money(pool)} gold />
              <TotalRow label="Recipient hours" value={totalHours.toFixed(2)} />
              <TotalRow label="Rate / hour" value={money(perHour)} gold />
              <div className="my-2 border-t border-white/15" />
              <TotalRow label="Picked up" value={whole(pickedUp)} strong />
              <TotalRow label="Not yet picked up" value={whole(notPicked)} gold />
              {/* Every share is paid to the dollar, so the payouts rarely land
                  exactly on the pool. Shown rather than hidden — the drawer has
                  to balance and this is the line that explains it. */}
              {payout(paidOut - pool) !== 0 && totalHours > 0 && (
                <TotalRow
                  label={paidOut > pool ? 'Rounded up — out of drawer' : 'Rounded down — back to drawer'}
                  value={whole(Math.abs(paidOut - pool))}
                />
              )}
              <button
                onClick={logShift}
                disabled={cur.entries.length === 0 && cur.servers.length === 0}
                className="mt-3 w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                Log {meal === 'AM' ? 'lunch' : 'dinner'} tip-out
              </button>
              <p className="mt-1.5 text-center text-[11px] text-white/60">
                Manager signs off to lock {meal === 'AM' ? 'lunch & open dinner' : 'dinner'}
              </p>
            </Card>
          </div>
        </div>

        {/* Tip-out Safe */}
        <Card className="overflow-hidden">
          <button onClick={() => setSafeOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <Lock size={15} className="shrink-0 text-brand" />
            <span className="font-semibold text-ink">Tip-out Safe</span>
            <span className="text-xs text-muted">held until picked up · across all shifts</span>
            <span className={`ml-auto rounded-lg px-2.5 py-1 font-mono text-sm font-bold ${safeTotal > 0 ? 'bg-down/10 text-down' : 'bg-black/5 text-muted'}`}>
              {whole(safeTotal)}
            </span>
            <ChevronDown size={15} className={`text-muted transition-transform ${safeOpen ? 'rotate-180' : ''}`} />
          </button>
          {safeOpen &&
            (safe.length === 0 ? (
              <p className="border-t border-black/5 px-4 py-4 text-center text-xs text-muted">Nothing waiting — everyone's picked up.</p>
            ) : (
              <div className="border-t border-black/5">
                {safe.map((r) => (
                  <div key={`${r.shiftId}-${r.entryId}`} className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.name}</span>
                    <span className="text-xs text-muted">{r.when}</span>
                    <span className="font-mono text-sm font-bold text-ink">{whole(r.amount)}</span>
                    <button
                      onClick={() => pickup(r.shiftId, r.entryId)}
                      title="Manager-approved pickup"
                      className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs font-bold text-brand hover:bg-brand hover:text-white"
                    >
                      <HandCoins size={13} /> Pick up
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </Card>

        {/* Closed shifts for the picked date + audit trail */}
        {dayShifts.length > 0 && (
          <div>
            <div className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wide text-muted">
              Closed shifts · {viewDate}
            </div>
            <div className="space-y-2">
              {dayShifts.map((s) => {
                const sEntries = Array.isArray(s.entries) ? s.entries : []
                const hrs = sEntries.reduce((x, e) => x + e.hours, 0)
                return (
                  <Card key={s.id} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {s.date} {s.meal && <span className="ml-1 rounded bg-navy/10 px-1.5 py-0.5 text-[10px] font-bold text-ink">{s.meal}</span>}
                      </span>
                      <span className="font-display text-lg font-semibold text-brand">{money(s.pool)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {s.entries.length} staff · {hrs.toFixed(2)} hrs · {s.entries.filter((e) => e.pickedUp).length}/{s.entries.length} picked up
                      {s.servers?.length ? ` · ${s.servers.length} server tip-outs` : ''}
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
          </div>
        )}
        {viewDate !== t && dayShifts.length === 0 && (
          <p className="py-4 text-center text-xs text-muted">No closed shifts on {viewDate}.</p>
        )}
        {manager && <p className="text-center text-[11px] text-muted">Manager unlocked: {manager}</p>}
            </Page>
  )
}

function TotalRow({ label, value, gold, strong }: { label: string; value: string; gold?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-sm">
      <span className={strong ? 'font-bold text-white' : 'text-white/80'}>{label}</span>
      <span className={`font-mono font-bold ${gold ? 'text-warn' : 'text-white'}`}>{value}</span>
    </div>
  )
}

/** One steel-blue recipient card: Bartenders / Expos / Hosts. */
function RoleCard({
  title,
  hint,
  dot,
  btn,
  entries,
  perHour,
  staff,
  onAdd,
  onHours,
  onRename,
  onRemove,
  onPickup,
}: {
  title: string
  hint: string
  dot: string
  btn: string
  entries: Entry[]
  perHour: number
  staff: Person[]
  roleOf?: (name: string) => Entry['role'] | undefined
  onAdd: (name: string, hours: number) => void
  onHours: (e: Entry, hours: number) => void
  onRename: (e: Entry, name: string) => void
  onRemove: (e: Entry) => void
  onPickup: (e: Entry) => void
}) {
  const [name, setName] = useState('')
  const [hours, setHours] = useState('')
  // A name is all it takes. The shift is built at the start -- everyone who is
  // on tonight goes on the sheet -- and the hours are what gets typed at the
  // end, in one pass down the list. Requiring hours up front meant the sheet
  // couldn't be prepared, which is the opposite of how the shift runs.
  const why = !name.trim() ? 'Enter a name' : ''
  const add = () => {
    if (why) return
    const h = parseFloat(hours)
    onAdd(name.trim(), Number.isFinite(h) && h > 0 ? h : 0)
    setName('')
    setHours('')
  }
  const listId = `roster-${title}`
  return (
    <Card className={`${SLATE} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`size-2 rounded-full ${dot}`} />
        <span className="font-bold">{title}</span>
        <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-bold">{entries.length}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2 border-b border-white/15 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-white/60">
        <span>Name</span>
        <span className="text-right">Hrs</span>
        <span className="text-right">$</span>
      </div>
      <div {...entryColumn}>
      {entries.length === 0 ? (
        <p className="py-2 text-xs text-white/50">{hint}</p>
      ) : (
        entries.map((e) => (
          <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_64px_64px_auto] items-center gap-2 border-b border-white/10 py-1.5 text-sm last:border-0">
            <EditableName value={e.name} options={staff.map((p) => p.name)} onChange={(nm) => onRename(e, nm)}>
              {e.pickedUp && (
                <span className="block text-[10px] text-up">picked up ✓ {e.pickedUp.by} · {e.pickedUp.at}</span>
              )}
            </EditableName>
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              value={e.hours || ''}
              placeholder="—"
              onChange={(ev) => {
                const v = parseFloat(ev.target.value)
                onHours(e, Number.isFinite(v) && v > 0 ? v : 0)
              }}
              {...entryField('hours')}
              aria-label={`Hours for ${e.name}`}
              title="Hours worked — Enter jumps to the next name down"
              className={`w-full rounded-md border px-1 py-0.5 text-right font-mono text-xs outline-none ${
                e.hours > 0
                  ? 'border-transparent bg-white/10 text-white'
                  : 'border-warn/40 bg-transparent text-white placeholder:text-warn/60'
              }`}
            />
            <span className="text-right font-mono text-xs font-bold text-warn">{whole(perHour * e.hours)}</span>
            <span className="flex items-center gap-1">
              {!e.pickedUp && (
                <button
                  onClick={() => onPickup(e)}
                  title="Manager-approved pickup"
                  aria-label={`Pick up for ${e.name}`}
                  // hover:text-navy, not left white: the hover fills this with
                  // solid gold, and the icon would vanish into it.
                  className="grid size-6 place-items-center rounded-md bg-white/10 text-white/80 hover:bg-brand hover:text-navy"
                >
                  <HandCoins size={12} />
                </button>
              )}
              <button onClick={() => onRemove(e)} aria-label={`Remove ${e.name}`} className="text-white/50 hover:text-white">
                ✕
              </button>
            </span>
          </div>
        ))
      )}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Name"
          list={listId}
          className="min-w-0 flex-1 rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink outline-none"
        />
        <datalist id={listId}>
          {staff.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        <input
          type="number"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Hrs·later"
          className="w-16 rounded-lg border-0 bg-white px-2 py-2 text-center text-sm text-ink outline-none"
        />
        <button
          onClick={add}
          disabled={!!why}
          title={why || `Add to ${title}`}
          className={`rounded-lg ${btn} px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40`}
        >
          Add
        </button>
      </div>
      {(name.trim() || hours.trim()) && why && (
        <p className="mt-1.5 text-[11px] font-semibold text-warn">{why} to add them.</p>
      )}
    </Card>
  )
}

/** Servers — each server and the amount they tip out; the sum IS the pool. */
function ServersCard({
  servers,
  staff,
  onAdd,
  onAmount,
  onRename,
  onRemove,
}: {
  servers: ServerOut[]
  staff: Person[]
  onAdd: (name: string, amount: number) => void
  onAmount: (s: ServerOut, amount: number) => void
  onRename: (s: ServerOut, name: string) => void
  onRemove: (s: ServerOut) => void
}) {
  const [name, setName] = useState('')
  const [amt, setAmt] = useState('')
  // Same as the hours: the servers go on the sheet when the shift starts, the
  // tip-out is what gets entered when they cash out.
  const why = !name.trim() ? 'Enter a name' : ''
  const add = () => {
    if (why) return
    const a = parseFloat(amt)
    onAdd(name.trim(), Number.isFinite(a) && a > 0 ? a : 0)
    setName('')
    setAmt('')
  }
  return (
    <Card className={`${SLATE} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2 rounded-full bg-warn" />
        <span className="font-bold">Servers — Tip-out</span>
        <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-bold">{servers.length}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2 border-b border-white/15 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-white/60">
        <span>Server</span>
        <span className="text-right">Tip-out $</span>
      </div>
      <div {...entryColumn}>
      {servers.length === 0 ? (
        <p className="py-2 text-xs text-white/50">Add each server and the amount they tip out.</p>
      ) : (
        servers.map((s) => (
          <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-2 border-b border-white/10 py-1.5 text-sm last:border-0">
            <EditableName value={s.name} options={staff.map((p) => p.name)} onChange={(nm) => onRename(s, nm)} />
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={s.amount || ''}
              placeholder="—"
              onChange={(ev) => {
                const v = parseFloat(ev.target.value)
                onAmount(s, Number.isFinite(v) && v > 0 ? v : 0)
              }}
              {...entryField('tipout')}
              aria-label={`Tip-out for ${s.name}`}
              title="Tip-out — Enter jumps to the next server down"
              className={`w-full rounded-md border px-1 py-0.5 text-right font-mono text-xs font-bold outline-none ${
                s.amount > 0
                  ? 'border-transparent bg-white/10 text-warn'
                  : 'border-warn/40 bg-transparent text-warn placeholder:text-warn/60'
              }`}
            />
            <button onClick={() => onRemove(s)} aria-label={`Remove ${s.name}`} className="text-white/50 hover:text-white">
              ✕
            </button>
          </div>
        ))
      )}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Server name"
          list="roster-servers"
          className="min-w-0 flex-1 rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink outline-none"
        />
        <datalist id="roster-servers">
          {staff.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        <input
          type="number"
          inputMode="decimal"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="$·later"
          className="w-20 rounded-lg border-0 bg-white px-2 py-2 text-center text-sm text-ink outline-none"
        />
        <button
          onClick={add}
          disabled={!!why}
          title={why || 'Add this tip-out'}
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {(name.trim() || amt.trim()) && why && (
        <p className="mt-1.5 text-[11px] font-semibold text-warn">{why} to add the tip-out.</p>
      )}
    </Card>
  )
}
