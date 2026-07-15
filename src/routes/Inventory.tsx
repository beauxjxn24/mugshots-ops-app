import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, load, save, today } from '../lib/store'
import { useScope } from '../lib/scope'
import { getCatalog, getFlags, getPars, registerItem, setOnGuide } from '../lib/catalog'
import { setParEntry } from '../lib/ordering'
import { useIsPhone } from '../lib/useIsPhone'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export const LOCATIONS = ['Walk-in', 'Dry storage', 'Line', 'Bar', 'Freezer'] as const
type Location = (typeof LOCATIONS)[number]
const LOC_COLORS: Record<Location, string> = {
  'Walk-in': '#b8860b',
  'Dry storage': '#d4a94c',
  Bar: '#8b6bb8',
  Line: '#2f6b4f',
  Freezer: '#4c7fb8',
}

interface InvMeta {
  location?: Location
  lastCount?: string // YYYY-MM-DD of the last on-hand edit
}

function metaKey(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::inv:meta`
}
const getMeta = (): Record<string, InvMeta> => load(metaKey(), {})
const setMeta = (m: Record<string, InvMeta>): void => save(metaKey(), m)

function guessLocation(category: string): Location {
  if (/liquor|beer|wine/i.test(category)) return 'Bar'
  if (/paper|supply|dry/i.test(category)) return 'Dry storage'
  return 'Walk-in'
}
function fmtDay(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })
}

/**
 * Inventory — prototype layout, catalog-backed (ONE source of truth):
 * the same on-hand record Ordering reads. Location filters, par status,
 * value by location, count schedule.
 */
export function Inventory() {
  const isPhone = useIsPhone()
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const [schedule, setSchedule] = usePersistentState<string>(
    'inv:schedule',
    'Walk-in + Dry — Mon & Thu\nBar (full) — Sun close\nLine par check — daily · prep list',
  )
  const [loc, setLoc] = useState<'All' | Location>('All')
  const [form, setForm] = useState({ name: '', location: 'Walk-in' as Location, onHand: '', par: '', unit: 'cs' })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const flags = getFlags()
    const pars = getPars()
    const meta = getMeta()
    return getCatalog()
      .filter((ci) => flags[ci.id])
      .map((ci) => {
        const p = pars[ci.id] ?? { par: 0, onHand: 0 }
        const m = meta[ci.id] ?? {}
        const location = m.location ?? guessLocation(ci.category)
        return {
          id: ci.id,
          name: ci.name,
          unit: ci.unit,
          location,
          onHand: p.onHand,
          par: p.par,
          value: ci.cost != null ? ci.cost * p.onHand : null,
          lastCount: m.lastCount,
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const shown = rows.filter((r) => loc === 'All' || r.location === loc)
  const totalValue = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const lastFull = rows.reduce<string | undefined>((acc, r) => (r.lastCount && (!acc || r.lastCount > acc) ? r.lastCount : acc), undefined)

  const byLoc = useMemo(() => {
    const m = new Map<Location, number>()
    for (const r of rows) if (r.value) m.set(r.location, (m.get(r.location) ?? 0) + r.value)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const setCount = (id: string, v: number) => {
    setParEntry(id, { onHand: v })
    const meta = getMeta()
    meta[id] = { ...meta[id], lastCount: today() }
    setMeta(meta)
    refresh()
  }
  const setLocation = (id: string, location: Location) => {
    const meta = getMeta()
    meta[id] = { ...meta[id], location }
    setMeta(meta)
    refresh()
  }

  const addItem = () => {
    if (!form.name.trim()) return
    const ci = registerItem({ name: form.name.trim(), unit: form.unit || 'cs' })
    setOnGuide(ci.id, true)
    setParEntry(ci.id, { onHand: parseFloat(form.onHand) || 0, par: parseFloat(form.par) || 0 })
    const meta = getMeta()
    meta[ci.id] = { location: form.location, lastCount: today() }
    setMeta(meta)
    setForm({ name: '', location: form.location, onHand: '', par: '', unit: 'cs' })
    refresh()
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={`On-hand value ${money(totalValue)}${lastFull ? ` · last count ${fmtDay(lastFull)} ${lastFull}` : ' · counts update Ordering directly'}`}
        right={
          <div className="flex items-center gap-2">
            {isPhone ? (
              <select
                value={loc}
                onChange={(e) => setLoc(e.target.value as 'All' | Location)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-bold text-ink outline-none focus:border-brand print:hidden"
              >
                {(['All', ...LOCATIONS] as const).map((l) => (
                  <option key={l} value={l}>
                    {l === 'All' ? 'All locations' : l}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <div className="flex flex-wrap gap-1 rounded-xl bg-black/5 p-1 print:hidden">
                  {(['All', ...LOCATIONS] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLoc(l)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${loc === l ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white print:hidden"
                >
                  <Printer size={13} /> Count sheet
                </button>
              </>
            )}
          </div>
        }
      />
      {isPhone && (
        <div className="mx-auto max-w-xl p-4">
          <Card className="overflow-hidden">
            <div className="border-b border-black/10 px-4 py-2.5 text-sm font-bold text-ink">
              Count · {loc === 'All' ? 'all locations' : loc} <span className="font-normal text-muted">{shown.length} items</span>
            </div>
            {shown.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Nothing here yet — snap an invoice on{' '}
                <Link to="/imports" className="font-bold text-brand">
                  Imports
                </Link>{' '}
                and the catalog fills in.
              </p>
            )}
            {shown.map((r) => {
              const status =
                r.par <= 0
                  ? null
                  : r.onHand <= r.par * 0.25
                    ? { label: 'Critical', cls: 'text-down' }
                    : r.onHand < r.par
                      ? { label: 'Below par', cls: 'text-brand-600' }
                      : { label: 'OK', cls: 'text-up' }
              return (
                <div key={r.id} className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{r.name}</div>
                    <div className="text-[11px] text-muted">
                      {r.location} · par {r.par} {status && <span className={`font-extrabold ${status.cls}`}>· {status.label}</span>}
                    </div>
                  </div>
                  <label className="flex shrink-0 flex-col items-center text-[9px] font-bold uppercase text-muted">
                    On hand
                    <input
                      type="number"
                      inputMode="decimal"
                      value={r.onHand || ''}
                      placeholder="0"
                      onChange={(e) => setCount(r.id, Math.max(0, parseFloat(e.target.value) || 0))}
                      className="mt-0.5 w-20 rounded-lg border border-black/15 bg-white px-1 py-2 text-center font-mono text-base text-ink outline-none focus:border-brand"
                    />
                  </label>
                </div>
              )
            })}
            <div className="flex gap-2 border-t border-black/5 p-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="Add an item to count…"
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button onClick={addItem} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
                Add
              </button>
            </div>
          </Card>
          <p className="mt-2 px-1 text-[11px] text-muted">
            Counts update Ordering directly. Value, locations &amp; the count schedule are on a computer.
          </p>
        </div>
      )}
      <div className={`mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 ${isPhone ? 'hidden' : ''}`}>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3.2fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1.8fr)_110px_70px_54px_70px_78px_88px] items-center gap-2 border-b border-black/10 px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <span>Item</span>
              <span>Location</span>
              <span className="text-right">On hand</span>
              <span className="text-right">Par</span>
              <span className="text-right">Value</span>
              <span className="text-right">Last count</span>
              <span className="text-right">Status</span>
            </div>
            {shown.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Nothing here yet — add items below, or drop your order guides &amp; invoices on{' '}
                <Link to="/imports" className="font-bold text-brand">
                  Imports
                </Link>{' '}
                and the catalog fills in. Counts entered here update Ordering's on-hand directly.
              </p>
            )}
            {shown.map((r) => {
              const status =
                r.par <= 0
                  ? null
                  : r.onHand <= r.par * 0.25
                    ? { label: 'Critical', cls: 'text-down' }
                    : r.onHand < r.par
                      ? { label: 'Below par', cls: 'text-brand-600' }
                      : { label: 'OK', cls: 'text-up' }
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[minmax(0,1.8fr)_110px_70px_54px_70px_78px_88px] items-center gap-2 border-b border-black/5 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink">{r.name}</div>
                    <div className="text-[10px] text-muted">{r.unit}</div>
                  </div>
                  <select
                    value={r.location}
                    onChange={(e) => setLocation(r.id, e.target.value as Location)}
                    className="rounded-md border border-transparent bg-transparent py-1 text-xs text-ink/80 outline-none hover:border-black/10 focus:border-brand"
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={r.onHand}
                    onChange={(e) => setCount(r.id, Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-lg border border-black/10 bg-white px-1 py-1 text-right font-mono text-sm outline-none focus:border-brand"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={r.par}
                    onChange={(e) => {
                      setParEntry(r.id, { par: Math.max(0, parseInt(e.target.value) || 0) })
                      refresh()
                    }}
                    className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-right font-mono text-sm text-muted outline-none hover:border-black/10 focus:border-brand"
                  />
                  <span className="text-right font-mono text-sm text-ink">{r.value != null ? money(r.value) : '—'}</span>
                  <span className="text-right font-mono text-xs text-muted">{fmtDay(r.lastCount)}</span>
                  <span className={`text-right text-xs font-extrabold ${status?.cls ?? 'text-muted'}`}>{status?.label ?? '—'}</span>
                </div>
              )
            })}
            {/* Add item */}
            <div className="flex flex-wrap gap-2 border-t border-black/5 p-3 print:hidden">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="Add item to count — name…"
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value as Location })}
                className="rounded-lg border border-black/10 bg-white px-2 py-2 text-xs outline-none focus:border-brand"
              >
                {LOCATIONS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <input
                value={form.onHand}
                onChange={(e) => setForm({ ...form, onHand: e.target.value })}
                placeholder="on hand"
                type="number"
                inputMode="decimal"
                className="w-24 rounded-lg border border-dashed border-black/20 bg-white px-2 py-2 text-right text-sm outline-none focus:border-brand"
              />
              <input
                value={form.par}
                onChange={(e) => setForm({ ...form, par: e.target.value })}
                placeholder="par"
                type="number"
                inputMode="numeric"
                className="w-20 rounded-lg border border-dashed border-black/20 bg-white px-2 py-2 text-right text-sm outline-none focus:border-brand"
              />
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="unit (cases, jugs…)"
                className="w-36 rounded-lg border border-dashed border-black/20 bg-white px-2 py-2 text-sm outline-none focus:border-brand"
              />
              <button onClick={addItem} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
                Add item
              </button>
            </div>
          </Card>

          {/* Right rail */}
          <div className="space-y-5">
            <Card className="p-4">
              <div className="mb-2 text-sm font-bold text-ink">Value by location</div>
              {byLoc.length === 0 ? (
                <p className="text-xs text-muted">Fills in as counts and case costs land.</p>
              ) : (
                <>
                  <div className="mb-2 flex h-2.5 gap-px overflow-hidden rounded-full">
                    {byLoc.map(([l, v]) => (
                      <div key={l} style={{ width: `${(v / Math.max(totalValue, 1)) * 100}%`, background: LOC_COLORS[l] }} />
                    ))}
                  </div>
                  {byLoc.map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between py-0.5 text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-ink">
                        <span className="size-2 rounded-sm" style={{ background: LOC_COLORS[l] }} />
                        {l}
                      </span>
                      <span className="font-mono text-muted">{money(v)}</span>
                    </div>
                  ))}
                </>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-2 text-sm font-bold text-ink">Count schedule</div>
              <textarea
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-transparent bg-transparent text-xs leading-relaxed text-ink/80 outline-none hover:border-black/10 focus:border-brand"
              />
            </Card>

            <Card className="border-brand/25 bg-brand/[0.06] p-4">
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">
                One source of truth
              </div>
              <p className="text-xs leading-relaxed text-ink/80">
                Counts entered anywhere — inventory, ordering, receiving — update the same on-hand
                record. Ordering, usage, and cost analysis all read from it.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
