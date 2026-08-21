import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Pencil, Check, GripVertical, Archive, Send, Undo2, ChefHat } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { useRole } from '../lib/role'
import { useCurrentNames } from '../lib/scope'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { BarPrep } from '../components/BarPrep'
import PREP_SEED from '../data/prep-items.json'
import { prepSpecName } from '../lib/specs'
import { SpecPeek } from '../components/SpecPeek'
import { PrepChecklist, type ChecklistItem } from '../components/PrepChecklist'
import { prepDoneKey, type PrepCheck } from '../lib/prepdone'
import { driftFrom, hasDrift, prepSendKey, sendPrep, unsendPrep, type PrepSend, type SentItem } from '../lib/prepsend'
import { shiftPerson } from '../lib/daycode'
import { entryColumn, entryField } from '../lib/nextfield'
import { PrintSheet } from '../components/PrintSheet'

interface PrepItem {
  name: string
  spec: string
  unit: string
  pars: number[] // Mon..Sun
  section?: string // Recipes | Test items | LTO
  station?: string // Fry side | Grill side | … — which line station preps it
  parked?: boolean // archived — kept, hidden, one tap to bring back
}
interface HistEntry {
  date: string
  dow: number
  name: string
  onHand: number
  par: number
}

const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const SECTIONS = ['Recipes', 'Test items', 'LTO'] as const
// Line stations are OPT-IN per store — some locations run stations, some just
// print one sheet. A store with no stations prints the plain one-page split;
// add stations (one-tap "standard set" below, or your own) to split the print.
const STANDARD_STATIONS = ['Slice and Dice', 'Grill/Setup', 'Fry', 'Flat', 'Portion/Pan']
const OLD_STATION_MAP: Record<string, string> = { 'Fry side': 'Fry', 'Grill side': 'Grill/Setup' }
// Per-station colors (owner spec) — used on the toggle, the row chip, and the
// printed sheet header so each station is recognizable at a glance.
const STATION_HEX: Record<string, string> = {
  'Slice and Dice': '#16a34a', // green
  'Grill/Setup': '#db2777', // pink
  Fry: '#7c3aed', // purple
  Flat: '#2563eb', // blue
  'Portion/Pan': '#ea580c', // orange
}
const stationHex = (s: string): string | undefined => STATION_HEX[s]

const PREP_INPUT =
  'w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'

