import { useMemo, useState } from 'react'
import { Pencil, Check, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { periodWeek } from '../lib/forecast'
import MAINT from '../data/maintenance-checklists.json'

type Phase = 'Opening' | 'Closing' | 'Weekly' | 'Period'
const PHASES: Phase[] = ['Opening', 'Closing', 'Weekly', 'Period']

interface Section {
  title: string // '' renders with no section header (used for Opening/Closing)
  items: string[]
}

// Opening/Closing are the daily shift walkthroughs; Weekly/Period come straight
// from the owner's maintenance checklist (same source the Maintenance page uses).
const DEFAULTS: Record<Phase, Section[]> = {
  Opening: [
    {
      title: '',
      items: [
        'Disarm alarm, unlock doors',
        'Turn on all equipment (grills, fryers, ovens)',
        'Check walk-in & freezer temps, log them',
        'Verify prep is stocked to par for the day',
        'Count opening drawer / set up POS',
        'Walk the dining room & patio — clean and set',
        'Review reservations, caterings & 86 list',
        'Pre-shift huddle with staff',
      ],
    },
  ],
  Closing: [
    {
      title: '',
      items: [
        'All stations broken down & sanitized',
        'Reconcile drawers & run end-of-day on POS',
        'Deposit prepared & logged',
        'Walk-in / line temps logged',
        'Trash out, floors swept & mopped',
        'Equipment off (except overnight units)',
        'Set alarm, lock all doors',
        'Confirm tomorrow’s prep & orders are set',
      ],
    },
  ],
  Weekly: MAINT.weekly as Section[],
  Period: MAINT.period as Section[],
}

/** How often each phase's checkmarks reset — daily, weekly (Mon), or by period. */
const CADENCE: Record<Phase, string> = {
  Opening: 'resets daily',
  Closing: 'resets daily',
  Weekly: 'resets every Monday',
  Period: 'resets each period',
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
/** The stamp that scopes a phase's checkmarks, so a new day/week/period is fresh. */
function scopeFor(phase: Phase): string {
  const t = today()
  if (phase === 'Weekly') return mondayOf(t)
  if (phase === 'Period') return `${t.slice(0, 4)}-P${periodWeek(t).period}`
  return t
}

/**
 * Checklists — one page, one toggle: Opening · Closing · Weekly · Period.
 * Opening/Closing are the daily shift walkthroughs; Weekly/Period are the
 * owner's maintenance checklist. Each phase's checks reset on its own cadence.
 */
export function Checklists() {
  const [data, setData] = usePersistentState<Record<Phase, Section[]>>('checklists:sections', DEFAULTS)
  const [phase, setPhase] = useState<Phase>('Opening')
  const [editing, setEditing] = useState(false)

  // Guard against a stale/legacy shape so a bad value never blanks the page.
  const sections = Array.isArray(data?.[phase]) ? data[phase] : DEFAULTS[phase]

  return (
    <>
      <PageHeader
        title="Checklists"
        subtitle={`${phase} · ${CADENCE[phase]} · ${today()}`}
        right={
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => setEditing((e) => !e)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
                editing ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
              }`}
            >
              {editing ? <Check size={13} /> : <Pencil size={12} />} {editing ? 'Done' : 'Edit'}
            </button>
            <button
              onClick={() => window.print()}
              aria-label="Print this checklist"
              className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink"
            >
              <Printer size={14} />
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Phase toggle */}
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/5 p-1 print:hidden">
          {PHASES.map((ph) => (
            <PhaseTab key={ph} phase={ph} active={ph === phase} data={data} onPick={() => setPhase(ph)} />
          ))}
        </div>

        <ChecklistBody
          phase={phase}
          sections={sections}
          editing={editing}
          setData={setData}
        />

        {(phase === 'Weekly' || phase === 'Period') && (
          <p className="text-[11px] text-muted print:hidden">
            Find something broken on a walk? Log it as a repair on the{' '}
            <Link to="/maintenance" className="font-semibold text-brand">
              Maintenance
            </Link>{' '}
            page so it gets chased.
          </p>
        )}
      </div>
    </>
  )
}

/** A toggle button that also shows that phase's live progress for its cadence. */
function PhaseTab({
  phase,
  active,
  data,
  onPick,
}: {
  phase: Phase
  active: boolean
  data: Record<Phase, Section[]>
  onPick: () => void
}) {
  const [done] = usePersistentState<Record<string, boolean>>(`checklists:done:${phase}:${scopeFor(phase)}`, {})
  const secs = Array.isArray(data?.[phase]) ? data[phase] : DEFAULTS[phase]
  const all = secs.flatMap((s) => s.items.map((it) => `${s.title}|${it}`))
  const doneCount = all.filter((k) => done[k]).length
  const complete = all.length > 0 && doneCount === all.length
  return (
    <button
      onClick={onPick}
      className={`rounded-lg px-2 py-2 text-center transition-colors ${
        active ? 'bg-white shadow-sm' : 'hover:bg-white/50'
      }`}
    >
      <span className={`block text-xs font-bold ${active ? 'text-ink' : 'text-muted'}`}>{phase}</span>
      <span className={`block text-[10px] font-semibold ${complete ? 'text-up' : active ? 'text-brand-600' : 'text-muted/70'}`}>
        {complete ? 'done ✓' : `${doneCount}/${all.length}`}
      </span>
    </button>
  )
}

/** The checkable body for one phase — its checks are stamped by cadence scope. */
function ChecklistBody({
  phase,
  sections,
  editing,
  setData,
}: {
  phase: Phase
  sections: Section[]
  editing: boolean
  setData: React.Dispatch<React.SetStateAction<Record<Phase, Section[]>>>
}) {
  const [done, setDone] = usePersistentState<Record<string, boolean>>(`checklists:done:${phase}:${scopeFor(phase)}`, {})
  const [adding, setAdding] = useState<Record<number, string>>({})

  const all = useMemo(() => sections.flatMap((s) => s.items.map((it) => `${s.title}|${it}`)), [sections])
  const doneCount = all.filter((k) => done[k]).length
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0

  const editItem = (si: number, ii: number, val: string) =>
    setData((d) => ({
      ...d,
      [phase]: d[phase].map((s, x) => (x === si ? { ...s, items: s.items.map((it, y) => (y === ii ? val : it)) } : s)),
    }))
  const removeItem = (si: number, ii: number) =>
    setData((d) => ({ ...d, [phase]: d[phase].map((s, x) => (x === si ? { ...s, items: s.items.filter((_, y) => y !== ii) } : s)) }))
  const addItem = (si: number) => {
    const v = (adding[si] ?? '').trim()
    if (!v) return
    setData((d) => ({ ...d, [phase]: d[phase].map((s, x) => (x === si ? { ...s, items: [...s.items, v] } : s)) }))
    setAdding((a) => ({ ...a, [si]: '' }))
  }

  return (
    <>
      {/* Progress */}
      <Card className="p-4 print:hidden">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-ink">
            {doneCount}/{all.length} checked
          </span>
          <span className="font-mono text-xs text-muted">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {sections.map((sec, si) => {
        const secDone = sec.items.filter((it) => done[`${sec.title}|${it}`]).length
        return (
          <Card key={sec.title || si} className="overflow-hidden">
            {sec.title && (
              <div className="flex items-center justify-between border-b border-black/5 bg-black/[0.02] px-4 py-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-brand-600">{sec.title}</span>
                <span className="text-xs text-muted">
                  {secDone}/{sec.items.length}
                </span>
              </div>
            )}
            {sec.items.map((it, ii) => {
              const k = `${sec.title}|${it}`
              return editing ? (
                <div key={ii} className="flex items-center gap-2 border-b border-black/5 px-3 py-2 last:border-0">
                  <input
                    value={it}
                    onChange={(e) => editItem(si, ii, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                  />
                  <button
                    onClick={async () => {
                      if (await confirmDelete(`Remove "${it}"?`)) removeItem(si, ii)
                    }}
                    aria-label="Remove"
                    className="px-2 text-muted hover:text-down"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  key={ii}
                  onClick={() => setDone((d) => ({ ...d, [k]: !d[k] }))}
                  className={`flex w-full items-start gap-3 border-b border-black/5 px-4 py-2.5 text-left last:border-0 ${
                    done[k] ? 'bg-up/5' : 'hover:bg-black/[0.02]'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 text-[10px] transition-colors ${
                      done[k] ? 'border-up bg-up text-white' : 'border-black/20'
                    }`}
                  >
                    {done[k] && '✓'}
                  </span>
                  <span className={`text-sm ${done[k] ? 'text-muted line-through' : 'text-ink'}`}>{it}</span>
                </button>
              )
            })}
            {editing && (
              <div className="flex gap-2 p-3">
                <input
                  value={adding[si] ?? ''}
                  onChange={(e) => setAdding((a) => ({ ...a, [si]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addItem(si)}
                  placeholder="Add an item…"
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <button onClick={() => addItem(si)} className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">
                  Add
                </button>
              </div>
            )}
          </Card>
        )
      })}
    </>
  )
}
