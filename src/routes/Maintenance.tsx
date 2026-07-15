import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { periodWeek } from '../lib/forecast'
import { Wrench, Check, Printer } from 'lucide-react'
import CHECKLISTS from '../data/maintenance-checklists.json'

interface Ticket {
  id: string
  equipment: string
  issue: string
  date: string
  priority: 'low' | 'normal' | 'urgent'
  resolved: boolean
}

const PRIORITY: Record<Ticket['priority'], string> = {
  urgent: 'text-down',
  normal: 'text-warn',
  low: 'text-muted',
}

interface ChecklistSection {
  title: string
  items: string[]
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function periodKey(iso: string): string {
  const pw = periodWeek(iso)
  return `${iso.slice(0, 4)}-P${pw.period}`
}
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function Maintenance() {
  const [view, setView] = useState<'tickets' | 'weekly' | 'period'>('tickets')
  const [rows, setRows] = usePersistentState<Ticket[]>('maint:log', [])
  const [form, setForm] = useState<Omit<Ticket, 'id' | 'resolved' | 'date'>>({
    equipment: '',
    issue: '',
    priority: 'normal',
  })

  const open = useMemo(
    () =>
      rows
        .filter((r) => !r.resolved)
        .sort((a, b) => {
          const rank = { urgent: 0, normal: 1, low: 2 }
          return rank[a.priority] - rank[b.priority] || (b.date ?? '').localeCompare(a.date ?? '')
        }),
    [rows],
  )
  const resolved = useMemo(() => rows.filter((r) => r.resolved).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [rows])

  const add = () => {
    if (!form.equipment.trim() || !form.issue.trim()) return
    setRows((r) => [
      ...r,
      { ...form, id: `m${Date.now()}`, equipment: form.equipment.trim(), issue: form.issue.trim(), date: today(), resolved: false },
    ])
    setForm({ equipment: '', issue: '', priority: 'normal' })
  }
  const toggle = (id: string) => setRows((r) => r.map((x) => (x.id === id ? { ...x, resolved: !x.resolved } : x)))
  const remove = async (t: Ticket) => {
    if (await confirmDelete(`Delete "${t.equipment}"?`, t.issue)) setRows((r) => r.filter((x) => x.id !== t.id))
  }

  const t = today()
  const pw = periodWeek(t)

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle={
          view === 'tickets'
            ? `${open.length} open · ${resolved.length} resolved`
            : view === 'weekly'
              ? `Weekly walkthrough · week of Mon ${fmtDay(mondayOf(t))} — resets every Monday`
              : `Period walkthrough · Period ${pw.period} — resets each period`
        }
        right={
          <div className="flex items-center gap-2 print:hidden">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1">
              {(
                [
                  ['tickets', 'Tickets'],
                  ['weekly', 'Weekly checklist'],
                  ['period', 'Period checklist'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === k ? 'bg-navy text-white shadow-sm' : 'text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {view !== 'tickets' && (
              <button
                onClick={() => window.print()}
                aria-label="Print checklist"
                className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink"
              >
                <Printer size={15} />
              </button>
            )}
          </div>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        {view === 'weekly' && (
          <Checklist
            sections={CHECKLISTS.weekly as ChecklistSection[]}
            storageKey={`maint:weekly:${mondayOf(t)}`}
            note="Anything you find becomes a ticket — log it on the Tickets tab so it gets chased."
          />
        )}
        {view === 'period' && (
          <Checklist
            sections={CHECKLISTS.period as ChecklistSection[]}
            storageKey={`maint:period:${periodKey(t)}`}
            note="Deep checks once a period. Carry unfinished repairs forward as tickets."
          />
        )}
        {view === 'tickets' && (
          <>
            <Card className="p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={form.equipment}
                  onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                  placeholder="Equipment / area (walk-in, fryer #2…)"
                  className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as Ticket['priority'] })}
                  className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
                <input
                  value={form.issue}
                  onChange={(e) => setForm({ ...form, issue: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="What's wrong?"
                  className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:col-span-2"
                />
              </div>
              <button onClick={add} className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
                Log issue
              </button>
            </Card>

            {open.length === 0 && resolved.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <Wrench size={24} />
                </div>
                <p className="text-sm text-muted">No maintenance issues logged. Nice.</p>
              </Card>
            ) : (
              <>
                {open.map((r) => (
                  <Row key={r.id} t={r} onToggle={() => toggle(r.id)} onDelete={() => remove(r)} />
                ))}
                {resolved.length > 0 && (
                  <details>
                    <summary className="cursor-pointer px-1 text-xs font-semibold text-muted">
                      Resolved ({resolved.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {resolved.map((r) => (
                        <Row key={r.id} t={r} onToggle={() => toggle(r.id)} onDelete={() => remove(r)} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * The owner's walkthrough sheet (from the dropped checklist file). Checks are
 * stored under a week/period-stamped key, so every new week or period starts
 * with a fresh sheet — history stays on the device under the old keys.
 */
function Checklist({ sections, storageKey, note }: { sections: ChecklistSection[]; storageKey: string; note: string }) {
  const [done, setDone] = usePersistentState<Record<string, boolean>>(storageKey, {})
  const all = sections.flatMap((s) => s.items.map((it) => `${s.title}|${it}`))
  const doneCount = all.filter((k) => done[k]).length
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0

  return (
    <>
      <Card className="flex items-center gap-4 p-4 print:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-ink">
              {doneCount}/{all.length} checked
            </span>
            <span className="font-mono text-xs text-muted">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{note}</p>
        </div>
      </Card>
      {sections.map((sec) => {
        const secDone = sec.items.filter((it) => done[`${sec.title}|${it}`]).length
        return (
          <Card key={sec.title} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/5 bg-black/[0.02] px-4 py-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-brand-600">{sec.title}</span>
              <span className="text-xs text-muted">
                {secDone}/{sec.items.length}
              </span>
            </div>
            {sec.items.map((it) => {
              const k = `${sec.title}|${it}`
              return (
                <button
                  key={it}
                  onClick={() => setDone((d) => ({ ...d, [k]: !d[k] }))}
                  className={`flex w-full items-start gap-3 border-b border-black/5 px-4 py-2.5 text-left last:border-0 ${
                    done[k] ? 'bg-up/5' : ''
                  }`}
                >
                  <span
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 text-[11px] transition-colors ${
                      done[k] ? 'border-up bg-up text-white' : 'border-black/20'
                    }`}
                  >
                    {done[k] && '✓'}
                  </span>
                  <span className={`text-sm ${done[k] ? 'text-muted line-through' : 'text-ink'}`}>{it}</span>
                </button>
              )
            })}
          </Card>
        )
      })}
    </>
  )
}

function Row({ t, onToggle, onDelete }: { t: Ticket; onToggle: () => void; onDelete: () => void }) {
  return (
    <Card className={`flex items-center gap-3 p-3 ${t.resolved ? 'opacity-60' : ''}`}>
      <button
        onClick={onToggle}
        aria-label={t.resolved ? 'Reopen' : 'Resolve'}
        className={`grid size-7 shrink-0 place-items-center rounded-md border-2 ${
          t.resolved ? 'border-up bg-up text-white' : 'border-black/20'
        }`}
      >
        {t.resolved && <Check size={15} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`truncate font-medium text-ink ${t.resolved ? 'line-through' : ''}`}>{t.equipment}</div>
        <div className="truncate text-xs text-muted">
          {t.issue} · {t.date}
        </div>
      </div>
      {!t.resolved && (
        <span className={`text-[10px] font-bold uppercase ${PRIORITY[t.priority]}`}>{t.priority}</span>
      )}
      <button onClick={onDelete} aria-label="Delete" className="text-muted hover:text-down">
        ✕
      </button>
    </Card>
  )
}
