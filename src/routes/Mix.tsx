import { useMemo, useRef, useState } from 'react'
import { Upload, CalendarDays } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { usePersistentState } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { parsePmix, dateFromFilename, type MixItem, type PmixDays } from '../lib/pmix'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/**
 * Product Mix — what actually sells, stored PER DAY (handoff spec 'pmix-days').
 * Drop a Toast PMIX export: a date in the filename files it under that day;
 * otherwise a "Which day is this for?" picker pops up — no silent misfiling.
 * Every drop is permanently logged; a misfiled day can be removed with ✕.
 */
export function Mix() {
  const [days, setDays] = usePersistentState<PmixDays>('pmix:days', {})
  const [by, setBy] = useState<'qty' | 'sales'>('sales')
  const [cat, setCat] = useState('All')
  const [scope, setScope] = useState('all') // 'all' or a YYYY-MM-DD key
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [pendingDrop, setPendingDrop] = useState<{ items: MixItem[]; file: string; date: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dayKeys = useMemo(() => Object.keys(days).sort().reverse(), [days])

  // Aggregate the selected scope (one day, or every day we have).
  const items = useMemo<MixItem[]>(() => {
    const use = scope === 'all' ? dayKeys : dayKeys.filter((k) => k === scope)
    const byName = new Map<string, MixItem>()
    for (const k of use) {
      for (const it of days[k]?.items ?? []) {
        const cur = byName.get(it.name)
        if (cur) {
          cur.qty += it.qty
          cur.sales += it.sales
        } else byName.set(it.name, { ...it })
      }
    }
    return [...byName.values()]
  }, [days, dayKeys, scope])

  const cats = useMemo(
    () => ['All', ...[...new Set(items.map((i) => i.category).filter(Boolean))].sort()],
    [items],
  )
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items
      .filter((i) => (cat === 'All' || i.category === cat) && (!query || i.name.toLowerCase().includes(query)))
      .sort((a, b) => (by === 'qty' ? b.qty - a.qty : b.sales - a.sales))
  }, [items, by, cat, q])

  const totalSales = useMemo(() => items.reduce((s, i) => s + i.sales, 0), [items])
  const max = Math.max(...filtered.map((i) => (by === 'qty' ? i.qty : i.sales)), 1)

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
    else setPendingDrop({ items: parsed, file: name, date: '' }) // ask which day
  }

  return (
    <>
      <PageHeader
        title="Product Mix"
        subtitle={
          dayKeys.length
            ? `${dayKeys.length} day${dayKeys.length === 1 ? '' : 's'} of PMIX · ${money(totalSales)} in scope`
            : 'What actually sells'
        }
        right={
          items.length > 0 && (
            <SearchInput value={q} onChange={setQ} placeholder="Find an item…" className="w-full max-w-xs" />
          )
        }
      />
      <div
        className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8"
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

        <Card className={`border-dashed p-4 text-center ${items.length ? '' : 'p-8'}`}>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            <Upload size={15} /> {dayKeys.length ? 'Drop another day’s PMIX' : 'Drop a Toast Product Mix export'}
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
          {!dayKeys.length && (
            <p className="mx-auto mt-3 max-w-md text-xs text-muted text-pretty">
              In Toast: Reports → Menu → <b>Product Mix</b> → Export CSV, then drop it here. Each
              day you drop stacks up — the dashboard's tracked tiles and this screen aggregate them.
            </p>
          )}
          {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
        </Card>

        {items.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1">
                <button onClick={() => setBy('sales')} className={`rounded-md px-3 py-1 text-xs font-semibold ${by === 'sales' ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>
                  By $
                </button>
                <button onClick={() => setBy('qty')} className={`rounded-md px-3 py-1 text-xs font-semibold ${by === 'qty' ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>
                  By #
                </button>
              </div>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand"
              >
                <option value="all">All days ({dayKeys.length})</option>
                {dayKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              {cats.length > 2 &&
                cats.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      cat === c ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted'
                    }`}
                  >
                    {c}
                  </button>
                ))}
            </div>

            <Card className="overflow-hidden">
              {filtered.slice(0, 100).map((i, rank) => (
                <div key={i.name} className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0">
                  <span className="w-6 shrink-0 text-right text-xs font-bold text-muted">{rank + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{i.name}</div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${((by === 'qty' ? i.qty : i.sales) / max) * 100}%` }} />
                    </div>
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold text-ink">
                      {by === 'qty' ? i.qty.toLocaleString() : money(i.sales)}
                    </div>
                    <div className="text-[10px] text-muted">
                      {by === 'qty' ? money(i.sales) : `${i.qty.toLocaleString()} sold`}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length > 100 && (
                <div className="px-4 py-2 text-center text-xs text-muted">
                  Showing top 100 of {filtered.length} — search to find the rest.
                </div>
              )}
            </Card>
          </>
        )}

        {/* PMIX import log */}
        {dayKeys.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b border-black/5 bg-black/[0.02] px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-muted">
              PMIX import log
            </div>
            {dayKeys.map((k) => {
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
