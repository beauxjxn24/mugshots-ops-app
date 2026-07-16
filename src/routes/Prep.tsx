import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Pencil, Check, GripVertical, Archive } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { BarPrep } from '../components/BarPrep'
import PREP_SEED from '../data/prep-items.json'

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
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

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
  // Line stations (owner spec): each prep item can be assigned to a station so
  // fry side and grill side can print — and work off — their own sheet.
  const [rawStations, setStations] = usePersistentState<string[]>('prep:stations', [])
  const [stationsVer, setStationsVer] = usePersistentState<number>('prep:stationsVer', 0)
  const stations = Array.isArray(rawStations) ? rawStations.filter((s) => typeof s === 'string' && s.trim()) : []
  // '' = show/print every station together; a station name = just that one.
  const [station, setStation] = useState('')
  const [newStation, setNewStation] = useState('')
  const [adding, setAdding] = useState({ name: '', spec: '', unit: 'pans', section: 'Recipes', station: '' })
  const [mode, setMode] = useState<'kitchen' | 'bar'>('kitchen')

  // One-time: a store that still has the first-pass default (Fry side / Grill
  // side) is upgraded to the standard set, remapping its assignments. Stores
  // with no stations stay that way — stations are opt-in per location.
  useEffect(() => {
    if (stationsVer >= 3) return
    const cur = Array.isArray(rawStations) ? rawStations : []
    const isOldDefault = cur.length === 2 && cur[0] === 'Fry side' && cur[1] === 'Grill side'
    if (isOldDefault) {
      setStations(STANDARD_STATIONS)
      setItems((is) => is.map((it) => (it.station && OLD_STATION_MAP[it.station] ? { ...it, station: OLD_STATION_MAP[it.station] } : it)))
    }
    setStationsVer(3)
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

  const addItem = () => {
    if (!adding.name.trim()) return
    if (items.some((x) => x.name.toLowerCase() === adding.name.trim().toLowerCase())) return
    setItems((is) => [
      ...is,
      {
        name: adding.name.trim(),
        spec: adding.spec.trim(),
        unit: adding.unit || 'pans',
        pars: [1, 1, 1, 1, 1, 1, 1],
        section: adding.section,
        station: adding.station || undefined,
      },
    ])
    setAdding((a) => ({ ...a, name: '', spec: '' }))
  }

  const actionButtons = (
    <>
      <button onClick={resetDay} className="rounded-lg border border-down/30 bg-white px-3 py-2 text-xs font-bold text-down">
        Reset day
      </button>
      <button
        onClick={() => setEditingPars((e) => !e)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
          editingPars ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
        }`}
      >
        {editingPars ? <Check size={13} /> : <Pencil size={12} />} {editingPars ? 'Done' : 'Edit daily pars'}
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white"
      >
        <Printer size={13} /> {station ? `Print ${station} sheet` : stations.length > 0 ? 'Print all — a page per station' : 'Print prep sheet'}
      </button>
    </>
  )

  const renderRow = (it: PrepItem) => {
    const n = need(it)
    const counted = onHand[it.name] != null
    return (
      <div
        key={it.name}
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
        className={`group grid grid-cols-[20px_minmax(0,2fr)_repeat(7,52px)_86px_110px] items-center gap-1 border-b border-black/5 px-4 py-2 last:border-0 ${
          dragName === it.name ? 'opacity-40' : ''
        } ${overName === it.name && dragName !== it.name ? 'border-t-2 border-t-brand' : ''}`}
      >
        <span
          draggable
          onDragStart={(e) => {
            setDragName(it.name)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', it.name)
          }}
          onDragEnd={() => {
            setDragName(null)
            setOverName(null)
          }}
          title="Drag to reorder — drop into another box to move it there"
          className="cursor-grab text-muted/50 hover:text-ink active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink">{it.name}</div>
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span className="truncate">{it.spec || it.unit}</span>
            {stations.length > 0 && (
              <select
                value={it.station ?? ''}
                onChange={(e) => setItemStation(it.name, e.target.value)}
                title="Which line station preps this — it prints on that station's sheet"
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold outline-none ${
                  it.station ? 'border-navy/25 bg-navy/5 text-navy' : 'border-black/10 bg-white text-muted'
                }`}
              >
                <option value="">— station —</option>
                {stations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => park(it.name, true)}
              title="Park it — off the list and the print, kept in the Parked box below"
              className="shrink-0 text-muted opacity-0 transition-opacity hover:text-brand-600 group-hover:opacity-100"
            >
              park
            </button>
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
        {it.pars.map((p, i) =>
          editingPars ? (
            <input
              key={i}
              type="number"
              inputMode="decimal"
              step="0.5"
              value={p}
              onChange={(e) => setPar(it.name, i, Math.max(0, parseFloat(e.target.value) || 0))}
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
          className="w-full justify-self-center rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center font-mono text-sm outline-none focus:border-brand"
        />
        <span className="text-right">
          {n > 0 ? (
            <span className="rounded-full bg-brand/15 px-2.5 py-1 font-mono text-xs font-extrabold text-brand-600">
              {fmtQty(n)} {it.unit}
            </span>
          ) : counted ? (
            <span className="rounded-full bg-up/10 px-2.5 py-1 text-xs font-extrabold text-up">✓ at par</span>
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </span>
      </div>
    )
  }

  return (
    <>
      <PageHeader
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
                    {stations.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStation(s)}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold ${station === s ? 'bg-navy text-white shadow-sm' : 'text-muted'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <Link to="/builds" className="text-xs font-bold text-brand">
                  Line builds →
                </Link>
                {actionButtons}
              </>
            )}
          </div>
        }
      />
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
          let pages: Array<{ title: string; secs: ReturnType<typeof secsFor> }>
          if (station) {
            // One station selected in the toggle → just its page.
            pages = [{ title: `${station} prep`, secs: secsFor((it) => it.station === station) }]
          } else {
            // "All": group each station that's actually used onto its own sheet,
            // and put everything not on a station on one combined sheet. A store
            // using no stations just gets the single default split sheet.
            const used = stations.filter((st) => active.some((it) => it.station === st && printable(it)))
            const restExists = active.some((it) => printable(it) && !hasStation(it))
            if (used.length === 0) {
              pages = [{ title: 'Prep list', secs: secsFor(() => true) }]
            } else {
              pages = [
                ...used.map((st) => ({ title: `${st} prep`, secs: secsFor((it) => it.station === st) })),
                ...(restExists ? [{ title: 'Everything else', secs: secsFor((it) => !hasStation(it)) }] : []),
              ]
            }
          }
          pages = pages.filter((p) => p.secs.length > 0)

          if (pages.length === 0)
            return <p className="text-[12px]">Nothing to prep — every item is at par for {fmtLong(t)}.</p>

          return pages.map((page, pi) => (
            <div key={page.title} style={pi < pages.length - 1 ? { breakAfter: 'page' } : undefined}>
              <div className="mb-2 border-b-2 border-black pb-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[16px] font-bold">{page.title}</span>
                  <span className="text-[11px] font-semibold">{fmtLong(t)}</span>
                </div>
                <div className="text-[8.5px] text-black/60">par − on hand = prep · Mugshots Flowood</div>
              </div>
              <div style={{ columns: 2, columnGap: '22px' }}>
                {page.secs.map(({ sec, rows }) => (
                  <div key={sec} style={{ breakInside: 'avoid' }}>
                    <div className="mt-1 border-b border-black py-[2px] text-[9.5px] font-extrabold uppercase tracking-wider">{sec}</div>
                    {rows.map((it) => (
                      <div key={it.name} className="flex items-center gap-2 border-b border-black/25 py-[3px]" style={{ breakInside: 'avoid' }}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-bold leading-[13px]">{it.name}</span>
                          <span className="block truncate text-[8.5px] leading-[10px] text-black/60">{it.spec || it.unit}</span>
                        </span>
                        <span className="w-14 shrink-0 text-right font-mono text-[11px] font-bold">
                          {onHand[it.name] != null && need(it) > 0 ? `${fmtQty(need(it))} ${it.unit}` : `${fmtQty(it.pars[di] ?? 0)} ${it.unit}`}
                        </span>
                        <span className="h-[15px] w-9 shrink-0 rounded-[3px] border border-black/50" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[8.5px] text-black/60">
                Number shown = {Object.keys(onHand).length ? 'prep needed (on-hands already counted in the app)' : "today's par"} ·
                box = done ✓ · items with nothing to prep don't print
              </div>
            </div>
          ))
        })()}
      </div>

      {mode === 'bar' && (
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 print:hidden">
          <BarPrep />
        </div>
      )}

      <div className={`mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8 print:hidden ${mode === 'bar' ? 'hidden' : ''}`}>
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
              <div className="min-w-[880px]">
                <div className="grid grid-cols-[20px_minmax(0,2fr)_repeat(7,52px)_86px_110px] items-center gap-1 border-b border-black/10 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                  <span />
                  <span>Prep item</span>
                  {DOWS.map((d, i) => (
                    <span key={i} className={`text-center ${i === di ? 'text-brand-600' : ''}`}>
                      {d}
                    </span>
                  ))}
                  <span className="text-center">On hand</span>
                  <span className="text-right">Prep today</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-4 text-center text-xs text-muted">Nothing here — drag an item in, or add one below.</p>
                ) : (
                  rows.map(renderRow)
                )}
              </div>
            </Card>
          )
        })}

        {/* Add row */}
        <Card className="flex flex-wrap gap-2 p-3">
          <input
            value={adding.name}
            onChange={(e) => setAdding({ ...adding, name: e.target.value })}
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
        </Card>

        {/* Manage line stations — add / remove; renaming happens by removing and
            re-adding, and each item's station picker moves it. */}
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
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-navy/20 bg-navy/5 py-1 pl-3 pr-1.5 text-xs font-bold text-navy">
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

        {/* Parked — archived, never lost */}
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

        {/* Bottom action bar — same buttons as the top, so there's no scroll-back */}
        <div className="flex flex-wrap items-center justify-end gap-2">{actionButtons}</div>
      </div>
    </>
  )
}
