import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { Wrench, Check } from 'lucide-react'

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

/**
 * Maintenance — the equipment repair log. Log what's broken, set a priority,
 * and chase it to resolved. The weekly & period walkthrough checklists live on
 * the Checklists page now; anything you find on a walk becomes a ticket here.
 */
export function Maintenance() {
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

  return (
    <>
      <PageHeader title="Maintenance" subtitle={`Equipment repair log · ${open.length} open · ${resolved.length} resolved`} />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
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
          <p className="mt-2 text-[11px] text-muted">
            Doing a weekly or period walkthrough? It's on the{' '}
            <Link to="/checklists" className="font-semibold text-brand">
              Checklists
            </Link>{' '}
            page — log anything you find broken here.
          </p>
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
      </div>
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
      {!t.resolved && <span className={`text-[10px] font-bold uppercase ${PRIORITY[t.priority]}`}>{t.priority}</span>}
      <button onClick={onDelete} aria-label="Delete" className="text-muted hover:text-down">
        ✕
      </button>
    </Card>
  )
}
