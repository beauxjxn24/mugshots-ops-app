import { useEffect, useMemo, useState } from 'react'
import { Pencil, Check, AlertTriangle } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import {
  SIDEWORK,
  isStation,
  ROLES,
  phasesFor,
  BAR_WEEKLY,
  SPEED_POUR_DAYS,
  BAR_WEEKLY_NOTE,
  type Role,
  type Section,
} from '../lib/sidework'
import { BohCleaning, CleaningToday } from '../components/BohCleaning'
import { phaseKind, PHASE_META, OPENING_DUTIES, OPENING_SECTION, openingId } from '../lib/sidework'
import { SheetRail, ClosersStrip } from '../components/SheetRail'
import { rolesOf, type Person } from '../lib/staff'
import { useRole } from '../lib/role'
import { useShift, phaseForShift } from '../lib/shift'
import { shiftPerson } from '../lib/daycode'
import { CutPlanner, type Duty } from '../components/CutPlanner'
import { NamePicker } from '../components/NamePicker'
import { Closers } from '../components/Closers'
import { getClosers, setCloser, getCloserDuties, closerDutyId, SIDES, type Side } from '../lib/closers'
import {
  cutFor,
  dealEvenly,
  dutyId,
  emptyPlan,
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

/** "Sunday, Aug 23" — the header said 2026-08-23, which nobody reads as a day. */
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function Sidework() {
  // Editable copy of the duty sheet, persisted to the device.
  const [data, setData] = usePersistentState<Data>('sidework:data', SIDEWORK)
  const [role, setRole] = useState<Role>('Server')
  /**
   * The deep-clean tab.
   *
   * Held apart from `role` rather than folded into it: the tabs pick a duty
   * SHEET, and this isn't one — it's a day-indexed schedule with no phases,
   * sections or cuts. Making it a fake role would have every lookup below
   * quietly resolving to an empty sheet.
   */
  const [showClean, setShowClean] = useState(false)
  const phases = phasesFor(role)
  /**
   * The tabs come from the STORE'S sheet, not the shipped one.
   *
   * ROLES is the constant this app was built with; `data` is what this store
   * has actually got, including any station a manager has added. Reading the
   * constant would show a station on one screen and hide it on the next.
   */
  const roles = useMemo(() => {
    const mine = Object.keys(data ?? {})
    return [...ROLES.filter((r) => mine.includes(r)), ...mine.filter((r) => !ROLES.includes(r))]
  }, [data])

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

  /** Add a station this kitchen runs that the shipped list doesn't have. */
  const addStation = () => {
    const name = window.prompt('Station name — e.g. Expo, Pantry, Smoker')?.trim()
    if (!name) return
    if (roles.some((r) => r.toLowerCase() === name.toLowerCase())) {
      window.alert(`There's already a ${name} sheet.`)
      return
    }
    // Starts on PM Closing with one empty section, because closing is what
    // stations are asked for — the pencil on the section adds the duties.
    setData((d) => ({ ...d, [name]: { 'PM Closing': [{ section: name, tasks: [] }] } }) as Data)
    setRole(name)
    setPhase('PM Closing')
    setEditingSec(0)
  }
  const [done, setDone] = usePersistentState<Record<string, boolean>>(`sidework:done:${today()}`, {})
  const [adding, setAdding] = useState<Record<number, string>>({})
  // Closer sign-off, keyed by role|phase and dated like the checkmarks are.
  const [verified, setVerified] = usePersistentState<
    Record<string, { init: string; at: string; done: number; total: number }>
  >(`sidework:verified:${today()}`, {})
  const [vInit, setVInit] = useState('')
  const weekdayIdx = weekdayOf(today())
  const viewerRole = useRole((r) => r.role)
  /**
   * Who may do what on this page — three levels, not two.
   *
   * It used to be one line: `isCloser = role !== 'staff'`, which called every
   * manager a closer and no server one, and that is not how the floor works.
   * The owner's own chain is: the MOD names tonight's closers, and the closers
   * split the sidework between the servers.
   *
   * So "closer" is an ASSIGNMENT, not an app role. A server named as tonight's
   * FOH closer can deal the cuts and put names on sections; a manager who was
   * never named still can, because they're the MOD. Changing the duty sheet
   * itself — what the jobs ARE — stays with the manager either way.
   *
   * `closers` is resolved below, so the two booleans that depend on it live
   * with it rather than up here.
   */
  const isMod = viewerRole !== 'staff'
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
  // Folded away by default. It's named once at the start of a night and read
  // at the end of one, and it was taking half the screen in between.
  const [closersOpen, setClosersOpen] = useState(false)
  /** Closing duties still unticked, so the strip can say so without unfolding. */
  const closerLeft = useMemo(() => {
    const lists = getCloserDuties()
    return SIDES.reduce(
      (n, side) => n + (lists[side] ?? []).filter((t) => !done[closerDutyId(activePhase, side, t)]).length,
      0,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhase, done, closerTick])
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

  /**
   * A station that shipped under a shorter name than the store uses.
   *
   * "Grill" went out before the store's own training packet turned up calling
   * it "Grill - Middle Station". Without this, a device that already pulled the
   * first version would end up carrying both tabs — the old one holding
   * whatever had been typed into it.
   *
   * Runs before the add-what's-missing pass below, or that would helpfully put
   * the new empty sheet back alongside the old one.
   */
  useEffect(() => {
    const RENAMED: [string, string][] = [['Grill', 'Grill - Middle']]
    setData((d) => {
      const mine = d ?? ({} as Data)
      if (!RENAMED.some(([from]) => mine[from])) return d
      const next = { ...mine }
      for (const [from, to] of RENAMED) {
        if (!next[from]) continue
        // Anything already under the new name wins — never overwrite real work.
        if (!next[to]) next[to] = next[from]
        delete next[from]
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * A sheet the app ships that this device hasn't got yet.
   *
   * The duty sheet is seeded once per device and then belongs to that device,
   * so adding the kitchen stations to the shipped list reaches a fresh install
   * and nothing else — every tablet already in the building would have carried
   * on showing four tabs. Same trap the prep list has, for the same reason.
   *
   * Only ADDS what's missing. A store's own edits, and any station a manager
   * added here, are never touched.
   */
  useEffect(() => {
    setData((d) => {
      const mine = d ?? ({} as Data)
      const missing = Object.keys(SIDEWORK).filter((r) => !mine[r])
      if (missing.length === 0) return d
      const next = { ...mine }
      for (const r of missing) next[r] = SIDEWORK[r]
      return next
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

  /**
   * Opening the building — the crew's shared list, editable and added to.
   *
   * Kept out of `allTasks` on purpose. That array is what a closer signs off
   * and what "clear this sheet" wipes, and neither should reach across to work
   * the whole crew shares: clearing the Server sheet must not untick the chairs
   * for the Host tab too.
   */
  const [opening, setOpening] = usePersistentState<string[]>('sidework:opening', OPENING_DUTIES)
  const [addOpen, setAddOpen] = useState('')
  // Behind a pencil, like the section cards. A delete on every row put eight
  // ✕'s down the edge of a list whose whole job is being ticked.
  const [editOpening, setEditOpening] = useState(false)
  const isOpening = phaseKind(activePhase) === 'open'
  // Same trap as the duty sheet and the prep list: seeded once per device, so a
  // duty added to the shipped list would reach a fresh install and nothing
  // else. Only ADDS what's missing — a store's own edits are never touched, and
  // a duty deliberately deleted here stays deleted once it's off the shipped
  // list too.
  useEffect(() => {
    setOpening((mine) => {
      const have = new Set((mine ?? []).map((t) => t.trim().toLowerCase()))
      const missing = OPENING_DUTIES.filter((t) => !have.has(t.trim().toLowerCase()))
      return missing.length === 0 ? mine : [...(mine ?? []), ...missing]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openKeys = useMemo(() => (opening ?? []).map(openingId), [opening])
  const openDone = openKeys.filter((k) => done[k]).length

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
  /**
   * Am I one of tonight's closers?
   *
   * By name, off the MOD's assignment — the whole point of the chain. Compared
   * loosely because a roster types "Katie B." and a closer picker offers
   * "Katie B", and a trailing full stop must not quietly cost someone the
   * ability to deal their own cuts.
   */
  const sameName = (a?: string, b?: string): boolean =>
    !!a && !!b && a.trim().replace(/\.$/, '').toLowerCase() === b.trim().replace(/\.$/, '').toLowerCase()
  const mySide = SIDES.find((s) => sameName(closers[s], viewer))
  /** Deal cuts and put names on sections: the MOD, or a named closer. */
  const canAssign = isMod || Boolean(mySide)
  /** Change what the jobs ARE, and who is closing: the MOD only. */
  const canEditSheet = isMod
  const myCut = cutFor(plan, viewer)
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


  /**
   * Duty id → who is on it tonight.
   *
   * The sheet shows every duty, and the deal says which of them are yours. That
   * pairing is the whole point: a cook wants the station's full list in front
   * of them AND to see at a glance which lines have their name on.
   */
  const ownerOf = useMemo(() => {
    const m = new Map<string, { who: string; cut: number }>()
    for (const [id, cut] of Object.entries(plan.assign ?? {})) {
      m.set(id, { who: (plan.people?.[cut] ?? '').trim(), cut })
    }
    return m
  }, [plan])

  /**
   * Every sheet's state for tonight, for the rail.
   *
   * Computed across the store's whole sheet rather than the open one — the
   * question a closer has is "which of these nine are finished", and the old
   * page could only answer it about whichever tab was showing.
   */
  /** This sheet's phases, each with its own progress for the day. */
  const phaseStates = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {}
    for (const ph of phases) {
      const secs = (data?.[role]?.[ph] ?? []) as Section[]
      const keys = secs.flatMap((sec) => sec.tasks.map((t) => `${role}|${ph}|${sec.section}|${t}`))
      // The crew's shared opening list counts here, because this is the number
      // the Opening pill shows and opening the building is most of what opening
      // IS. Without it the pill was quoting one role's laminated sheet.
      if (phaseKind(ph) === 'open') keys.push(...openKeys)
      out[ph] = { total: keys.length, done: keys.filter((k) => done[k]).length }
    }
    return out
  }, [phases, data, role, done, openKeys])
  /** The phase the clock says we're in — marked, not forced. */
  const nowPhase = useMemo(() => phaseForShift(phases, shift), [phases, shift])

  /**
   * What an earlier part of today never finished.
   *
   * The owner's question, and it's the one that settles how much the clock is
   * allowed to do here: "if the hard time for lunch is 4, what happens if the
   * dinner shift starts and lunch isn't closed out?"
   *
   * If four o'clock HID the lunch list, the answer would be that the work
   * disappears and nobody finds out until they need the thing that never got
   * restocked. A clipboard doesn't do that — it sits on the pass until someone
   * deals with it. So the clock only ever promotes: it marks what's live and
   * opens on it, and anything left behind is carried forward here instead.
   *
   * It lands on the closers by design. The owner's own split has shift-change
   * duties as "the responsibility of the closers to ensure they are done", so
   * a lunch that didn't close out is exactly their problem to pick up.
   */
  const RANK: Record<string, number> = { open: 0, handover: 1, close: 2 }
  const carried = useMemo(() => {
    const here = RANK[phaseKind(activePhase)] ?? 0
    return phases
      .filter((ph) => (RANK[phaseKind(ph)] ?? 0) < here)
      .map((ph) => {
        const st = phaseStates[ph] ?? { done: 0, total: 0 }
        return { phase: ph, left: st.total - st.done, total: st.total }
      })
      .filter((x) => x.total > 0 && x.left > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, activePhase, phaseStates])

  const sheetStates = useMemo(
    () =>
      roles.map((r) => {
        // Each sheet against ITS OWN phase for this shift, not the one the open
        // sheet happens to be on. Every role names its phases differently —
        // Server has an AM Opening, Host doesn't — so measuring them all
        // against the active phase marked most of the rail "empty" when the
        // sheets were full.
        const mine = Object.keys(data?.[r] ?? {})
        const ph = mine.includes(activePhase) ? activePhase : phaseForShift(mine, shift)
        const secs = (data?.[r]?.[ph] ?? []) as Section[]
        const tasks = secs.flatMap((sec) => sec.tasks.map((t) => `${r}|${ph}|${sec.section}|${t}`))
        return {
          name: r,
          total: tasks.length,
          done: tasks.filter((k) => done[k]).length,
          verifiedBy: verified[`${r}|${ph}`]?.init,
        }
      }),
    [roles, data, activePhase, shift, done, verified],
  )

  return (
    <>
      <PageHeader
        width="wide"
        title="Sidework"
        subtitle={fmtDay(today())}
        right={
          // Wiping a shift's ticks belongs to whoever is running it. A server
          // reading their own list should not be one mis-tap from clearing
          // everybody's night.
          doneCount > 0 &&
          canAssign && (
            <button
              onClick={clearChecks}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-muted"
            >
              Reset checks
            </button>
          )
        }
      />
      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-7xl">
        {/* Sheets on the left, the work on the right.
            This used to open with thirteen controls in three stacked rows —
            four front-of-house tabs, six kitchen ones, three phase chips —
            and then four cards of identical weight underneath. Nothing said
            what to do first and nothing said how the close was going. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)]">
        {/* min-w-0: the phone's sheet row scrolls sideways INSIDE itself, and a
            grid column defaults to min-width:auto — without this the row's full
            width forces the column wide and the whole page scrolls with it. */}
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <SheetRail
            foh={sheetStates.filter((x) => !isStation(x.name))}
            kitchen={sheetStates.filter((x) => isStation(x.name))}
            active={role}
            onPick={(r) => {
              setShowClean(false)
              setRole(r)
              // Stay on the same phase where the new sheet has one — jumping a
              // closer from PM Closing to AM Opening because they tapped Host
              // is the thing the shift-aware default was meant to prevent.
              const mine = Object.keys(data?.[r] ?? {})
              setPhase(mine.includes(activePhase) ? activePhase : phaseForShift(mine, shift))
              setEditingSec(null)
            }}
            onAddStation={addStation}
            cleanActive={showClean}
            onPickClean={() => setShowClean(true)}
            canEdit={canEditSheet}
          />
        </div>

        <div className="min-w-0 space-y-4">
        {showClean ? (
          <BohCleaning
            date={today()}
            done={done}
            onToggle={(id) => setDone((d) => ({ ...d, [id]: !d[id] }))}
            canEdit={canEditSheet}
          />
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-display text-lg font-semibold text-ink">{role}</span>
          {/* Matches the pill below it — on opening that means counting the
              shared list too, or the two numbers would disagree on one screen. */}
          <span className="ml-auto font-mono text-xs font-bold text-muted">
            {doneCount + (isOpening ? openDone : 0)}/{allTasks.length + (isOpening ? openKeys.length : 0)}
          </span>
        </div>

        {/* The day, left to right, with who is on the hook for each part.
            Three identical pills said these were three views of one thing.
            They aren't: opening is split across the crew, shift change is the
            AM's work that the closers CHECK, and close is the closers' own and
            can't start until the guests are gone. */}
        {phases.length > 1 && (
          <div className="grid gap-2 sm:grid-cols-3">
            {phases.map((ph) => {
              const k = phaseKind(ph)
              const m = PHASE_META[k]
              const st = phaseStates[ph] ?? { done: 0, total: 0 }
              const on = activePhase === ph
              const signed = verified[`${role}|${ph}`]
              const full = st.total > 0 && st.done === st.total
              return (
                <button
                  key={ph}
                  onClick={() => {
                    setPhase(ph)
                    setEditingSec(null)
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    on
                      ? 'border-brand bg-brand/[0.12]'
                      : 'border-black/10 bg-white hover:border-brand/40'
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-bold ${on ? 'text-brand-600' : 'text-ink'}`}>
                      {m.title}
                    </span>
                    {ph === nowPhase && (
                      <span className="rounded-full bg-signal/20 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-signal">
                        now
                      </span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-[11px] font-bold text-muted">
                      {signed ? `✓ ${signed.init}` : st.total > 0 ? `${st.done}/${st.total}` : '—'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{m.who}</div>
                  {st.total > 0 && (
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/10">
                      <span
                        className={`block h-full rounded-full ${full ? 'bg-up' : 'bg-brand'}`}
                        style={{ width: `${Math.round((st.done / st.total) * 100)}%` }}
                      />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Left behind by an earlier part of the day. Never hidden by the
            clock — see `carried` above for why. */}
        {carried.length > 0 && (
          <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 border-warn/40 bg-warn/[0.08] px-4 py-2.5">
            <AlertTriangle size={15} className="shrink-0 text-warn" />
            <span className="text-sm font-bold text-ink">Still owed from earlier</span>
            <span className="flex flex-wrap gap-1.5">
              {carried.map((c) => (
                <button
                  key={c.phase}
                  onClick={() => {
                    setPhase(c.phase)
                    setEditingSec(null)
                  }}
                  className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-bold text-ink hover:border-warn"
                >
                  {PHASE_META[phaseKind(c.phase)].title} · {c.left} not done
                </button>
              ))}
            </span>
            <span className="ml-auto text-[11px] text-muted">
              four o’clock doesn’t finish it — the closers pick it up
            </span>
          </Card>
        )}

        {/* What this part of the day actually is, in the owner's words. */}
        <p className="px-1 text-xs leading-relaxed text-ink/70">
          <b className="text-ink">{PHASE_META[phaseKind(activePhase)].title}</b> ·{' '}
          {PHASE_META[phaseKind(activePhase)].note}
        </p>

        {/* Who the app thinks is holding the device.
            The tablet by the server station gets picked up by whoever is next,
            and everything below — what's highlighted, whether you can deal the
            cuts — hangs off this name. It followed whoever typed the day code
            and offered no way to say otherwise, so the second person to pick it
            up was reading somebody else's night. */}
        {!isMod && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
            <span className="text-xs text-muted">
              {viewer ? (
                <>
                  Showing <b className="text-ink">{viewer}</b>
                  {myCut ? ` · cut ${myCut}` : ''}
                </>
              ) : (
                'Nobody signed in on this device'
              )}
            </span>
            <div className="w-[10rem]">
              <NamePicker
                value={viewAs}
                options={everyone}
                placeholder={viewer ? 'Not you?' : 'Pick your name'}
                onChange={setViewAs}
              />
            </div>
          </div>
        )}

        {/* You're closing tonight.
            Said out loud, because being named by the MOD is what hands you the
            cut planner and the name pickers, and a control that appears without
            explanation reads as a bug. Staff only — a manager has these anyway
            and doesn't need telling why. */}
        {!isMod && mySide && (
          <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 border-brand/40 bg-brand/[0.1] px-4 py-2.5">
            <Check size={15} className="shrink-0 text-brand-600" />
            <span className="text-sm font-bold text-ink">
              You’re closing {mySide} tonight
            </span>
            <span className="text-[11px] text-muted">
              so you can deal the cuts and put names on sections
            </span>
          </Card>
        )}

        {/* And if you're not, who is — the thing a server wants to know when
            they walk in, without unfolding a panel to find it. */}
        {!isMod && !mySide && (closers.FOH || closers.BOH) && phaseKind(activePhase) === 'close' && (
          <p className="px-1 text-xs text-muted">
            Closing tonight:{' '}
            {SIDES.filter((s) => closers[s])
              .map((s) => `${closers[s]} (${s})`)
              .join(' · ')}
          </p>
        )}

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

        {/* Cuts are a floor idea — who goes home and in what order. A kitchen
            station is closed by whoever is standing at it, so the planner would
            be four empty boxes asking a question nobody has. */}
        {/* Dealing the cuts is the closers' own job — the MOD names them, they
            split the night. A server who isn't closing reads the result on the
            sheet below rather than being handed the controls for it. */}
        {!isStation(role) && phaseKind(activePhase) === 'close' && canAssign && (
          <CutPlanner plan={plan} setPlan={setPlan} duties={duties} crew={crew} done={done} />
        )}


        {/* Naming tonight's closers at nine in the morning is a question with
            no answer yet, and it was the first thing under the Opening pill.
            It belongs to the half of the day that's actually closing. */}
        {!isOpening && (
          <Card className="overflow-hidden">
            <ClosersStrip
              foh={closers.FOH}
              boh={closers.BOH}
              open={closersOpen}
              onToggle={() => setClosersOpen((v) => !v)}
              left={closerLeft}
            />
            {closersOpen && (
              <Closers
                phase={activePhase}
                roster={everyone}
                closers={closers}
                onSetCloser={assignCloser}
                done={done}
                onToggle={(id) => setDone((d) => ({ ...d, [id]: !d[id] }))}
                canEdit={canEditSheet}
                // So the card can name the rows on THIS sheet a closer already owns.
                sheet={duties}
                bare
              />
            )}
          </Card>
        )}

        {/* Opening the building, before anybody's own section.
            The complaint this answers: tapping Opening still showed "Server
            duties" over five tiles called Section 1 to Section 5, so the pill
            led to the role's general sidework and nothing on the screen ever
            said what opening actually is. This does, in the owner's words, and
            it's the same list on every tab — one crew, one building. */}
        {isOpening && (
          <Card className={`overflow-hidden ${editOpening ? 'ring-2 ring-brand' : 'border-signal/30'}`}>
            <div
              className={`flex items-center gap-2 border-b px-4 py-2 ${
                editOpening ? 'border-brand/20 bg-brand/[0.06]' : 'border-black/5 bg-signal/[0.07]'
              }`}
            >
              <span className="font-display text-sm font-semibold text-ink">{OPENING_SECTION}</span>
              <span className="rounded-full bg-signal/15 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-signal">
                whole crew
              </span>
              <span className="ml-auto font-mono text-xs font-bold text-muted">
                {openDone}/{openKeys.length}
              </span>
              {canEditSheet && (
                <button
                  onClick={() => setEditOpening((v) => !v)}
                  aria-label={editOpening ? 'Done editing opening duties' : 'Edit opening duties'}
                  className={`grid size-7 shrink-0 place-items-center rounded-lg border ${
                    editOpening ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted'
                  }`}
                >
                  {editOpening ? <Check size={13} /> : <Pencil size={12} />}
                </button>
              )}
            </div>
            {(opening ?? []).map((t) => {
              const id = openingId(t)
              return (
                <div key={t} className="flex items-center border-b border-black/5 last:border-0">
                  <button
                    onClick={() => setDone((d) => ({ ...d, [id]: !d[id] }))}
                    className={`flex min-w-0 flex-1 items-start gap-3 px-4 py-2.5 text-left ${
                      done[id] ? 'bg-up/5' : 'hover:bg-black/[0.02]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 text-[10px] transition-colors ${
                        done[id] ? 'border-up bg-up text-white' : 'border-black/20'
                      }`}
                    >
                      {done[id] && '✓'}
                    </span>
                    <span className={`text-sm ${done[id] ? 'text-muted line-through' : 'text-ink'}`}>{t}</span>
                  </button>
                  {canEditSheet && editOpening && (
                    <button
                      onClick={async () => {
                        if (await confirmDelete(`Remove "${t}" from opening?`)) {
                          setOpening((list) => list.filter((x) => x !== t))
                        }
                      }}
                      aria-label={`Remove ${t}`}
                      className="shrink-0 px-3 py-2.5 text-muted hover:text-down"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
            {/* "Start with this and make it to where we can add on to it." */}
            {canEditSheet && editOpening && (
              <div className="flex items-center gap-2 bg-black/[0.02] px-4 py-2.5">
                <input
                  value={addOpen}
                  onChange={(e) => setAddOpen(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    const v = addOpen.trim()
                    if (!v || (opening ?? []).some((x) => x.toLowerCase() === v.toLowerCase())) return
                    setOpening((list) => [...list, v])
                    setAddOpen('')
                  }}
                  placeholder="Add an opening duty…"
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
                />
                <button
                  onClick={() => {
                    const v = addOpen.trim()
                    if (!v || (opening ?? []).some((x) => x.toLowerCase() === v.toLowerCase())) return
                    setOpening((list) => [...list, v])
                    setAddOpen('')
                  }}
                  className="shrink-0 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-brand/40"
                >
                  Add
                </button>
              </div>
            )}
          </Card>
        )}

        {/* The duties themselves — the answer to "what does this station do",
            which is the question the tab is asking. It used to be folded into a
            summary called "Duty list", under the cuts, because the cuts were
            the layout. That reads on the Server sheet and it does not read on
            Dish: a station has no cuts, so a closer tapping Fry got a cut
            planner and had to go hunting for the actual jobs. */}
        {/* No box around the boxes. The sections below are cards already, and
            wrapping them in a second card put two borders and two headers
            between the reader and the first actual duty. */}
        <div className="px-1">
          {/* Named for the part of the day you tapped, not for the tab you're
              on. It said "Server duties" under every pill, so Opening, Shift
              change and Close all announced themselves as the same thing. */}
          <div className="text-sm font-bold text-ink">
            {isOpening ? 'Then, each section' : `${PHASE_META[phaseKind(activePhase)].title} · ${role}`}
            <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-extrabold text-muted">
              {duties.length}
            </span>
            <span className="ml-2 text-xs font-normal text-muted">
              {isStation(role)
                ? 'whoever is on the station works these'
                : isOpening
                  ? 'split across the crew — put a name on each one'
                  : phaseKind(activePhase) === 'handover'
                    ? 'the AM crew’s work — the closers check it’s done'
                    : 'what the cuts are dealt from'}
            </span>
          </div>
          {canEditSheet && stockSheet && editingSec !== null && (
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
                      {/* A name per section is how OPENING gets divided among
                          the crew. On shift change there's nobody to assign —
                          it's the AM's work and the closer is checking it. */}
                      {/* Whoever may deal the work gets the picker; everyone
                          else gets the answer. A server reading the sheet needs
                          to see that Section 2 is Katie's — they just mustn't be
                          able to make it somebody else's. */}
                      <div
                        className={`w-[9.5rem] ${
                          phaseKind(activePhase) === 'handover' ? 'hidden' : ''
                        }`}
                      >
                        {canAssign ? (
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
                        ) : (
                          <span
                            className={`block truncate rounded-lg px-2 py-1.5 text-center text-[11px] font-bold ${
                              sameName(assigned[aKey(si)], viewer)
                                ? 'bg-brand text-navy'
                                : assigned[aKey(si)]
                                  ? 'bg-black/5 text-muted'
                                  : 'text-muted/50'
                            }`}
                          >
                            {sameName(assigned[aKey(si)], viewer)
                              ? 'Yours'
                              : assigned[aKey(si)] || 'Unassigned'}
                          </span>
                        )}
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
                  {/* Rewriting what the duties ARE is a different thing from
                      dealing tonight's, and it outlives the shift. A closer
                      splits the work; the manager decides what the work is. */}
                  <button
                    hidden={!canEditSheet}
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
                  (() => {
                    // A CUT badge points at the cut planner, so it may only
                    // appear where the planner does: front of house, closing.
                    // On an opening sheet the crew is split by SECTION, and on
                    // a station there are no cuts at all — a stray "CUT 2"
                    // there points at a control that isn't on the screen.
                    const owner =
                      isStation(role) || phaseKind(activePhase) !== 'close'
                        ? undefined
                        : ownerOf.get(dutyId(role, activePhase, sec.section, t))
                    const mine = !!owner && !!viewer && owner.who === viewer
                    return (
                  <button
                    key={ti}
                    onClick={() => setDone((d) => ({ ...d, [key(sec.section, t)]: !d[key(sec.section, t)] }))}
                    className={`flex w-full items-start gap-3 border-b border-black/5 px-4 py-3 text-left last:border-0 ${
                      done[key(sec.section, t)] ? 'bg-up/5' : mine ? 'bg-brand/[0.10]' : ''
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
                      className={`min-w-0 flex-1 text-sm ${
                        done[key(sec.section, t)] ? 'text-muted line-through' : 'text-ink'
                      }`}
                    >
                      {t}
                    </span>
                    {owner && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          mine ? 'bg-brand text-navy' : 'bg-black/10 text-muted'
                        }`}
                      >
                        {owner.who || `cut ${owner.cut}`}
                      </span>
                    )}
                  </button>
                    )
                  })()
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
        </div>

        {/* The kitchen's half of the bar's weekly card: the station's own
            duties above, then the deep clean that's due on this shift. */}
        {isStation(role) && (
          <CleaningToday
            date={today()}
            done={done}
            onToggle={(id) => setDone((d) => ({ ...d, [id]: !d[id] }))}
          />
        )}

        {/* The closer's sign-off on this role + phase, for today.
            Not on opening: the closers aren't in the building yet, and shift
            change is where they check the AM crew's work — which is the whole
            point of the split. */}
        {sections.length > 0 && !isOpening && (
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
        </>
        )}
        </div>
        </div>
        </div>
      </div>
    </>
  )
}

