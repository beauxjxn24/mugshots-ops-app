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
import { useShift, phaseForShift } from '../lib/shift'
import { shiftPerson } from '../lib/daycode'
import { CutPlanner, type Duty } from '../components/CutPlanner'
import { NamePicker } from '../components/NamePicker'
import { Closers } from '../components/Closers'
import { getClosers, setCloser, type Side } from '../lib/closers'
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

/** Duty-sheet tab → the roster's job code, where the two are spelled differently. */
const JOB_CODE: Record<string, string> = { Bar: 'Bartender', 'To-Go': 'ToGo' }
/** Monday-first index for a yyyy-mm-dd date, matching the prep sheet. */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function Sidework() {
  // Editable copy of the duty sheet, persisted to the device.
  const [data, setData] = usePersistentState<Data>('sidework:data', SIDEWORK)
  const [role, setRole] = useState<Role>('Server')
  const phases = phasesFor(role)
  // Open on the sheet that matches the shift being worked. Landing on "AM
  // Opening" at nine at night meant the closer's first move on this screen was
  // always to correct it.
  const { shift } = useShift()
  const [phase, setPhase] = useState<string>(() => phaseForShift(phases, shift))
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
  // servers, not all seventy-one people on the roster. The duty sheet and the
  // roster don't spell every job the same way ("Bar" against "Bartender",
  // "To-Go" against "ToGo"), so the two are bridged here rather than the picker
  // coming up empty.
  const crew = useMemo(() => {
    const code = JOB_CODE[role] ?? role
    return staff
      .filter((p) => rolesOf(p).includes(code))
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b))
  }, [staff, role])
  // Switching role lands on that role's sheet for the shift being worked, not
  // on whatever its first phase happens to be.
  const activePhase = phases.includes(phase) ? phase : phaseForShift(phases, shift)
  const sections = data[role]?.[activePhase] ?? []

  // Who's shutting the building down. Per phase rather than per role: the
  // person closing the front is the same whether you're on the Server sheet or
  // the Host one.
  const [closerTick, setCloserTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closers = useMemo(() => getClosers(today())[activePhase] ?? {}, [activePhase, closerTick])
  const assignCloser = (side: Side, who: string) => {
    setCloser(today(), activePhase, side, who)
    setCloserTick((t) => t + 1)
  }
  // Anyone on the roster can close — it isn't limited to the role tab you're on.
  const everyone = useMemo(
    () => staff.map((p) => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [staff],
  )

  const aKey = (si: number) => `${role}|${activePhase}|${si}`

  // The bar's phases have been renamed twice: Opening / Closing before the real
  // laminated sheet went in, then AM / PM, and now AM Opening / PM Closing to
  // read the same way the servers' sheet does. A device holding an edited copy
  // under any older name would show an empty list, so every old name is carried
  // forward. Both hops run in order, so a device that skipped the middle one
  // still lands in the right place.
  useEffect(() => {
    const RENAMES: [string, string][] = [
      ['Opening', 'AM'],
      ['Closing', 'PM'],
      ['AM', 'AM Opening'],
      ['PM', 'PM Closing'],
    ]
    setData((d) => {
      const bar = d?.Bar as Record<string, Section[]> | undefined
      if (!bar || !RENAMES.some(([from]) => bar[from])) return d
      const next: Record<string, Section[]> = { ...bar }
      for (const [from, to] of RENAMES) {
        if (!next[from]) continue
        // A newer name already carrying work wins — never overwrite it.
        if (!next[to]) next[to] = next[from]
        delete next[from]
      }
      return { ...d, Bar: next } as Data
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Host and To-Go used to share one sheet with a section each. A device that
  // edited it holds those edits under the old joint name, so the sections are
  // split out to the role whose name they carry rather than being dropped.
  useEffect(() => {
    setData((d) => {
      const joint = (d as Record<string, unknown>)?.['Host & To-Go'] as
        | Record<string, Section[]>
        | undefined
      if (!joint) return d
      const next = { ...(d as Record<string, unknown>) }
      for (const [target, match] of [
        ['Host', /host/i],
        ['To-Go', /to.?go/i],
      ] as [string, RegExp][]) {
        // Don't clobber a sheet the split already gave them.
        if (next[target]) continue
        const phases: Record<string, Section[]> = {}
        for (const [phase, secs] of Object.entries(joint)) {
          const mine = secs.filter((s) => match.test(s.section))
          if (mine.length) phases[phase] = mine
        }
        if (Object.keys(phases).length) next[target] = phases
      }
      delete next['Host & To-Go']
      return next as Data
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

  // ---- editing helpers (immutable updates on data[role][activePhase]) ----
  const setSections = (updater: (secs: Section[]) => Section[]) =>
    setData((d) => ({
      ...d,
      [role]: { ...d[role], [activePhase]: updater(d[role][activePhase] ?? []) },
    }))

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
  // Whose sidework the staff view is showing.
  //
  // It followed whoever signed in on the device and offered no way to change,
  // so a manager checking a cut they had just made saw their OWN cut -- which
  // is none -- and the cut looked broken when it wasn't. On a shared tablet the
  // same thing happens to the second person to pick it up.
  const [viewAs, setViewAs] = useState('')
  const viewer = viewAs || shiftPerson()
  const myCut = cutFor(plan, viewer)
  const myDuties = myCut ? dutiesForCut(plan, myCut, duties.map((d) => d.id)) : []
  // Everyone the closer has put on a cut tonight.
  const onCuts = Object.entries(plan.people)
    .filter(([, who]) => who)
    .map(([c, who]) => ({ cut: Number(c), who }))
    .sort((a, b) => a.cut - b.cut)
  const vKey = `${role}|${activePhase}`
  const vRec = verified[vKey]

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

  /**
   * Put the whole sheet back to the one the app ships.
   *
   * The duty sheet is stored per device and only seeded the first time a device
   * opens it, so a sheet corrected in the app — the bar's real laminated list
   * replacing the placeholder it shipped with — never reaches a tablet that
   * already had its own copy. Per-tile reset can't fix that: it restores a tile
   * at a position, and a stale sheet has different tiles in different places.
   *
   * Not automatic, because these lists are meant to be edited — overwriting
   * without asking would throw away real changes. This asks.
   */
  const stockSheet = SIDEWORK[role]?.[activePhase]
  const resetSheet = async () => {
    if (!stockSheet) return
    if (
      !(await confirmDelete(
        `Put the ${role} ${activePhase} sheet back to the app's version?`,
        'Replaces every tile and duty on this sheet. Tonight\'s cuts and check-offs are untouched.',
        'Replace',
      ))
    )
      return
    setSections(() => stockSheet.map((s) => ({ ...s, tasks: [...s.tasks] })))
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
          {viewAs && (
            <div className="flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-xs">
              <span className="font-semibold text-ink">Showing {viewAs}'s sidework</span>
              <button onClick={() => setViewAs('')} className="ml-auto font-bold text-brand-600">
                switch
              </button>
            </div>
          )}
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
            <Card className="p-4">
              <p className="text-center text-sm text-muted text-pretty">
                No cut for {viewer || 'you'} on the {activePhase} sheet yet.
              </p>
              {onCuts.length > 0 && (
                <>
                  <p className="mt-3 text-center text-[11px] font-extrabold uppercase tracking-wider text-muted">
                    Not you? Tap your name
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {onCuts.map(({ cut, who }) => (
                      <button
                        key={cut}
                        onClick={() => setViewAs(who)}
                        className="flex w-full items-center gap-3 rounded-xl border border-black/10 px-3 py-2.5 text-left hover:border-brand"
                      >
                        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-extrabold text-brand-600">
                          Cut {cut}
                        </span>
                        <span className="truncate text-sm font-semibold text-ink">{who}</span>
                        {isReleased(plan, cut) && (
                          <span className="ml-auto text-[11px] font-bold text-up">cut</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
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
        {/* Decided before the cuts, and a different question: the cuts are who
            goes home and in what order, this is who stays to shut it down. */}
        <Closers
          phase={activePhase}
          roster={everyone}
          closers={closers}
          onSetCloser={assignCloser}
          done={done}
          onToggle={(id) => setDone((d) => ({ ...d, [id]: !d[id] }))}
          canEdit={isCloser}
          // So the card can name the rows on THIS sheet a closer already owns.
          sheet={duties}
        />

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
          {isCloser && stockSheet && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2">
              <span className="text-[11px] text-muted">
                This sheet is stored on this device. If it doesn't match the app's current one —
                the bar's list changed, and an older tablet keeps what it first saved —
              </span>
              <button
                onClick={resetSheet}
                className="ml-auto shrink-0 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-bold text-muted hover:border-brand/40 hover:text-brand-600"
              >
                Put back the app's sheet
              </button>
            </div>
          )}
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
                      {/* Type a name; the roster for this role suggests as you
                          go. A select meant scrolling fifteen servers on a
                          tablet, and an empty one read as disabled. */}
                      <div className="w-[9.5rem]">
                        <NamePicker
                          value={assigned[aKey(si)] ?? ''}
                          options={crew}
                          placeholder="Unassigned"
                          onChange={(name) =>
                            setAssigned((a) => {
                              const next = { ...a }
                              if (name) next[aKey(si)] = name
                              else delete next[aKey(si)]
                              return next
                            })
                          }
                        />
                      </div>
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

