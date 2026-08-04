import { useMemo } from 'react'
import { Check, ChefHat, PartyPopper } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import PREP_SEED from '../data/prep-items.json'

/**
 * Today's Prep — a read-only, tap-to-check version of the manager's finished
 * prep sheet, built for the line to work off on a shared kitchen device. It
 * reads the SAME prep list the manager sets on the Prep screen (items, day-of-
 * week pars, on-hand counts, stations); staff just tick things off as they go.
 * Nothing here edits pars — it only records what's done for today.
 */
interface PrepItem {
  name: string
  spec: string
  unit: string
  pars: number[] // Mon..Sun
  section?: string
  station?: string
  parked?: boolean
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
function dayIdx(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7 // Monday-first
}
function fmtLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export function PrepToday() {
  const t = today()
  const di = dayIdx(t)

  const [rawItems] = usePersistentState<PrepItem[]>('prep:items', PREP_SEED as PrepItem[])
  const [onHand] = usePersistentState<Record<string, number>>(`prep:onhand:${t}`, {})
  const [rawStations] = usePersistentState<string[]>('prep:stations', [])
  // Check-off state is keyed by day, so it clears itself every morning.
  const [done, setDone] = usePersistentState<Record<string, boolean>>(`prep:done:${t}`, {})

  const items = (Array.isArray(rawItems) ? rawItems : (PREP_SEED as PrepItem[])).map((it) => ({
    ...it,
    name: typeof it?.name === 'string' ? it.name : '',
    unit: typeof it?.unit === 'string' ? it.unit : 'ea',
    pars: Array.isArray(it?.pars) ? it.pars : [0, 0, 0, 0, 0, 0, 0],
  }))
  const stations = Array.isArray(rawStations) ? rawStations.filter((s) => typeof s === 'string' && s.trim()) : []

  // Today's list: on the sheet (par > 0), not parked. The number to make is the
  // prep NEEDED when the manager has counted on-hands, else just today's par.
  const list = useMemo(() => {
    const on = onHand ?? {}
    return items
      .filter((it) => !it.parked && it.name && (it.pars[di] ?? 0) > 0)
      .map((it) => {
        const par = it.pars[di] ?? 0
        const counted = on[it.name] != null
        const qty = counted ? Math.max(0, par - (on[it.name] ?? 0)) : par
        return { ...it, qty, counted }
      })
      .filter((it) => it.qty > 0) // once on-hand ≥ par there's nothing to prep
  }, [items, onHand, di])

  // Group by station when the store runs stations; otherwise by section.
  const groups = useMemo(() => {
    const useStations = stations.length > 0
    const map = new Map<string, typeof list>()
    for (const it of list) {
      const key = useStations ? it.station || 'Unassigned' : it.section || 'Recipes'
      const arr = map.get(key) ?? []
      arr.push(it)
      map.set(key, arr)
    }
    const order = useStations ? [...stations, 'Unassigned'] : ['Recipes', 'Test items', 'LTO']
    return [...map.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]), bi = order.indexOf(b[0])
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
  }, [list, stations])

  const total = list.length
  const doneCount = list.filter((it) => done[it.name]).length
  const allDone = total > 0 && doneCount === total
  const toggle = (name: string) => setDone((d) => ({ ...d, [name]: !d[name] }))

  return (
    <>
      <PageHeader title="Today's Prep" subtitle={`${fmtLong(t)} · tap an item when it's done`} />
      <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-5">
        {/* Progress */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <ChefHat size={17} className="text-brand" /> {doneCount} of {total} prepped
            </span>
            <span className={`text-sm font-bold ${allDone ? 'text-up' : 'text-muted'}`}>
              {total ? Math.round((doneCount / total) * 100) : 0}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-300"
              style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
            />
          </div>
        </Card>

        {allDone && (
          <div className="flex items-center gap-3 rounded-2xl border border-up/30 bg-up/10 p-4 text-up">
            <PartyPopper size={22} />
            <span className="font-semibold">Prep's done — nice work. Everything on today's sheet is checked off.</span>
          </div>
        )}

        {total === 0 ? (
          <Card className="p-10 text-center">
            <ChefHat size={26} className="mx-auto mb-2 text-muted" />
            <div className="font-semibold text-ink">Nothing on the prep sheet for {fmtLong(t).split(',')[0]}</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              When a manager sets today's pars on the Prep screen, the list shows up here to check off.
            </p>
          </Card>
        ) : (
          groups.map(([label, rows]) => (
            <Card key={label} className="overflow-hidden p-0">
              <div className="bg-navy px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider text-white/70">
                {label} <span className="text-white/40">· {rows.filter((r) => done[r.name]).length}/{rows.length}</span>
              </div>
              <ul>
                {rows.map((it) => {
                  const isDone = !!done[it.name]
                  return (
                    <li key={it.name}>
                      <button
                        onClick={() => toggle(it.name)}
                        className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3.5 text-left last:border-0 active:bg-white/[0.03]"
                      >
                        <span
                          className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
                            isDone ? 'border-up bg-up text-white' : 'border-white/25 text-transparent'
                          }`}
                        >
                          <Check size={16} strokeWidth={3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-semibold ${isDone ? 'text-muted line-through' : 'text-ink'}`}>
                            {it.name}
                          </span>
                          {it.spec && <span className="block truncate text-[12px] text-muted">{it.spec}</span>}
                        </span>
                        <span className={`shrink-0 text-right font-mono text-lg font-bold ${isDone ? 'text-muted' : 'text-brand'}`}>
                          {fmtQty(it.qty)} <span className="text-xs font-semibold text-muted">{it.unit}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))
        )}

        <p className="px-1 text-center text-[11px] text-muted">
          Read-only — pars and the sheet are set by a manager on the Prep screen. Checks reset each morning.
        </p>
      </div>
    </>
  )
}
