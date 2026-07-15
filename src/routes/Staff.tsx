import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmDelete } from '../lib/confirm'
import { Upload, Users } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState } from '../lib/store'
import { type Person, ROLES, newId, importPeople } from '../lib/staff'

interface Entry {
  id: string
  name: string
  role: 'Bar' | 'Expo' | 'Host'
  hours: number
  pickedUp?: { by: string; at: string }
}
interface ServerOut {
  id: string
  name: string
  amount: number
}
interface Shift {
  id: string
  date: string
  meal?: 'AM' | 'PM'
  pool: number
  servers?: ServerOut[]
  entries: Entry[]
  events: string[]
}

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`
const DOT: Record<string, string> = {
  Server: 'bg-brand',
  Bartender: 'bg-sky-400',
  Expo: 'bg-orange-400',
  Host: 'bg-emerald-500',
  Cook: 'bg-navy',
  Dish: 'bg-slate-400',
  Manager: 'bg-purple-400',
}

/**
 * Staff — prototype layout: the roster of tipped & support staff on the left
 * (the source of truth Tipshare pulls names from), and every tip-out the
 * selected employee has been part of on the right, shift by shift.
 */
export function Staff() {
  const [staff, setStaff] = usePersistentState<Person[]>('staff:list', [])
  const [shifts] = usePersistentState<Shift[]>('tips:shifts', [])
  const [form, setForm] = useState({ name: '', role: 'Server', phone: '' })
  const [showImport, setShowImport] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const add = () => {
    if (!form.name.trim()) return
    setStaff((s) => [...s, { ...form, id: newId(), name: form.name.trim() }])
    setForm({ name: '', role: 'Server', phone: '' })
  }

  const bulkAdd = (people: ReturnType<typeof importPeople>): number => {
    let added = 0
    setStaff((s) => {
      const have = new Set(s.map((p) => p.name.toLowerCase()))
      const fresh = people
        .filter((p) => p.name && !have.has(p.name.toLowerCase()))
        .map((p) => ({ ...p, id: newId() }))
      added = fresh.length
      return [...s, ...fresh]
    })
    return added
  }

  // Tip totals per person, from the tipshare shift log — real history only.
  const tipTotals = useMemo(() => {
    const out = new Map<string, { tippedOut: number; received: number }>()
    const get = (n: string) => {
      const k = n.toLowerCase()
      if (!out.has(k)) out.set(k, { tippedOut: 0, received: 0 })
      return out.get(k)!
    }
    for (const s of shifts) {
      const entries = Array.isArray(s.entries) ? s.entries : []
      const servers = Array.isArray(s.servers) ? s.servers : []
      const hrs = entries.reduce((x, e) => x + e.hours, 0)
      const rate = hrs > 0 ? s.pool / hrs : 0
      for (const sv of servers) get(sv.name).tippedOut += sv.amount
      for (const e of entries) get(e.name).received += rate * e.hours
    }
    return out
  }, [shifts])

  const byRole = ROLES.map((r) => ({ role: r, people: staff.filter((p) => p.role === r) })).filter(
    (g) => g.people.length > 0,
  )
  const sel = staff.find((p) => p.id === selected) ?? null

  // Selected employee's shift-by-shift history.
  const history = useMemo(() => {
    if (!sel) return []
    const k = sel.name.toLowerCase()
    const rows: Array<{ date: string; meal?: string; what: string; amount: number; note?: string }> = []
    for (const s of shifts) {
      const entries = Array.isArray(s.entries) ? s.entries : []
      const servers = Array.isArray(s.servers) ? s.servers : []
      const hrs = entries.reduce((x, e) => x + e.hours, 0)
      const rate = hrs > 0 ? s.pool / hrs : 0
      for (const sv of servers)
        if (sv.name.toLowerCase() === k) rows.push({ date: s.date, meal: s.meal, what: 'tipped out', amount: -sv.amount })
      for (const e of entries)
        if (e.name.toLowerCase() === k)
          rows.push({
            date: s.date,
            meal: s.meal,
            what: `${e.role} · ${e.hours} hrs @ ${money(rate)}/hr`,
            amount: rate * e.hours,
            note: e.pickedUp ? `picked up ✓ ${e.pickedUp.by} · ${e.pickedUp.at}` : 'in the safe',
          })
    }
    return rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [sel, shifts])

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Your roster of tipped & support staff — the source of truth Tipshare pulls names from"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
                showImport ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
              }`}
            >
              <Upload size={13} /> Import list
            </button>
            <Link to="/tipshare" className="rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white">
              Go to Tipshare →
            </Link>
          </div>
        }
      />
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {showImport && (
          <div className="mb-5">
            <ImportPanel onImport={bulkAdd} />
          </div>
        )}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Team list */}
          <Card className="overflow-hidden">
            <div className="flex items-baseline justify-between px-4 py-3">
              <span className="font-display text-lg font-semibold text-ink">
                Team <span className="ml-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand-600">{staff.length}</span>
              </span>
              <span className="text-xs text-muted">active on the roster</span>
            </div>
            <div className="mx-3 mb-2 rounded-xl bg-black/[0.03] p-3">
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">Add an employee</div>
              <div className="flex flex-wrap gap-1.5">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="Full name"
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="rounded-lg border border-black/10 bg-white px-2 py-2 text-xs outline-none focus:border-brand"
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
                  Add
                </button>
              </div>
            </div>

            {staff.length === 0 && !showImport && (
              <div className="p-6 text-center">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <Users size={24} />
                </div>
                <p className="text-sm text-muted text-pretty">
                  Add your team once — Tipshare pulls from this roster. Use <b>Import list</b> to
                  drop a Toast employee export.
                </p>
              </div>
            )}

            {byRole.map((g) => (
              <div key={g.role}>
                <div className="flex items-center gap-1.5 px-4 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                  <span className={`size-2 rounded-full ${DOT[g.role] ?? 'bg-black/20'}`} />
                  {g.role}s
                </div>
                {g.people.map((p) => {
                  const tt = tipTotals.get(p.name.toLowerCase())
                  const isServer = p.role === 'Server'
                  const amt = isServer ? (tt?.tippedOut ?? 0) : (tt?.received ?? 0)
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className={`group flex w-full items-center gap-3 border-t border-black/5 px-4 py-2.5 text-left hover:bg-black/[0.02] ${
                        selected === p.id ? 'bg-brand/5 ring-2 ring-inset ring-brand' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-ink">{p.name}</div>
                        <div className="text-[10px] text-muted">{amt > 0 ? `${history.length && selected === p.id ? '' : ''}on the tip log` : 'no tip-outs yet'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-brand-600">{money(amt)}</div>
                        <div className="text-[9px] text-muted">{isServer ? 'tipped out' : 'received'}</div>
                      </div>
                      <span
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (await confirmDelete(`Remove ${p.name} from the roster?`)) {
                            setStaff((s) => s.filter((x) => x.id !== p.id))
                            if (selected === p.id) setSelected(null)
                          }
                        }}
                        aria-label={`Remove ${p.name}`}
                        className="cursor-pointer text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
                      >
                        ✕
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </Card>

          {/* Employee detail */}
          <Card className="min-h-80 p-5">
            {!sel ? (
              <div className="grid h-full min-h-64 place-items-center text-center">
                <div>
                  <div className="font-display text-lg font-semibold text-ink">Select an employee</div>
                  <p className="mx-auto mt-1 max-w-60 text-xs text-muted">
                    Pick someone on the left to see every tip-out they've been part of, shift by shift.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <span className="font-display text-xl font-semibold text-ink">{sel.name}</span>
                  <span className="text-xs text-muted">{sel.role}</span>
                </div>
                {history.length === 0 ? (
                  <p className="text-sm text-muted">
                    No tip-outs on record yet — they'll appear here as shifts are logged on{' '}
                    <Link to="/tipshare" className="font-bold text-brand">
                      Tipshare
                    </Link>
                    .
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex gap-4">
                      {(() => {
                        const tt = tipTotals.get(sel.name.toLowerCase())
                        return (
                          <>
                            {(tt?.received ?? 0) > 0 && (
                              <span className="text-sm">
                                <b className="font-mono text-up">{money(tt!.received)}</b>{' '}
                                <span className="text-xs text-muted">received</span>
                              </span>
                            )}
                            {(tt?.tippedOut ?? 0) > 0 && (
                              <span className="text-sm">
                                <b className="font-mono text-ink">{money(tt!.tippedOut)}</b>{' '}
                                <span className="text-xs text-muted">tipped out</span>
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                    {history.map((h, i) => (
                      <div key={i} className="flex items-center gap-3 border-t border-black/5 py-2 text-sm">
                        <span className="w-24 shrink-0 font-mono text-xs text-muted">
                          {h.date.slice(5)} {h.meal ?? ''}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink">{h.what}</span>
                          {h.note && (
                            <span className={`block text-[10px] ${h.note.startsWith('picked') ? 'text-up' : 'text-muted'}`}>{h.note}</span>
                          )}
                        </span>
                        <span className={`shrink-0 font-mono text-sm font-bold ${h.amount >= 0 ? 'text-up' : 'text-ink'}`}>
                          {h.amount >= 0 ? '+' : '−'}
                          {money(Math.abs(h.amount))}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function ImportPanel({ onImport }: { onImport: (p: ReturnType<typeof importPeople>) => number }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const preview = text.trim() ? importPeople(text) : []

  const run = () => {
    const people = importPeople(text)
    const added = onImport(people)
    setMsg(`Added ${added} of ${people.length} (skipped ${people.length - added} already on roster).`)
    setText('')
  }

  return (
    <Card className="border-brand/30 bg-brand/5 p-4">
      <div className="mb-2 text-sm font-semibold text-ink">Import your team</div>
      <p className="mb-3 text-xs text-muted text-pretty">
        Paste a list (one per line, or “Name, Role”) — or upload a <b>Toast employee export</b> (CSV).
        Names and job titles map to roles automatically. Duplicates are skipped.
      </p>
      <div className="mb-2 flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink"
        >
          <Upload size={14} /> Choose CSV file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setText(await f.text())
          }}
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'Jane Smith, Server\nMarcus Lee, Bartender\n…or paste the Toast CSV here'}
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {preview.length > 0 ? `${preview.length} people detected` : msg || ' '}
        </span>
        <button
          onClick={run}
          disabled={preview.length === 0}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Import {preview.length || ''} {preview.length === 1 ? 'person' : 'people'}
        </button>
      </div>
    </Card>
  )
}