/** A labelled box in the item editor — the label sits above, so nothing is guessed at. */
function PrepField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wider text-muted">
        {label}
        {hint && <span className="ml-1 font-semibold normal-case tracking-normal text-muted/60">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * The unit, agreeing with the number in front of it.
 *
 * Units are written out in full on the sheet now — cases, portions, bottles —
 * rather than cs, ptns, btl. Spelled out, they have to agree: "1 cases" reads
 * worse than the abbreviation it replaced. Exactly one drops the plural;
 * anything else, a half pan included, keeps it.
 */
export const unitFor = (n: number, unit: string): string =>
  n === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit

/**
 * Prep taken off the menu, which has to come off every device's stored sheet.
 *
 * Dropping it from the shipped list isn't enough: the sheet is seeded once per
 * device and then belongs to that device, so a tablet that had already saved a
 * copy kept prepping it. Add a name here when an item is pulled and bump the
 * version below.
 */
const RETIRED_PREP = ['Pico De Gallo', 'Pico de Gallo']

/**
 * Prep added to the sheet after devices already had their own copy.
 *
 * The mirror of RETIRED_PREP. Adding a row to the shipped list reaches a fresh
 * device and nothing else, so a new item never appears on the tablet that
 * matters. Named explicitly rather than diffed against the seed, because
 * anything in the seed and missing from a device might have been taken off on
 * purpose — re-adding all of those would undo a manager's own housekeeping.
 */
const ADDED_PREP = ['Blackened Shrimp']

/** First-run classification (owner spec): brined chicken / queso meat /
 *  sliced jals were tests; LTO items get their own box; the originals are
 *  the recipes. */
function classify(it: PrepItem): string {
  const hay = `${it.name} ${it.spec}`
  if (/brine|queso\s*meat|slic\w*\s*jal/i.test(hay)) return 'Test items'
  if (/\bLTO\b|firecracker|popper/i.test(hay)) return 'LTO'
  return 'Recipes'
}

function dayIdx(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7 // Monday-first
}
function fmtLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/**
 * Prep list — the owner's real 49-item sheet in three boxes (Recipes / Test
 * items / LTO): per-day pars, on-hand entry, drag-to-shelf-order (the print
 * follows it), park-don't-delete, and pars that learn from leftovers.
 */
export function Prep() {
  const t = today()
  const di = dayIdx(t)
  const [rawItems, setItems] = usePersistentState<PrepItem[]>('prep:items', PREP_SEED as PrepItem[])
  const items = (Array.isArray(rawItems) ? rawItems : (PREP_SEED as PrepItem[])).map((it) => ({
    ...it,
    name: typeof it?.name === 'string' ? it.name : '',
    spec: typeof it?.spec === 'string' ? it.spec : '',
    unit: typeof it?.unit === 'string' ? it.unit : 'ea',
    pars: Array.isArray(it?.pars) ? it.pars : [0, 0, 0, 0, 0, 0, 0],
  }))
  const [onHand, setOnHand] = usePersistentState<Record<string, number>>(`prep:onhand:${t}`, {})
  const [rawHistory, setHistory] = usePersistentState<HistEntry[]>('prep:history', [])
  const history = Array.isArray(rawHistory) ? rawHistory : []
  const [editingPars, setEditingPars] = useState(false)
  // Cooks and servers open this to work the list, not to rewrite it. Pars,
  // stations, parking, reordering and adding items are a manager's job, and
  // leaving them one tap away on a shared tablet is how a par quietly changes
  // mid-shift. Staff get the same sheet, read-only, with the counts editable.
  const role = useRole((s) => s.role)
  const canEdit = role !== 'staff'
  // The printed sheet named the store in its footer — and named Flowood on it
  // whichever store you were in, so Pearl printed Flowood's sheets.
  const { concept, location } = useCurrentNames()
  // Line stations (owner spec): each prep item can be assigned to a station so
  // fry side and grill side can print — and work off — their own sheet.
  const [rawStations, setStations] = usePersistentState<string[]>('prep:stations', [])
  const [stationsVer, setStationsVer] = usePersistentState<number>('prep:stationsVer', 0)
  const [specsVer, setSpecsVer] = usePersistentState<number>('prep:specsVer', 0)
  const stations = Array.isArray(rawStations) ? rawStations.filter((s) => typeof s === 'string' && s.trim()) : []
  // '' = show/print every station together; a station name = just that one.
  const [station, setStation] = useState('')
  const [newStation, setNewStation] = useState('')
  const [adding, setAdding] = useState({ name: '', spec: '', unit: 'pans', section: 'Recipes', station: '' })
  const [addMsg, setAddMsg] = useState('')
  // Editing an item itself -- its name, its pan and portion spec, its unit.
  // None of that could be changed once an item existed: a portion that moved
  // from 4 oz to 6 meant deleting the row and adding it back, which threw away
  // its pars for all seven days.
  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState({ name: '', spec: '', unit: '', section: 'Recipes' })
  const [mode, setMode] = useState<'kitchen' | 'bar'>('kitchen')
  // The card for the item just tapped -- read over the sheet, so a count in
  // progress doesn't lose its place.
  const [peek, setPeek] = useState<string | null>(null)
  // What the floor has ticked off today, and who ticked it.
  const [doneLog] = usePersistentState<Record<string, PrepCheck>>(prepDoneKey(t), {})
  // What's been sent to the floor, if anything. Held in persistent state so the
  // button reflects a send made on this device a moment ago.
  const [sent, setSent] = usePersistentState<PrepSend | null>(prepSendKey(t), null)

  // One-time station migrations, per location:
  //  • v3: a store still on the first-pass default (Fry side / Grill side) is
  //    upgraded to the standard set, remapping its assignments.
  //  • v4: a store that has stations but has NEVER assigned an item to one was
  //    auto-seeded by an earlier build, not deliberately set up — clear it back
  //    to the plain one-sheet default. A store with real assignments (Pearl) is
  //    left alone. After this runs once, stations only exist where turned on.
  useEffect(() => {
    const cur = Array.isArray(rawStations) ? rawStations : []
    if (stationsVer < 3) {
      const isOldDefault = cur.length === 2 && cur[0] === 'Fry side' && cur[1] === 'Grill side'
      if (isOldDefault) {
        setStations(STANDARD_STATIONS)
        setItems((is) => is.map((it) => (it.station && OLD_STATION_MAP[it.station] ? { ...it, station: OLD_STATION_MAP[it.station] } : it)))
      }
    }
    if (stationsVer < 4) {
      const known = new Set(cur)
      const everUsed = items.some((it) => it.station && known.has(it.station))
      // Not old-default (that path just assigned above) and nothing ever
      // assigned → this store never opted in; clear the seeded stations.
      const wasOldDefault = cur.length === 2 && cur[0] === 'Fry side' && cur[1] === 'Grill side'
      if (cur.length > 0 && !everUsed && !wasOldDefault) setStations([])
    }
    setStationsVer(4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * One-time: take the pan and portion specs from the shipped sheet.
   *
   * The list is stored per device and only seeded on first run, so a spec
   * corrected in the app — Pow Pow Shrimp going from 4 oz portions to 6 —
   * never reached a tablet that already had its own copy. It read the old
   * number for as long as that device lived.
   *
   * Safe to overwrite exactly once, here: until this build there was no way to
   * edit an item's spec at all, so anything stored against a shipped item's
   * name can only be an older seed, never somebody's deliberate change. Items
   * added by hand aren't in the seed and aren't touched. From here on the
   * pencil owns it, and this never runs again.
   */
  useEffect(() => {
    if (specsVer >= 4) return
    const seed = new Map((PREP_SEED as PrepItem[]).map((s) => [s.name, s]))
    setItems((is) => {
      const kept = is
        // Items pulled off the menu have to leave every device's sheet, or a
        // cook keeps making something the kitchen no longer serves. Listed by
        // name rather than diffed against the seed, because a name missing from
        // the seed is usually one the store added on purpose.
        .filter((x) => !RETIRED_PREP.some((r) => r.toLowerCase() === x.name.trim().toLowerCase()))
        .map((x) => {
          const s = seed.get(x.name)
          if (!s || (x.spec === s.spec && x.unit === s.unit)) return x
          return { ...x, spec: s.spec, unit: s.unit }
        })
      // New rows land next to where the shipped sheet puts them, not on the end
      // — the sheet is ordered the way the cooler is walked.
      const have = new Set(kept.map((x) => x.name.trim().toLowerCase()))
      let out = kept
      for (const name of ADDED_PREP) {
        if (have.has(name.toLowerCase())) continue
        const row = (PREP_SEED as PrepItem[]).find((x) => x.name === name)
        if (!row) continue
        const seedIdx = (PREP_SEED as PrepItem[]).findIndex((x) => x.name === name)
        const before = (PREP_SEED as PrepItem[])[seedIdx + 1]?.name
        const at = before ? out.findIndex((x) => x.name === before) : -1
        out = at >= 0 ? [...out.slice(0, at), row, ...out.slice(at)] : [...out, row]
      }
      return out
    })
    setSpecsVer(4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If the selected station gets renamed/removed out from under us, fall back to All.
  useEffect(() => {
    if (station && !stations.includes(station)) setStation('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStations])
  // New items default to the station you're filtered to; switch the toggle and
  // the add form follows (you can still override it per add).
  useEffect(() => {
    setAdding((a) => ({ ...a, station }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])

  const onStation = (it: PrepItem) => !station || (it.station ?? '') === station
  const stationLabel = station || 'All stations'

  // One-time: sort existing items into their boxes.
  useEffect(() => {
    if (items.some((it) => !it.section)) {
      setItems((is) => is.map((it) => (it.section ? it : { ...it, section: classify(it) })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = items.filter((it) => !it.parked)
  const parked = items.filter((it) => it.parked)
  const inSection = (sec: string) => active.filter((it) => (it.section ?? 'Recipes') === sec && onStation(it))

  const need = (it: PrepItem) => Math.max(0, (it.pars[di] ?? 0) - (onHand[it.name] ?? 0))

  // The list as the floor would receive it: everything still owed today. An
  // item already at par isn't work, so it doesn't go out.
  //
  // Has to sit BELOW need() — it's a const arrow, and reading it from here at
  // render time throws "cannot access before initialization". TypeScript won't
  // catch that: the call is inside a closure, so it looks deferred to the
  // compiler and only blows up when the closure actually runs, which is
  // immediately.
  const outgoing: SentItem[] = SECTIONS.flatMap((sec) =>
    inSection(sec)
      .filter((it) => need(it) > 0)
      .map((it) => ({ name: it.name, unit: it.unit, need: need(it), section: sec })),
  )
  const drift = driftFrom(sent, outgoing)
  const stale = hasDrift(drift)

  const doSend = () => {
    setSent(sendPrep(outgoing, shiftPerson() || 'Manager', t))
  }
  const doUnsend = async () => {
    if (!(await confirmDelete('Pull the prep list back?', "The floor stops seeing it. Ticks already made are kept.", 'Pull back')))
      return
    unsendPrep(t)
    setSent(null)
  }

  // Drag by the grip — within a box or across boxes; order + box persist and
  // the printed sheet follows.
  const [dragName, setDragName] = useState<string | null>(null)
  const [overName, setOverName] = useState<string | null>(null)
  const dropOn = (targetName: string | null, section: string) => {
    if (!dragName) return
    setItems((is) => {
      const from = is.findIndex((x) => x.name === dragName)
      if (from < 0) return is
      const next = [...is]
      const [m] = next.splice(from, 1)
      const moved = { ...m, section }
      const at = targetName ? next.findIndex((x) => x.name === targetName) : -1
      next.splice(at < 0 ? next.length : at, 0, moved)
      return next
    })
  }

  const park = (name: string, on: boolean) =>
    setItems((is) => is.map((x) => (x.name === name ? { ...x, parked: on } : x)))

  const setItemStation = (name: string, st: string) =>
    setItems((is) => is.map((x) => (x.name === name ? { ...x, station: st || undefined } : x)))

  const addStation = () => {
    const s = newStation.trim()
    if (!s || stations.some((x) => x.toLowerCase() === s.toLowerCase())) return
    setStations((xs) => [...(Array.isArray(xs) ? xs : []), s])
    setNewStation('')
  }
  const useStandardStations = () => setStations(STANDARD_STATIONS)
  const removeStation = async (s: string) => {
    if (!(await confirmDelete(`Remove the “${s}” station?`, 'Items assigned to it become unassigned — nothing is deleted.', 'Remove station'))) return
    setStations((xs) => (Array.isArray(xs) ? xs : []).filter((x) => x !== s))
    setItems((is) => is.map((x) => (x.station === s ? { ...x, station: undefined } : x)))
  }

  const setCount = (name: string, v: number | undefined) => {
    setOnHand((o) => {
      const next = { ...o }
      if (v == null) delete next[name]
      else next[name] = v
      return next
    })
    if (v != null) {
      const it = items.find((x) => x.name === name)
      if (it)
        setHistory((h) =>
          [...(Array.isArray(h) ? h : []).filter((e) => !(e.date === t && e.name === name)), { date: t, dow: di, name, onHand: v, par: it.pars[di] ?? 0 }].slice(-800),
        )
    }
  }

  // Pars learn from usage: ≥3 counts on the same weekday → suggest a bump.
  const suggestions = useMemo(() => {
    const out: Array<{ name: string; dow: number; from: number; to: number }> = []
    for (const it of active) {
      for (let dow = 0; dow < 7; dow++) {
        const entries = history.filter((e) => e.name === it.name && e.dow === dow).slice(-4)
        if (entries.length < 3) continue
        const par = it.pars[dow] ?? 0
        if (par <= 0) continue
        const avgLeft = entries.reduce((s, e) => s + e.onHand, 0) / entries.length
        if (avgLeft >= par * 0.5 && par - Math.round(avgLeft * 2) / 2 >= 0.5) {
          out.push({ name: it.name, dow, from: par, to: Math.max(0.5, par - Math.round(avgLeft * 2) / 2) })
        } else if (avgLeft === 0 && entries.every((e) => e.onHand === 0)) {
          out.push({ name: it.name, dow, from: par, to: par + 1 })
        }
      }
    }
    return out.slice(0, 5)
  }, [active, history])

  const applySuggestions = () => {
    setItems((is) =>
      is.map((it) => {
        const mine = suggestions.filter((s) => s.name === it.name)
        if (!mine.length) return it
        const pars = [...it.pars]
        for (const s of mine) pars[s.dow] = s.to
        return { ...it, pars }
      }),
    )
  }

  const setPar = (name: string, dow: number, v: number) =>
    setItems((is) => is.map((it) => (it.name === name ? { ...it, pars: it.pars.map((p, i) => (i === dow ? v : p)) } : it)))

  const resetDay = async () => {
    if (Object.keys(onHand).length === 0) return
    if (await confirmDelete("Reset today's on-hands?", 'Pars stay — only the counts entered today are cleared.', 'Reset day'))
      setOnHand({})
  }

  const startEdit = (it: PrepItem) => {
    setEditing(it.name)
    setEdit({
      name: it.name,
      spec: it.spec ?? '',
      unit: it.unit ?? '',
      section: it.section ?? classify(it),
    })
  }

  const commitEdit = (was: string) => {
    const name = edit.name.trim() || was
    // Renaming has to carry the day's count and the check-offs with it, or a
    // cook who already counted the pan finds an empty box under a new name.
    setItems((is) =>
      is.map((x) =>
        x.name === was
          ? { ...x, name, spec: edit.spec.trim(), unit: edit.unit.trim() || x.unit, section: edit.section }
          : x,
      ),
    )
    if (name !== was)
      setOnHand((o) => {
        if (o[was] == null) return o
        const next = { ...o, [name]: o[was] }
        delete next[was]
        return next
      })
    setEditing(null)
  }

  const addItem = () => {
    const name = adding.name.trim()
    if (!name) {
      setAddMsg('Type an item name first.')
      return
    }
    // A same-named item may already exist — and it can be PARKED (archived), so
    // it's invisible on the list and the old code just silently did nothing,
    // making the Add button feel dead. Handle both cases with real feedback.
    const existing = items.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (existing.parked) {
        setItems((is) => is.map((x) => (x.name === existing.name ? { ...x, parked: false } : x)))
        setAdding((a) => ({ ...a, name: '', spec: '' }))
        setAddMsg(`“${existing.name}” was archived — brought it back onto the list.`)
      } else {
        setAddMsg(`“${existing.name}” is already on the list.`)
      }
      return
    }
    setItems((is) => [
      ...is,
      {
        name,
        spec: adding.spec.trim(),
        unit: adding.unit || 'pans',
        pars: [1, 1, 1, 1, 1, 1, 1],
        section: adding.section,
        station: adding.station || undefined,
      },
    ])
    setAdding((a) => ({ ...a, name: '', spec: '' }))
    setAddMsg(`Added “${name}”.`)
  }

  const actionButtons = (
    <>
      {canEdit && (
      <button onClick={resetDay} className="rounded-lg border border-down/30 bg-white px-3 py-2 text-xs font-bold text-down">
        Reset day
      </button>
      )}
      {canEdit && (
      <button
        onClick={() => setEditingPars((e) => !e)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
          editingPars ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
        }`}
      >
        {editingPars ? <Check size={13} /> : <Pencil size={12} />} {editingPars ? 'Done' : 'Edit daily pars'}
      </button>
      )}
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white"
      >
        <Printer size={13} /> {station ? `Print ${station} sheet` : stations.length > 0 ? 'Print all — a page per station' : 'Print prep sheet'}
      </button>
      {/* The floor sees nothing until this is pressed. Counting a cooler takes
          a while and a half-counted sheet is not a list — sending it is the
          moment it becomes one. */}
      {canEdit && mode === 'kitchen' && (
        <button
          onClick={doSend}
          disabled={outgoing.length === 0}
          title={
            outgoing.length === 0
              ? 'Nothing to send — everything is at par'
              : sent
                ? 'Send the updated list to the floor'
                : 'Make this list visible to the floor'
          }
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40 ${
            stale || !sent ? 'bg-brand' : 'bg-up'
          }`}
        >
          <Send size={13} />
          {!sent ? `Send to the floor · ${outgoing.length}` : stale ? `Send update · ${outgoing.length}` : 'Sent ✓'}
        </button>
      )}
    </>
  )

  const renderRow = (it: PrepItem) => {
    const n = need(it)
    const counted = onHand[it.name] != null
    return (
      <div key={it.name}>
      <div
        onDragOver={(e) => {
          if (!dragName) return
          e.preventDefault()
          setOverName(it.name)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dropOn(it.name, it.section ?? 'Recipes')
          setDragName(null)
          setOverName(null)
        }}
        className={`group grid grid-cols-[20px_minmax(0,2fr)_86px_repeat(7,52px)_110px] items-center gap-1 border-b border-black/5 px-4 py-2 last:border-0 ${
          dragName === it.name ? 'opacity-40' : ''
        } ${overName === it.name && dragName !== it.name ? 'border-t-2 border-t-brand' : ''}`}
      >
        <span
          draggable={canEdit}
          onDragStart={(e) => {
            if (!canEdit) return
            setDragName(it.name)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', it.name)
          }}
          onDragEnd={() => {
            setDragName(null)
            setOverName(null)
          }}
          title="Drag to reorder — drop into another box to move it there"
          className={canEdit ? 'cursor-grab text-muted/50 hover:text-ink active:cursor-grabbing' : 'invisible'}
        >
          <GripVertical size={14} />
        </span>
        <div className="min-w-0">
          {/* Straight to the card -- someone prepping it should be able to read
              the spec without hunting for it on another screen. Items with no
              card (tots, bacon, onion strings) stay plain text rather than
              becoming a link into nothing. */}
          {(() => {
            const card = prepSpecName(it.name)
            return card ? (
              <button
                onClick={() => setPeek(card)}
                title={`Spec for ${card}`}
                className="block w-full truncate text-left text-sm font-bold text-ink underline-offset-2 hover:text-brand-600 hover:underline"
              >
                {it.name}
              </button>
            ) : (
              <div className="truncate text-sm font-bold text-ink">{it.name}</div>
            )
          })()}
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span className="truncate">{it.spec || it.unit}</span>
            {/* What this prep feeds is on the recipe card, not here. The sheet
                is read standing in a cooler with a clipboard; the row wants the
                item and its par and nothing else. */}
            {canEdit && stations.length > 0 &&
              (() => {
                const hex = it.station ? stationHex(it.station) : undefined
                return (
                  <select
                    value={it.station ?? ''}
                    onChange={(e) => setItemStation(it.name, e.target.value)}
                    title="Which line station preps this — it prints on that station's sheet"
                    style={hex ? { color: hex, borderColor: hex, background: `${hex}14` } : undefined}
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold outline-none ${
                      it.station ? '' : 'border-black/10 bg-white text-muted'
                    }`}
                  >
                    <option value="">— station —</option>
                    {stations.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )
              })()}
            {canEdit && (
              <button
                onClick={() => (editing === it.name ? setEditing(null) : startEdit(it))}
                title="Edit this item — name, pan and portion spec, unit"
                aria-label={`Edit ${it.name}`}
                className={`shrink-0 transition-opacity ${
                  editing === it.name
                    ? 'text-brand-600 opacity-100'
                    : 'text-muted opacity-0 hover:text-brand-600 group-hover:opacity-100'
                }`}
              >
                <Pencil size={11} />
              </button>
            )}
            {canEdit && (
            <button
              onClick={() => park(it.name, true)}
              title="Park it — off the list and the print, kept in the Parked box below"
              className="shrink-0 text-muted opacity-0 transition-opacity hover:text-brand-600 group-hover:opacity-100"
            >
              park
            </button>
            )}
            {editingPars && (
              <button
                onClick={async () => {
                  if (await confirmDelete(`Remove ${it.name} from the prep list?`, 'Gone for good — Park keeps it instead.'))
                    setItems((is) => is.filter((x) => x.name !== it.name))
                }}
                className="shrink-0 text-down opacity-0 transition-opacity group-hover:opacity-100"
              >
                remove
              </button>
            )}
          </div>
        </div>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={counted ? onHand[it.name] : ''}
          placeholder="—"
          onChange={(e) => {
            const v = e.target.value
            setCount(it.name, v === '' ? undefined : Math.max(0, parseFloat(v) || 0))
          }}
          {...entryField('onhand')}
          className="w-full justify-self-center rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center font-mono text-sm outline-none focus:border-brand"
        />
        {it.pars.map((p, i) =>
          editingPars ? (
            <input
              key={i}
              type="number"
              inputMode="decimal"
              step="0.5"
              value={p}
              onChange={(e) => setPar(it.name, i, Math.max(0, parseFloat(e.target.value) || 0))}
              {...entryField(`par${i}`)}
              className={`w-full rounded-md border px-0.5 py-1 text-center font-mono text-xs outline-none focus:border-brand ${
                i === di ? 'border-brand/50 bg-brand/10 font-bold' : 'border-black/10 bg-white'
              }`}
            />
          ) : (
            <span
              key={i}
              className={`rounded-md py-1 text-center font-mono text-xs ${i === di ? 'bg-brand/15 font-bold text-ink' : 'text-muted'}`}
            >
              {fmtQty(p)}
            </span>
          ),
        )}
        <span className="text-right">
          {n > 0 ? (
            <span className="rounded-full bg-brand/15 px-2.5 py-1 font-mono text-xs font-extrabold text-brand-600">
              {fmtQty(n)} {unitFor(n, it.unit)}
            </span>
          ) : counted ? (
            <span className="rounded-full bg-up/10 px-2.5 py-1 text-xs font-extrabold text-up">✓ at par</span>
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </span>
      </div>

      {/* The item itself. Pan size, portion size and unit live on the row's
          sub-line and were read-only, so a portion moving from 4 oz to 6 meant
          deleting the row and adding it back -- losing its seven pars. */}
      {editing === it.name && canEdit && (
        <div
          className="grid gap-2 border-b border-brand/20 bg-brand/[0.05] px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_100px_140px_auto]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit(it.name)
            if (e.key === 'Escape') setEditing(null)
          }}
        >
          <PrepField label="Item">
            <input
              autoFocus
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              className={PREP_INPUT}
            />
          </PrepField>
          <PrepField label="Pan / portion spec" hint="Clear 1/6 pan · 6 oz portions">
            <input
              value={edit.spec}
              onChange={(e) => setEdit({ ...edit, spec: e.target.value })}
              placeholder="—"
              className={PREP_INPUT}
            />
          </PrepField>
          <PrepField label="Unit" hint="pans, cs, ea">
            <input
              value={edit.unit}
              onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
              className={PREP_INPUT}
            />
          </PrepField>
          <PrepField label="Box">
            <select
              value={edit.section}
              onChange={(e) => setEdit({ ...edit, section: e.target.value })}
              className={PREP_INPUT}
            >
              {SECTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </PrepField>
          <div className="flex items-end gap-2">
            <button
              onClick={() => commitEdit(it.name)}
              className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg px-2 py-2 text-xs font-bold text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
    )
  }

  // A cook on a phone gets the list as a column of tick boxes. The manager's
  // grid is twelve columns wide, built for a desk and a printer, and scrolls
  // sideways on a handset -- unusable one-handed on a line. Same items, same
  // day's numbers, different shape.
  if (!canEdit && mode === 'kitchen') {
    // The floor works from the list that was SENT, not from the live sheet.
    // Mid-count numbers are not a list, and a cook who starts on one is working
    // to a figure that is about to change.
    if (!sent) {
      return (
        <>
          <PageHeader
            width="narrow"
            title={`Prep list · ${fmtLong(t)}`}
            subtitle="Waiting on the manager"
          />
          <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-3xl">
            <Card className="p-6 text-center">
              <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-black/5 text-muted">
                <ChefHat size={20} />
              </span>
              <div className="font-display text-lg font-semibold text-ink">Prep list isn't out yet</div>
              <p className="mt-1 text-sm text-muted">
                A manager is still counting. It'll show up here the moment it's sent — nothing to do
                until then.
              </p>
            </Card>
            </div>
          </div>
        </>
      )
    }
    const checklist: ChecklistItem[] = sent.items.map((i) => ({
      name: i.name,
      unit: i.unit,
      need: i.need,
      section: i.section,
    }))
    const at = new Date(sent.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return (
      <>
        <PageHeader
          width="narrow"
          title={`Prep list · ${fmtLong(t)}`}
          subtitle={`Sent ${at} by ${sent.by} — tick each one off as you finish it`}
        />
        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-3xl">
            <PrepChecklist items={checklist} sentAt={sent.at} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        width="wide"
        title={mode === 'bar' ? `Bar prep · ${fmtLong(t)}` : `Prep list · ${fmtLong(t)}`}
        subtitle={
          mode === 'bar'
            ? "Enter on-hands · prep needed = today's par − on hand · tap an item for its recipe"
            : station
              ? `${station} only · prints just this station's items — switch stations up top`
              : stations.length > 0
                ? "Enter on-hands · prep needed = today's par − on hand · printing All puts each used station on its own page + the rest together"
                : "Enter on-hands · prep needed = today's par − on hand · drag rows into your shelf order"
        }
        right={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1">
              <button
                onClick={() => setMode('kitchen')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${mode === 'kitchen' ? 'bg-navy text-white shadow-sm' : 'text-muted'}`}
              >
                Kitchen prep
              </button>
              <button
                onClick={() => setMode('bar')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${mode === 'bar' ? 'bg-navy text-white shadow-sm' : 'text-muted'}`}
              >
                Bar prep
              </button>
            </div>
            {mode === 'kitchen' && (
              <>
                {stations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-black/5 p-1">
                    <button
                      onClick={() => setStation('')}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold ${station === '' ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                    >
                      All
                    </button>
                    {stations.map((s) => {
                      const hex = stationHex(s)
                      const active = station === s
                      return (
                        <button
                          key={s}
                          onClick={() => setStation(s)}
                          style={
                            hex
                              ? active
                                ? { background: hex, color: '#fff' }
                                : { color: hex }
                              : undefined
                          }
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold shadow-sm ${
                            active ? (hex ? '' : 'bg-navy text-white') : hex ? 'bg-white' : 'text-muted'
                          }`}
                        >
                          {hex && !active && <span className="inline-block size-2 rounded-full" style={{ background: hex }} />}
                          {s}
                        </button>
                      )
                    })}
                  </div>
                )}
                <Link to="/specs?view=board" className="text-xs font-bold text-brand">
                  Line builds →
                </Link>
                {actionButtons}
              </>
            )}
          </div>
        }
      />
      {mode !== 'bar' && (
      <>
      {/* Print-only prep sheet (owner spec): zero items never print, sections
          keep their boxes, the list flows into TWO columns, and — when printing
          All — each station lands on ITS OWN PAGE so you print once and hand a
          separate page to every station. A selected station prints just its page. */}
      <div className="prep-print hidden">
        {(() => {
          const printable = (it: PrepItem) => (it.pars[di] ?? 0) > 0 && (onHand[it.name] == null || need(it) > 0)
          // Sections (Recipes / Test / LTO) with something to prep for a page.
          const secsFor = (match: (it: PrepItem) => boolean) =>
            SECTIONS.map((sec) => ({
              sec,
              rows: active.filter((it) => (it.section ?? 'Recipes') === sec && printable(it) && match(it)),
            })).filter((s) => s.rows.length > 0)

          const known = new Set(stations)
          const hasStation = (it: PrepItem) => !!it.station && known.has(it.station)
          let pages: Array<{ title: string; station: string; secs: ReturnType<typeof secsFor> }>
          if (station) {
            // One station selected in the toggle → just its page.
            pages = [{ title: `${station} prep`, station, secs: secsFor((it) => it.station === station) }]
          } else {
            // "All": group each station that's actually used onto its own sheet,
            // and put everything not on a station on one combined sheet. A store
            // using no stations just gets the single default split sheet.
            const used = stations.filter((st) => active.some((it) => it.station === st && printable(it)))
            const restExists = active.some((it) => printable(it) && !hasStation(it))
            if (used.length === 0) {
              pages = [{ title: 'Prep list', station: '', secs: secsFor(() => true) }]
            } else {
              pages = [
                ...used.map((st) => ({ title: `${st} prep`, station: st, secs: secsFor((it) => it.station === st) })),
                ...(restExists ? [{ title: 'Everything else', station: '', secs: secsFor((it) => !hasStation(it)) }] : []),
              ]
            }
          }
          pages = pages.filter((p) => p.secs.length > 0)

          if (pages.length === 0)
            return <p className="text-[12px]">Nothing to prep — every item is at par for {fmtLong(t)}.</p>

          return pages.map((page, pi) => (
            <div key={page.title} style={pi < pages.length - 1 ? { breakAfter: 'page' } : undefined}>
              <PrintSheet
                title={page.title}
                accent={stationHex(page.station)}
                date={fmtLong(t)}
                venue={`${concept} · ${location}`}
                counted={Object.keys(onHand).length > 0}
                sections={page.secs.map(({ sec, rows }) => ({
                  name: sec,
                  rows: rows.map((it) => ({
                    name: it.name,
                    sub: it.spec || it.unit,
                    qty:
                      onHand[it.name] != null && need(it) > 0
                        ? `${fmtQty(need(it))} ${unitFor(need(it), it.unit)}`
                        : `${fmtQty(it.pars[di] ?? 0)} ${unitFor(it.pars[di] ?? 0, it.unit)}`,
                  })),
                }))}
              />
            </div>
          ))
        })()}
      </div>
      </>
      )}

      {/* NOT print:hidden — BarPrep's print sheet lives inside this wrapper, and
          a hidden ancestor would swallow it (the bar tab printed blank pages).
          BarPrep hides its own screen UI from print; the padding drops so the
          sheet starts at the paper margin. */}
      {mode === 'bar' && (
        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 print:p-0">
          <div className="mx-auto w-full max-w-7xl">
            <BarPrep />
          </div>
        </div>
      )}

      <div
        className={`px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 print:hidden ${mode === 'bar' ? 'hidden' : ''}`}
      >
        <div className="mx-auto w-full max-w-7xl space-y-5">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <Card className="border-brand/25 bg-brand/[0.06] p-4">
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">How pars work here</div>
            <p className="text-xs leading-relaxed text-ink/80">
              Each prep item has a par for every day of the week (Friday ≠ Monday). Today's column
              is highlighted; on-hands entered here are tracked so the app learns if pars are
              chronically over or under.
            </p>
          </Card>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="shrink-0">
              <div className="text-sm font-bold text-ink">Pars learn from usage</div>
              <div className="text-[11px] text-muted">
                {history.length ? `${history.length} counts on record` : 'fills in as you enter on-hands'}
              </div>
            </div>
            {suggestions.length === 0 ? (
              <span className="text-xs text-muted">No changes suggested yet — keep counting.</span>
            ) : (
              <>
                {suggestions.map((s, i) => (
                  <span key={i} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink">
                    {s.name} · {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][s.dow]} {fmtQty(s.from)} → <b className="text-brand-600">{fmtQty(s.to)}</b>
                  </span>
                ))}
                <button onClick={applySuggestions} className="ml-auto rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white print:hidden">
                  Review &amp; apply
                </button>
              </>
            )}
          </Card>
        </div>

        {/* Where the floor is with it. The manager's half of the loop: sent at
            this time, this many done, and — the answer to "is prep finished?" —
            who finished it and when, instead of walking the line to ask. */}
        {canEdit && mode === 'kitchen' && (() => {
          const list = sent?.items ?? []
          const doneN = list.filter((i) => doneLog[i.name]).length
          const finished = list.length > 0 && doneN === list.length
          const last = Object.values(doneLog)
            .map((c) => c.at)
            .sort()
            .reverse()[0]
          const whoFinished = last
            ? Object.values(doneLog).find((c) => c.at === last)?.by
            : undefined
          const clock = (iso: string) =>
            new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          return (
            <Card
              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 ${
                finished ? 'border-up/40 bg-up/[0.07]' : sent ? 'border-brand/25 bg-brand/[0.05]' : ''
              }`}
            >
              {!sent ? (
                <>
                  <span className="text-sm font-bold text-ink">Not sent yet</span>
                  <span className="text-xs text-muted">
                    The floor can't see the prep list until you send it — finish counting, then press
                    Send to the floor.
                  </span>
                </>
              ) : finished ? (
                <>
                  <span className="text-sm font-bold text-up">Prep finished ✓</span>
                  <span className="text-xs text-muted">
                    All {list.length} done{whoFinished ? ` · last off by ${whoFinished}` : ''}
                    {last ? ` at ${clock(last)}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-bold text-ink">
                    Sent {clock(sent.at)} · {doneN} of {list.length} done
                  </span>
                  {stale && (
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-warn">
                      sheet changed since — send update
                    </span>
                  )}
                </>
              )}
              {sent && (
                <button
                  onClick={doUnsend}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[11px] font-bold text-muted hover:border-down/40 hover:text-down"
                >
                  <Undo2 size={12} /> Pull it back
                </button>
              )}
            </Card>
          )
        })()}

        {/* Add row — above the sheet, so adding an item doesn't mean scrolling
            past every section to reach the box and back again to see the result. */}
        {canEdit && (
        <Card className="flex flex-wrap gap-2 p-3">
          <input
            value={adding.name}
            onChange={(e) => { setAdding({ ...adding, name: e.target.value }); if (addMsg) setAddMsg('') }}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Add prep item…"
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            value={adding.spec}
            onChange={(e) => setAdding({ ...adding, spec: e.target.value })}
            placeholder="Pan spec (Clear 1/6 pan…)"
            className="w-52 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            value={adding.unit}
            onChange={(e) => setAdding({ ...adding, unit: e.target.value })}
            placeholder="unit"
            className="w-24 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select
            value={adding.section}
            onChange={(e) => setAdding({ ...adding, section: e.target.value })}
            className="rounded-lg border border-black/10 bg-white px-2 py-2 text-sm outline-none focus:border-brand"
          >
            {SECTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {stations.length > 0 && (
            <select
              value={adding.station}
              onChange={(e) => setAdding({ ...adding, station: e.target.value })}
              className="rounded-lg border border-black/10 bg-white px-2 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="">No station</option>
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <button onClick={addItem} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
            Add
          </button>
          {addMsg && (
            <p className={`basis-full text-xs font-semibold ${/already/i.test(addMsg) ? 'text-warn' : 'text-up'}`}>{addMsg}</p>
          )}
        </Card>
        )}

        {/* One box per section — Recipes / Test items / LTO */}
        {SECTIONS.map((sec) => {
          const rows = inSection(sec)
          return (
            <Card key={sec} className="overflow-x-auto">
              <div
                onDragOver={(e) => {
                  if (!dragName) return
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  dropOn(null, sec)
                  setDragName(null)
                  setOverName(null)
                }}
                className="flex items-center justify-between border-b border-brand/20 bg-brand/[0.07] px-4 py-2"
              >
                <span className="text-xs font-extrabold uppercase tracking-wider text-brand-600">
                  {sec} <span className="ml-1 font-semibold text-muted">{rows.length}</span>
                </span>
                {sec !== 'Recipes' && (
                  <span className="text-[10px] text-muted">{sec === 'LTO' ? 'limited-time builds' : 'trial recipes — park or promote'}</span>
                )}
              </div>
              {/* Counting a cooler is one pass down the column, so Enter goes to
                  the same box on the next row rather than nowhere. */}
              <div className="min-w-[880px]" {...entryColumn}>
                <div className="grid grid-cols-[20px_minmax(0,2fr)_86px_repeat(7,52px)_110px] items-center gap-1 border-b border-black/10 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                  <span />
                  <span>Prep item</span>
                  <span className="text-center">On hand</span>
                  {DOWS.map((d, i) => (
                    <span key={i} className={`text-center ${i === di ? 'text-brand-600' : ''}`}>
                      {d}
                    </span>
                  ))}
                  <span className="text-right">Prep today</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-4 text-center text-xs text-muted">{canEdit ? 'Nothing here — drag an item in, or add one below.' : 'Nothing on the prep list here today.'}</p>
                ) : (
                  rows.map(renderRow)
                )}
              </div>
            </Card>
          )
        })}


        {/* Manage line stations — add / remove; renaming happens by removing and
            re-adding, and each item's station picker moves it. */}
        {canEdit && (
        <details className="rounded-2xl border border-black/10 bg-white px-4 py-3 print:hidden">
          <summary className="cursor-pointer text-sm font-bold text-ink">
            Line stations
            <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-extrabold text-muted">{stations.length}</span>
            <span className="ml-2 text-xs font-normal text-muted">optional — set them up here to split the print by station</span>
          </summary>
          {stations.length === 0 && (
            <div className="mt-3 rounded-lg bg-black/[0.03] p-3">
              <p className="text-xs text-ink/80 text-pretty">
                This location prints one combined prep sheet. Turn on stations to split the print — each used station
                gets its own sheet, everything else prints together.
              </p>
              <button
                onClick={useStandardStations}
                className="mt-2 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white"
              >
                Use standard set (Slice and Dice · Grill/Setup · Fry · Flat · Portion/Pan)
              </button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {stations.map((s) => {
              const count = active.filter((it) => (it.station ?? '') === s).length
              return (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-navy/20 bg-navy/5 py-1 pl-3 pr-1.5 text-xs font-bold text-ink">
                  {s} <span className="font-mono text-[10px] font-semibold text-muted">{count}</span>
                  <button
                    onClick={() => removeStation(s)}
                    aria-label={`Remove ${s}`}
                    className="grid size-4 place-items-center rounded-full text-muted hover:bg-black/10 hover:text-down"
                  >
                    ✕
                  </button>
                </span>
              )
            })}
            <input
              value={newStation}
              onChange={(e) => setNewStation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStation()}
              placeholder="Add a station…"
              className="w-40 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
            />
            <button onClick={addStation} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-bold text-ink">
              Add station
            </button>
          </div>
          {stations.length > 0 && active.some((it) => !it.station) && (
            <p className="mt-2 text-[11px] text-muted">
              {active.filter((it) => !it.station).length} item{active.filter((it) => !it.station).length === 1 ? '' : 's'} not on a station —
              they print together on the “Everything else” sheet.
            </p>
          )}
        </details>
        )}

        {/* Parked — archived, never lost */}
        {canEdit && (
        <details className="rounded-2xl border border-black/10 bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-ink">
            <span className="inline-flex items-center gap-1.5">
              <Archive size={14} className="text-muted" /> Parked items
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-extrabold text-muted">{parked.length}</span>
            </span>
            <span className="ml-2 text-xs font-normal text-muted">off the list and the print — nothing is lost</span>
          </summary>
          {parked.length === 0 ? (
            <p className="mt-2 text-xs text-muted">Nothing parked. Hover an item and tap “park” to tuck it away.</p>
          ) : (
            <div className="mt-2 divide-y divide-black/5">
              {parked.map((it) => (
                <div key={it.name} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink/70">{it.name}</div>
                    <div className="truncate text-[10px] text-muted">
                      {it.section ?? 'Recipes'} · {it.spec || it.unit}
                    </div>
                  </div>
                  <button
                    onClick={() => park(it.name, false)}
                    className="rounded-lg border border-brand/40 px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand/10"
                  >
                    Bring back
                  </button>
                </div>
              ))}
            </div>
          )}
        </details>
        )}

        {/* Who has actually made what today — the answer to "was the alfredo
            done?" without asking around the kitchen. */}
        {Object.keys(doneLog).length > 0 && (
          <Card className="overflow-hidden print:hidden">
            <div className="flex items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-2">
              <span className="font-display text-sm font-semibold text-ink">Checked off today</span>
              <span className="ml-auto text-xs text-muted">{Object.keys(doneLog).length} items</span>
            </div>
            {Object.entries(doneLog)
              .sort((a, b) => a[1].at.localeCompare(b[1].at))
              .map(([name, rec]) => (
                <div key={name} className="flex items-center gap-3 border-b border-black/5 px-4 py-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{name}</span>
                  {rec.qty > 0 && (
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {fmtQty(rec.qty)} {rec.unit}
                    </span>
                  )}
                  <span className="shrink-0 rounded-full bg-up/10 px-2 py-0.5 text-[11px] font-extrabold uppercase text-up">
                    {rec.by}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {new Date(rec.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              ))}
          </Card>
        )}

        {/* Bottom action bar — same buttons as the top, so there's no scroll-back */}
        <div className="flex flex-wrap items-center justify-end gap-2">{actionButtons}</div>
        </div>
      </div>
      <SpecPeek name={peek} onClose={() => setPeek(null)} />
    </>
  )
}

// What a prep item goes into lives on the recipe card now — see goesInto() in
// lib/linebuilds and the "Goes into" block on SpecPeek.
