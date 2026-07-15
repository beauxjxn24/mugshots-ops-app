import { useMemo, useRef, useState } from 'react'
import { Upload, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { parsePmix, dateFromFilename, type MixItem, type PmixDays, sanitizePmix } from '../lib/pmix'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
type Scope = 'day' | 'week' | 'period'

function fmtShort(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Product Mix — the prototype screen: day/week/period toggle, item history
 * search, Top movers table (per-day = prep pressure), and a right rail with
 * prep pressure, week's reads, and tracked items. All from YOUR PMIX drops,
 * stored per day.
 */
export function Mix() {
  const [rawDays, setDays] = usePersistentState<PmixDays>('pmix:days', {})
  const days = sanitizePmix(rawDays)
  const [rawTracked] = usePersistentState<string[]>('tracked:items', [])
  const tracked = Array.isArray(rawTracked) ? rawTracked : []
  const [scope, setScope] = useState<Scope>('week')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [pendingDrop, setPendingDrop] = useState<{ items: MixItem[]; file: string; date: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dayKeys = useMemo(() => Object.keys(days).sort(), [days])
  const latest = dayKeys[dayKeys.length - 1]

  // Scope → which stored days aggregate (anchored at the latest drop).
  const inScope = useMemo(() => {
    if (!latest) return []
    if (scope === 'day') return [latest]
    if (scope === 'week') {
      const [y, m, d] = latest.split('-').map(Number)
      const from = new Date(y, m - 1, d - 6)
      const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
      return dayKeys.filter((k) => k >= fromIso && k <= latest)
    }
    return dayKeys.filter((k) => k.startsWith(latest.slice(0, 7)))
  }, [dayKeys, latest, scope])

  const items = useMemo<MixItem[]>(() => {
    const byName = new Map<string, MixItem>()
    for (const k of inScope) {
      for (const it of days[k]?.items ?? []) {
        const cur = byName.get(it.name)
        if (cur) {
          cur.qty += it.qty
          cur.sales += it.sales
        } else byName.set(it.name, { ...it })
      }
    }
    return [...byName.values()]
  }, [days, inScope])

  const totalSales = useMemo(() => items.reduce((s, i) => s + i.sales, 0), [items])
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items])
  const nDays = Math.max(inScope.length, 1)

  const query = q.trim().toLowerCase()
  const movers = useMemo(
    () =>
      [...items]
        .filter((i) => !query || i.name.toLowerCase().includes(query))
        .sort((a, b) => b.sales - a.sales),
    [items, query],
  )
  const maxSales = Math.max(...movers.map((i) => i.sales), 1)

  // Week's reads — honest generated insights, only when the data supports them.
  const reads = useMemo(() => {
    const out: string[] = []
    if (items.length < 3) return out
    // Zero-dollar rows (water, ice) sell plenty but say nothing — skip them.
    const paid = items.filter((i) => i.sales > 0)
    const byS = [...paid].sort((a, b) => b.sales - a.sales)
    const byQ = [...paid].sort((a, b) => b.qty - a.qty)
    if (byS[0] && byQ[0] && byS[0].name !== byQ[0].name && byS[0].qty < byQ[0].qty) {
      out.push(
        `${byS[0].name} beats ${byQ[0].name} on dollars (${money(byS[0].sales)} vs ${money(byQ[0].sales)}) despite fewer sold — price mix working.`,
      )
    }
    const quiet = byQ.find((i) => byS.findIndex((s) => s.name === i.name) >= 8)
    if (quiet) {
      const rank = byS.findIndex((s) => s.name === quiet.name) + 1
      out.push(`${quiet.name} is quietly your #${rank} item by dollars — ${quiet.qty.toLocaleString()} sold.`)
    }
    const cats = new Map<string, number>()
    for (const i of items) if (i.category) cats.set(i.category, (cats.get(i.category) ?? 0) + i.sales)
    const topCat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topCat && totalSales > 0)
      out.push(`${topCat[0]} carries ${((topCat[1] / totalSales) * 100).toFixed(0)}% of item dollars in this window.`)
    return out.slice(0, 4)
  }, [items, totalSales])

  const scopeLabel =
    !latest
      ? ''
      : scope === 'day'
        ? fmtShort(latest)
        : scope === 'week'
          ? inScope.length > 1
            ? `Week of ${fmtShort(inScope[0])}–${fmtShort(latest)}`
            : fmtShort(latest)
          : latest.slice(0, 7)

  const commitDrop = (items2: MixItem[], file: string, date: string) => {
    setDays((d) => ({
      ...d,
      [date]: {
        items: items2,
        file,
        importedAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      },
    }))
    setPendingDrop(null)
    setMsg(`Filed ${items2.length} items under ${date}.`)
  }

  const ingest = (text: string, name: string) => {
    const parsed = parsePmix(text)
    if (parsed.length === 0) {
      setMsg('Couldn’t find item/quantity/sales columns — is this a Product Mix export?')
      return
    }
    const fromName = dateFromFilename(name)
    if (fromName) commitDrop(parsed, name, fromName)
    else setPendingDrop({ items: parsed, file: name, date: '' })
  }

  const trackedRows = tracked
    .map((name) => {
      const hit = items.find((i) => i.name.toLowerCase() === name.toLowerCase() || i.name.toLowerCase().includes(name.toLowerCase()))
      return { name, hit }
    })
    .slice(0, 6)

  return (
    <>
      <PageHeader
        title={latest ? `Product Mix · ${scopeLabel}` : 'Product Mix'}
        subtitle={
          latest
            ? `${money(totalSales)} net item sales · ${totalQty.toLocaleString()} items · ${items.length} menu items sold`
            : 'What actually sells — drop a Toast PMIX to light this up'
        }
        right={
          latest && (
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1">
              {(['day', 'week', 'period'] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-semibold capitalize ${
                    scope === s ? 'bg-white text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )
        }
      />
      <div
        className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8"
        onDrop={async (e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) ingest(await f.text(), f.name)
        }}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Which day is this for? */}
        {pendingDrop && (
          <Card className="border-brand/40 bg-brand/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <CalendarDays size={16} className="text-brand" />
              Which day is “{pendingDrop.file}” for?
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={pendingDrop.date}
                onChange={(e) => setPendingDrop({ ...pendingDrop, date: e.target.value })}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                disabled={!pendingDrop.date}
                onClick={() => commitDrop(pendingDrop.items, pendingDrop.file, pendingDrop.date)}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                File {pendingDrop.items.length} items
              </button>
              <button onClick={() => setPendingDrop(null)} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-muted">
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Tip: put the date in the file name (e.g. <b>pmix 2026-07-12.csv</b>) and it files itself.
            </p>
          </Card>
        )}

        {/* Import chip + item history search band */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-black/20 bg-white px-3.5 py-2 text-xs font-bold text-ink hover:border-brand"
          >
            <Upload size={13} className="text-brand" /> Import PMIX — Toast product-mix CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) ingest(await f.text(), f.name)
            }}
          />
          {latest && (
            <span className="rounded-full bg-up/10 px-2.5 py-1 text-[10px] font-bold text-up">
              ● PMIX {scopeLabel} on record
            </span>
          )}
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>

        {!latest ? (
          <Card className="p-8 text-center">
            <p className="mx-auto max-w-md text-sm text-muted text-pretty">
              In Toast: Reports → Menu → <b>Product Mix</b> → Export CSV, then drop it anywhere on
              this page (or on Imports). Each day stacks up — the dashboard's tracked tiles and
              this screen aggregate them.
            </p>
          </Card>
        ) : (
          <>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-lg font-semibold text-ink">Item history</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder='Search any item — try "burger"'
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                {movers.slice(0, 4).map((i) => (
                  <button
                    key={i.name}
                    onClick={() => setQ(i.name)}
                    className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-muted hover:border-brand/40"
                  >
                    {i.name.slice(0, 22)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Every imported PMIX is saved by date — search any item across every day on record.
              </p>
            </Card>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.6fr)]">
              {/* Top movers table */}
              <Card className="p-5">
                <div className="font-display text-xl font-semibold text-ink">
                  Top movers — {scope === 'day' ? 'the day' : scope === 'week' ? 'full week' : 'the period'}
                </div>
                <p className="mb-3 text-xs text-muted">Sorted by net sales · per-day average shows prep pressure</p>
                <div className="grid grid-cols-[minmax(0,2.2fr)_56px_72px_86px_minmax(80px,1fr)] gap-2 border-b border-black/10 pb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Per day</span>
                  <span className="text-right">Net sales</span>
                  <span>Mix %</span>
                </div>
                {movers.slice(0, 30).map((i) => {
                  const mix = totalSales > 0 ? (i.sales / totalSales) * 100 : 0
                  return (
                    <div key={i.name} className="grid grid-cols-[minmax(0,2.2fr)_56px_72px_86px_minmax(80px,1fr)] items-center gap-2 border-b border-black/5 py-2 last:border-0">
                      <span className="truncate text-sm font-semibold text-ink">{i.name}</span>
                      <span className="text-right font-mono text-xs text-ink">{i.qty.toLocaleString()}</span>
                      <span className="text-right font-mono text-xs text-muted">{Math.round(i.qty / nDays)}</span>
                      <span className="text-right font-mono text-xs font-bold text-ink">{money(i.sales)}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${(i.sales / maxSales) * 100}%` }} />
                        </span>
                        <span className="w-9 text-right font-mono text-[10px] text-muted">{mix.toFixed(1)}%</span>
                      </span>
                    </div>
                  )
                })}
                {movers.length > 30 && (
                  <p className="pt-2 text-center text-xs text-muted">Top 30 of {movers.length} — search to find the rest.</p>
                )}
                {movers.length === 0 && <p className="py-6 text-center text-sm text-muted">No item matches “{q}”.</p>}
              </Card>

              {/* Right rail */}
              <div className="space-y-5">
                {movers.length >= 2 && !query && (
                  <Card className="p-4">
                    <div className="mb-1 text-sm font-bold text-ink">Prep pressure · from {scope} mix</div>
                    <p className="text-xs leading-relaxed text-ink/75">
                      {movers[0].qty.toLocaleString()} {movers[0].name} + {movers[1].qty.toLocaleString()}{' '}
                      {movers[1].name} in this window set your pars. These numbers drive the prep list
                      as recipe cards land.
                    </p>
                  </Card>
                )}
                {reads.length > 0 && (
                  <Card className="border-brand/25 bg-brand/[0.06] p-4">
                    <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">
                      {scope === 'day' ? "Day's reads" : "Week's reads"}
                    </div>
                    <ul className="space-y-1.5">
                      {reads.map((r, i) => (
                        <li key={i} className="text-xs leading-relaxed text-ink/80">
                          · {r}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card className="border-navy !bg-navy p-4 text-white">
                  <div className="mb-2 text-sm font-bold">Tracked items · this {scope}</div>
                  {trackedRows.length === 0 ? (
                    <p className="text-xs text-white/60">
                      Nothing tracked yet — pick items in{' '}
                      <Link to="/stores" className="font-bold text-[#e0b23c]">
                        Stores &amp; Concepts →
                      </Link>
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {trackedRows.map(({ name, hit }) => (
                        <div key={name} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.08] px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{name}</span>
                            <span className="block text-[10px] text-white/60">
                              {hit ? `${hit.qty.toLocaleString()} sold · ~${Math.round(hit.qty / nDays)}/day` : 'not in this window'}
                            </span>
                          </span>
                          <span className="font-mono text-sm font-bold text-[#e0b23c]">{hit ? money(hit.sales) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}

        {/* PMIX import log */}
        {dayKeys.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b border-black/5 bg-black/[0.02] px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-muted">
              PMIX import log
            </div>
            {[...dayKeys].reverse().map((k) => {
              const d = days[k]
              const net = d.items.reduce((s, i) => s + i.sales, 0)
              return (
                <div key={k} className="flex items-center gap-3 border-b border-black/5 px-4 py-2 text-sm last:border-0">
                  <span className="w-24 shrink-0 font-mono text-xs font-semibold text-ink">{k}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {d.file} · {d.items.length} items · {money(net)} · imported {d.importedAt}
                  </span>
                  <button
                    onClick={async () => {
                      if (await confirmDelete(`Remove the PMIX filed under ${k}?`, d.file))
                        setDays((all) => {
                          const next = { ...all }
                          delete next[k]
                          return next
                        })
                    }}
                    aria-label={`Remove ${k}`}
                    className="text-muted hover:text-down"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </Card>
        )}
      </div>
    </>
  )
}
