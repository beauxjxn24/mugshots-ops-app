import { useEffect, useMemo, useState } from 'react'
import { Pencil, Check } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import {
  SIDEWORK,
  ROLES,
  phasesFor,
  BAR_WEEKLY,
  SPEED_POUR_DAYS,
  BAR_WEEKLY_NOTE,
  type Role,
  type Section,
} from '../lib/sidework'
import { rolesOf, type Person } from '../lib/staff'
import { useRole } from '../lib/role'
import { shiftPerson } from '../lib/daycode'
import { CutPlanner, type Duty } from '../components/CutPlanner'
import {
  cutFor,
  dealEvenly,
  dutiesForCut,
  dutyId,
  emptyPlan,
  isReleased,
  planKey,
  type ShiftPlan,
} from '../lib/shiftcuts'

type Data = Record<Role, Record<string, Section[]>>

const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** Monday-first index for a yyyy-mm-dd date, matching the prep sheet. */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

export function Sidework() {
  // Editable copy of the duty sheet, persisted to the device.
  const [data, setData] = usePersistentState<Data>('sidework:data', SIDEWORK)
  const [role, setRole] = useState<Role>('Server')
  const phases = phasesFor(role)
  const [phase, setPhase] = useState<string>(phases[0])
  // Per-tile editing (owner request): the pencil lives on each section card.
  // Tracked by position, not by name: keying off the title meant renaming a tile
  // changed the very value being compared, so a tile stopped being "the one
  // being edited" halfway through typing its new name.
  const [editingSec, setEditingSec] = useState<number | null>(null)
  const [done, setDone] = usePersistentState<Record<string, boolean>>(`sidework:done:${today()}`, {})
  const [adding, setAdding] = useState<Record<number, string>>({})
  // Closer sign-off, keyed by role|phase and dated like the checkmarks are.
  const [verified, setVerified] = usePersistentState<
    Record<string, { init: string; at: string; done: number; total: number }>
  >(`sidework:verified:${today()}`, {})
  const [vInit, setVInit] = useState('')
  const weekdayIdx = weekdayOf(today())
  const viewerRole = useRole((r) => r.role)
  const isCloser = viewerRole !== 'staff'
  // Tonight's deal, per role and phase. The duty sheet is the library; this is
  // who has what, and it only lasts the day.
  const [plans, setPlans] = usePersistentState<Record<string, ShiftPlan>>(planKey(today()), {})
  // Who is on each tile tonight, keyed role|phase|position and dated — an
  // assignment is for one shift, not a standing property of the duty sheet.
  const [assigned, setAssigned] = usePersistentState<Record<string, string>>(
    `sidework:assigned:${today()}`,
    {},
  )
  const [staff] = usePersistentState<Person[]>('staff:list', [])
  // Whoever holds the code for the role being viewed — a Server tile offers the
  // servers, not all seventy-one people on the roster. The duty sheet's tab is
  // "Bar" while the roster's job code is "Bartender", so the two are bridged
  // here rather than the picker coming up empty.
  const crew = useMemo(() => {
    const code = role === 'Bar' ? 'Bartender' : role
    return staff
      .filter((p) => rolesOf(p).includes(code))
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b))
  }, [staff, role])
  const aKey = (si: number) => `${role}|${activePhase}|${si}`

  const activePhase = phases.includes(phase) ? phase : phases[0]
  const sections = data[role]?.[activePhase] ?? []

  // One-time: the bar's phases were Opening / Closing before the real laminated
  // sheet went in, and are AM / PM now. A stored copy keyed by the old names
  // would read as an empty list, so carry it across.
  useEffect(() => {
    setData((d) => {
      const bar = d?.Bar as Record<string, Section[]> | undefined
      if (!bar || (!bar.Opening && !bar.Closing)) return d
      const next: Record<string, Section[]> = { ...bar }
      if (bar.Opening && !bar.AM) next.AM = bar.Opening
      if (bar.Closing && !bar.PM) next.PM = bar.Closing
      delete next.Opening
      delete next.Closing
      return { ...d, Bar: next } as Data
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-time: the sheet's sections ran 1, 2, 3, 4, 6 — there was never a
  // Section 5, so the boxes didn't read as a set. Stored copies get the
  // renumber too; a renamed box ("Cut 3") is left alone.
  useEffect(() => {
    setData((d) => {
      let changed = false
      const next: Data = { ...d }
      for (const r of Object.keys(next) as Role[]) {
        for (const ph of Object.keys(next[r] ?? {})) {
          const secs = next[r][ph] ?? []
          if (secs.some((s) => s.section === 'Section 6') && !secs.some((s) => s.section === 'Section 5')) {
            changed = true
            next[r] = {
              ...next[r],
              [ph]: secs.map((s) =>
                s.section === 'Section 6'
                  ? { ...s, section: 'Section 5', tasks: s.tasks.map((t) => t.replace(/Section 6/g, 'Section 5')) }
                  : s,
              ),
            }
          }
        }
      }
      return changed ? next : d
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Section titles are editable (owner spec: some stores use names, not section
  // numbers — "Cut 1" rather than "Section 1").
  //
  // Takes the field exactly as typed. Trimming on every keystroke ate the space
  // the moment you typed it, so a two-word name could not be entered at all, and
  // rejecting an empty value meant you could not clear the field to start over.
  const renameSection = (si: number, title: string) =>
    setSections((secs) => secs.map((s, i) => (i === si ? { ...s, section: title } : s)))

  // Tidy up once, on the way out, rather than mid-word.
  const commitRename = (si: number, title: string) => {
    const name = title.trim() || `Section ${si + 1}`
    setSections((secs) => secs.map((s, i) => (i === si ? { ...s, section: name } : s)))
  }

  const key = (s: string, t: string) => `${role}|${activePhase}|${s}|${t}`
  const allTasks = useMemo(
    () => sections.flatMap((s) => s.tasks.map((t) => key(s.section, t))),
    [sections, role, activePhase],
  )
  const doneCount = allTasks.filter((k) => done[k]).length

  // Every duty on the sheet for this role and phase, flattened out of its
  // sections — the sections stay the library, the cuts are tonight's deal.
  const duties: Duty[] = useMemo(
    () =>
      sections.flatMap((sec) =>
        sec.tasks.map((t) => ({
          id: dutyId(role, activePhase, sec.section, t),
          task: t,
          section: sec.section,
        })),
      ),
    [sections, role, activePhase],
  )
  const planId = `${role}|${activePhase}`
  // Dealt evenly the first time this sheet is opened tonight, so the closer
  // starts with a working split rather than forty unassigned duties. Everything
  // is movable afterwards; the deal is a starting point, not a decision.
  const plan =
    plans[planId] ?? (duties.length > 0 ? dealEvenly(emptyPlan(), duties.map((d) => d.id)) : emptyPlan())
  const setPlan = (next: ShiftPlan) => setPlans((p) => ({ ...p, [planId]: next }))
  // Which cut the person signed in on this device is working.
  const myCut = cutFor(plan, shiftPerson())
  const myDuties = myCut ? dutiesForCut(plan, myCut, duties.map((d) => d.id)) : []
  const vKey = `${role}|${activePhase}`
  const vRec = verified[vKey]

  // ---- editing helpers (immutable updates on data[role][activePhase]) ----
  const setSections = (updater: (secs: Section[]) => Section[]) =>
    setData((d) => ({
      ...d,
      [role]: { ...d[role], [activePhase]: updater(d[role][activePhase] ?? []) },
    }))
  const editTask = (si: number, ti: number, text: string) =>
    setSections((secs) =>
      secs.map((s, i) =>
        i === si ? { ...s, tasks: s.tasks.map((t, j) => (j === ti ? text : t)) } : s,
      ),
    )
  const removeTask = async (si: number, ti: number, text: string) => {
    if (!(await confirmDelete(`Remove "${text}" from this duty sheet?`))) return
    setSections((secs) =>
      secs.map((s, i) => (i === si ? { ...s, tasks: s.tasks.filter((_, j) => j !== ti) } : s)),
    )
  }
  const addTask = (si: number) => {
    const text = (adding[si] ?? '').trim()
    if (!text) return
    setSections((secs) => secs.map((s, i) => (i === si ? { ...s, tasks: [...s.tasks, text] } : s)))
    setAdding((a) => ({ ...a, [si]: '' }))
  }
  // The default tile at this position, or undefined for a tile added beyond the
  // stock sheet — there is nothing to put back for one of those.
  const defaultAt = (si: number): Section | undefined => SIDEWORK[role]?.[activePhase]?.[si]

  // Reset just one tile's duties back to the default sheet.
  //
  // Matched by position. Matching the stored title against the default sheet's
  // title meant that renaming a tile — the whole point of the rename — left
  // nothing for the lookup to find, so the button silently did nothing.
  //
  // Restores the duties and keeps the tile's name: the name is the store's own
  // label ("Cut 1"), and resetting a duty list shouldn't undo the labelling.
  const resetSection = (si: number) => {
    const d = defaultAt(si)
    if (!d) return
    setSections((secs) => secs.map((s, i) => (i === si ? { ...s, tasks: [...d.tasks] } : s)))
  }
  // ---- closer sign-off ----------------------------------------------------
  // Signed per role + phase, per day: the closer verifies the Servers' close
  // separately from the Bartenders', and tomorrow starts unsigned.
  const verifySidework = async () => {
    const ini = vInit.trim().toUpperCase()
    if (!ini) {
      alert('Closer initials required to verify')
      return
    }
    const left = allTasks.length - doneCount
    if (left > 0) {
      const ok = await confirmDelete(
        `${left} ${left === 1 ? 'duty is' : 'duties are'} still unchecked`,
        'Sign off anyway? The shortfall is recorded with your initials.',
        'Verify anyway',
      )
      if (!ok) return
    }
    setVerified((v) => ({
      ...v,
      [vKey]: { init: ini, at: new Date().toISOString(), done: doneCount, total: allTasks.length },
    }))
    setVInit('')
  }

  const clearChecks = () =>
    setDone((d) => {
      const next = { ...d }
      allTasks.forEach((k) => delete next[k])
      return next
    })

  const byId = new Map(duties.map((d) => [d.id, d]))

  // A server sees the cut they were dealt, and nothing else. The full sheet is
  // the closer's tool -- handing a server forty duties to find their six in is
  // how the list stops being read.
  if (!isCloser) {
    const mineDone = myDuties.filter((id) => done[id]).length
    return (
      <>
        <PageHeader
          title="Your sidework"
          subtitle={
            !myCut
              ? `${role} ${activePhase} · ${today()}`
              : isReleased(plan, myCut)
                ? `Cut ${myCut} · ${role} ${activePhase} · ${mineDone}/${myDuties.length} done`
                : `Cut ${myCut} · not cut yet`
          }
        />
        <div className="mx-auto max-w-2xl space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {phases.map((ph) => (
              <button
                key={ph}
                onClick={() => setPhase(ph)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  activePhase === ph
                    ? 'border-navy bg-navy text-white'
                    : 'border-black/10 bg-white text-muted'
                }`}
              >
                {ph}
              </button>
            ))}
          </div>

          {!myCut ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted text-pretty">
                No cut yet for {shiftPerson() || 'you'} on the {activePhase} sheet. Your closer deals
                the cuts out at the start of the shift.
              </p>
            </Card>
          ) : !isReleased(plan, myCut) ? (
            /* Dealt a cut but still on section. Sidework opens when the closer
               cuts them -- showing it early is how a section goes unwatched. */
            <Card className="p-6 text-center">
              <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
                <Check size={22} />
              </div>
              <p className="font-display text-base font-semibold text-ink">You're on cut {myCut}</p>
              <p className="mt-1 text-sm text-muted text-pretty">
                Your sidework opens when a manager cuts you. Stay on your section until then.
              </p>
            </Card>
          ) : myDuties.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted">Cut {myCut} has nothing on it yet.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {myDuties.map((id) => (
                <button
                  key={id}
                  onClick={() => setDone((d) => ({ ...d, [id]: !d[id] }))}
                  className={`flex w-full items-center gap-3 border-b border-black/5 px-3 py-3 text-left last:border-0 ${
                    done[id] ? 'bg-up/[0.04]' : ''
                  }`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl border-2 ${
                      done[id] ? 'border-up bg-up text-white' : 'border-black/15 text-transparent'
                    }`}
                  >
                    <Check size={18} strokeWidth={3} />
                  </span>
                  <span className={`text-[15px] ${done[id] ? 'text-muted line-through' : 'text-ink'}`}>
                    {byId.get(id)?.task}
                  </span>
                </button>
              ))}
            </Card>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Sidework"
        subtitle={`${role} · ${activePhase} · ${doneCount}/${allTasks.length} · ${today()}`}
        right={
          doneCount > 0 && (
            <button
              onClick={clearChecks}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-muted"
            >
              Reset checks
            </button>
          )
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Role tabs */}
        <div className="flex gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r)
                setPhase(phasesFor(r)[0])
                setEditingSec(null)
              }}
              className={`flex-1 rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors ${
                role === r
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Phase chips */}
        <div className="flex flex-wrap gap-2">
          {phases.map((ph) => (
            <button
              key={ph}
              onClick={() => {
                setPhase(ph)
                setEditingSec(null)
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                activePhase === ph
                  ? 'border-navy bg-navy text-white'
                  : 'border-black/10 bg-white text-muted hover:border-navy/40'
              }`}
            >
              {ph}
            </button>
          ))}
        </div>

        {/* Today's weekly detail. Both bar daily lists end with "do weekly side
            work", and the sheet it points at lives behind the bar — so the one
            line that applies today is shown here rather than being looked up. */}
        {role === 'Bar' && (
          <Card className="overflow-hidden border-warn/30">
            <div className="flex items-center gap-2 border-b border-black/5 bg-warn/[0.07] px-4 py-2">
              <span className="font-display text-sm font-semibold text-ink">
                Weekly side work — {DOW_LONG[weekdayIdx]}
              </span>
              {SPEED_POUR_DAYS.includes(weekdayIdx) && (
                <span className="ml-auto rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink">
                  Speed pours today
                </span>
              )}
            </div>
            <div className="space-y-1.5 p-4">
              {(['AM', 'PM'] as const).map((slot) => (
                <div key={slot} className="flex gap-2.5 text-sm">
                  <span className="w-7 shrink-0 font-mono text-xs font-extrabold text-muted">{slot}</span>
                  <span className="text-ink/90">{BAR_WEEKLY[weekdayIdx][slot]}</span>
                </div>
              ))}
              {SPEED_POUR_DAYS.includes(weekdayIdx) && (
                <div className="flex gap-2.5 pt-1 text-sm">
                  <span className="w-7 shrink-0" />
                  <span className="font-semibold text-ink">
                    Speed pours soaked, cleaned and left to dry.
                  </span>
                </div>
              )}
              <p className="pt-2 text-[11px] font-semibold text-down">{BAR_WEEKLY_NOTE}</p>
            </div>
          </Card>
        )}

        {/* Dealing tonight's work. The sheet below is the library it deals
            from -- edited when the duties themselves change, not nightly. */}
        <CutPlanner plan={plan} setPlan={setPlan} duties={duties} crew={crew} done={done} />

        {/* The duty list the cuts are dealt from.
            Folded away, because the cuts ARE the layout now -- how the duties
            happen to be grouped in here is bookkeeping, and leaving those boxes
            on screen beside the cuts showed the same work twice under two
            different sets of names. Open it to edit what the duties are. */}
        <details className="rounded-2xl border border-black/10 bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-ink">
            Duty list
            <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-extrabold text-muted">
              {duties.length}
            </span>
            <span className="ml-2 text-xs font-normal text-muted">
              everything the cuts are dealt from — edit it here
            </span>
          </summary>
          <div className="mt-3 space-y-3">
        {sections.map((sec, si) => {
          const secKeys = sec.tasks.map((t) => key(sec.section, t))
          const secDone = secKeys.filter((k) => done[k]).length
          const editing = editingSec === si
          return (
            // Keyed by position. Keyed by title, every keystroke of a rename
            // looked like a different card to React, which tore the input down
            // and rebuilt it — so focus was lost after a single character.
            <Card key={si} className={`overflow-hidden ${editing ? 'ring-2 ring-brand' : ''}`}>
              <div className={`flex items-center justify-between gap-2 border-b px-4 py-2 ${editing ? 'border-brand/20 bg-brand/[0.06]' : 'border-black/5 bg-black/[0.02]'}`}>
                {editing ? (
                  <input
                    value={sec.section}
                    onChange={(e) => renameSection(si, e.target.value)}
                    onBlur={(e) => commitRename(si, e.target.value)}
                    autoFocus
                    title="Rename this tile — use a name instead of a section number if that's how your store works"
                    className="min-w-0 flex-1 rounded-lg border border-brand/40 bg-white px-2 py-1 font-display text-sm font-semibold text-ink outline-none"
                  />
                ) : (
                  <span className="font-display text-sm font-semibold text-ink">{sec.section}</span>
                )}
                <span className="flex items-center gap-2">
                  {!editing && (
                    <>
                      {/* Who has this tile tonight. Names come from the roster,
                          filtered to the role on screen, so it stays a pick
                          rather than a spelling. */}
                      <select
                        value={assigned[aKey(si)] ?? ''}
                        onChange={(e) =>
                          setAssigned((a) => {
                            const next = { ...a }
                            if (e.target.value) next[aKey(si)] = e.target.value
                            else delete next[aKey(si)]
                            return next
                          })
                        }
                        aria-label={`Assign ${sec.section}`}
                        className={`max-w-[8.5rem] truncate rounded-lg border px-2 py-1 text-[11.5px] font-semibold outline-none focus:border-brand ${
                          assigned[aKey(si)]
                            ? 'border-brand/40 bg-brand/10 text-brand-600'
                            : 'border-black/10 bg-white text-muted'
                        }`}
                      >
                        <option value="">Unassigned</option>
                        {crew.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                        {/* Keeps a name visible after they're taken off the
                            roster mid-shift, instead of silently clearing. */}
                        {assigned[aKey(si)] && !crew.includes(assigned[aKey(si)]) && (
                          <option value={assigned[aKey(si)]}>{assigned[aKey(si)]}</option>
                        )}
                      </select>
                      <span className="text-xs text-muted">
                        {secDone}/{sec.tasks.length}
                      </span>
                    </>
                  )}
                  {editing && (
                    <button
                      onClick={() => resetSection(si)}
                      // Hidden for a tile with no counterpart in the stock sheet,
                      // where the button could only ever be a no-op.
                      hidden={!defaultAt(si)}
                      className="text-[11px] font-semibold text-down"
                    >
                      Reset to default
                    </button>
                  )}
                  <button
                    onClick={() => setEditingSec(editing ? null : si)}
                    aria-label={editing ? `Done editing ${sec.section}` : `Edit ${sec.section}`}
                    title={editing ? 'Done editing' : 'Edit this list'}
                    className={`grid size-7 place-items-center rounded-lg ${
                      editing ? 'bg-brand text-white' : 'border border-black/10 bg-white text-muted hover:text-ink'
                    }`}
                  >
                    {editing ? <Check size={13} /> : <Pencil size={12} />}
                  </button>
                </span>
              </div>

              {sec.tasks.map((t, ti) =>
                editing ? (
                  <div key={ti} className="flex items-center gap-2 border-b border-black/5 px-3 py-2 last:border-0">
                    <input
                      value={t}
                      onChange={(e) => editTask(si, ti, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                    />
                    <button
                      onClick={() => removeTask(si, ti, t)}
                      aria-label="Remove task"
                      className="shrink-0 px-2 text-muted hover:text-down"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    key={ti}
                    onClick={() => setDone((d) => ({ ...d, [key(sec.section, t)]: !d[key(sec.section, t)] }))}
                    className={`flex w-full items-start gap-3 border-b border-black/5 px-4 py-3 text-left last:border-0 ${
                      done[key(sec.section, t)] ? 'bg-up/5' : ''
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 text-xs transition-colors ${
                        done[key(sec.section, t)] ? 'border-up bg-up text-white' : 'border-black/20'
                      }`}
                    >
                      {done[key(sec.section, t)] && '✓'}
                    </span>
                    <span
                      className={`text-sm ${
                        done[key(sec.section, t)] ? 'text-muted line-through' : 'text-ink'
                      }`}
                    >
                      {t}
                    </span>
                  </button>
                ),
              )}

              {editing && (
                <div className="flex gap-2 p-3">
                  <input
                    value={adding[si] ?? ''}
                    onChange={(e) => setAdding((a) => ({ ...a, [si]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addTask(si)}
                    placeholder={`Add a duty to ${sec.section}…`}
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button
                    onClick={() => addTask(si)}
                    className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add
                  </button>
                </div>
              )}
            </Card>
          )
        })}
          </div>
        </details>

        {/* The closer's sign-off on this role + phase, for today. */}
        {sections.length > 0 && (
          <Card className={`overflow-hidden ${vRec ? 'ring-2 ring-up/40' : ''}`}>
            <div className="flex items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-2">
              <span className="font-display text-sm font-semibold text-ink">Closer verification</span>
              <span className="ml-auto text-xs text-muted">
                {doneCount}/{allTasks.length} checked
              </span>
            </div>
            {vRec ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <span className="rounded-lg bg-up/10 px-2.5 py-1 text-sm font-extrabold uppercase text-up">
                  ✓ {vRec.init}
                </span>
                <span className="text-xs text-muted">
                  verified {timeOf(vRec.at)} · {vRec.done}/{vRec.total} checked
                  {vRec.done < vRec.total && <b className="text-down"> · signed off short</b>}
                </span>
                <button
                  onClick={() => setVerified((v) => { const n = { ...v }; delete n[vKey]; return n })}
                  className="ml-auto text-[11px] font-semibold text-muted hover:text-ink"
                >
                  Undo
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 p-4">
                <span className="text-xs text-muted">
                  {role} · {activePhase} — initials to sign off:
                </span>
                <input
                  value={vInit}
                  onChange={(e) => setVInit(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void verifySidework()}
                  placeholder="——"
                  maxLength={4}
                  aria-label="Closer initials"
                  className="w-14 rounded-lg border-[1.5px] border-black/15 bg-white px-1 py-1.5 text-center text-sm font-extrabold uppercase text-ink outline-none focus:border-brand"
                />
                <button
                  onClick={() => void verifySidework()}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
                >
                  ✓ Verify
                </button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  )
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
