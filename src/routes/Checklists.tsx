import { useMemo, useState } from 'react'
import { Pencil, Check } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'

type Phase = 'Opening' | 'Closing' | 'Weekly'
const PHASES: Phase[] = ['Opening', 'Closing', 'Weekly']

const DEFAULTS: Record<Phase, string[]> = {
  Opening: [
    'Disarm alarm, unlock doors',
    'Turn on all equipment (grills, fryers, ovens)',
    'Check walk-in & freezer temps, log them',
    'Verify prep is stocked to par for the day',
    'Count opening drawer / set up POS',
    'Walk the dining room & patio — clean and set',
    'Review reservations, caterings & 86 list',
    'Pre-shift huddle with staff',
  ],
  Closing: [
    'All stations broken down & sanitized',
    'Reconcile drawers & run end-of-day on POS',
    'Deposit prepared & logged',
    'Walk-in / line temps logged',
    'Trash out, floors swept & mopped',
    'Equipment off (except overnight units)',
    'Set alarm, lock all doors',
    'Confirm tomorrow’s prep & orders are set',
  ],
  Weekly: [
    'Deep clean fryers / filter oil',
    'Clean walk-in shelving & floors',
    'Pull & clean behind the line',
    'Check first-aid & cleaning supply pars',
    'Test & date fire suppression / hood cleaning',
    'Review labor & food cost for the week',
  ],
}

/**
 * Checklists — desktop-first: all three lists side by side, check off as you
 * walk. Edit mode (top right) turns every task into an editable row with
 * remove + add, per list.
 */
export function Checklists() {
  const [data, setData] = usePersistentState<Record<Phase, string[]>>('checklists:data', DEFAULTS)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <PageHeader
        title="Checklists"
        subtitle={`Opening & Closing reset daily · Weekly resets each week · ${today()}`}
        right={
          <button
            onClick={() => setEditing((e) => !e)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold ${
              editing ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
            }`}
          >
            {editing ? (
              <>
                <Check size={15} /> Done editing
              </>
            ) : (
              <>
                <Pencil size={14} /> Edit lists
              </>
            )}
          </button>
        }
      />
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {PHASES.map((phase) => (
            <PhaseColumn key={phase} phase={phase} data={data} setData={setData} editing={editing} />
          ))}
        </div>
      </div>
    </>
  )
}

function PhaseColumn({
  phase,
  data,
  setData,
  editing,
}: {
  phase: Phase
  data: Record<Phase, string[]>
  setData: React.Dispatch<React.SetStateAction<Record<Phase, string[]>>>
  editing: boolean
}) {
  const scope = phase === 'Weekly' ? weekKey() : today()
  const [done, setDone] = usePersistentState<Record<string, boolean>>(
    `checklists:done:${phase}:${scope}`,
    {},
  )
  const [adding, setAdding] = useState('')
  const items = data[phase] ?? []
  const doneCount = useMemo(() => items.filter((t) => done[t]).length, [items, done])
  const complete = items.length > 0 && doneCount === items.length

  const addTask = () => {
    if (!adding.trim()) return
    setData((d) => ({ ...d, [phase]: [...(d[phase] ?? []), adding.trim()] }))
    setAdding('')
  }

  return (
    <Card className="overflow-hidden">
      <div
        className={`flex items-baseline justify-between border-b px-4 py-3 ${
          complete ? 'border-up/20 bg-up/10' : 'border-black/5 bg-black/[0.02]'
        }`}
      >
        <span className="font-display text-lg font-semibold text-ink">{phase}</span>
        <span className={`text-xs font-bold ${complete ? 'text-up' : 'text-muted'}`}>
          {complete ? 'Complete ✓' : `${doneCount}/${items.length}`}
        </span>
      </div>
      {items.map((t, i) =>
        editing ? (
          <div key={i} className="flex items-center gap-2 border-b border-black/5 px-3 py-2 last:border-0">
            <input
              value={t}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  [phase]: (d[phase] ?? []).map((x, j) => (j === i ? e.target.value : x)),
                }))
              }
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={async () => {
                if (await confirmDelete(`Remove "${t}" from the ${phase} checklist?`))
                  setData((d) => ({ ...d, [phase]: (d[phase] ?? []).filter((_, j) => j !== i) }))
              }}
              aria-label="Remove"
              className="px-2 text-muted hover:text-down"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            key={i}
            onClick={() => setDone((d) => ({ ...d, [t]: !d[t] }))}
            className={`flex w-full items-start gap-3 border-b border-black/5 px-4 py-2.5 text-left last:border-0 ${
              done[t] ? 'bg-up/5' : 'hover:bg-black/[0.02]'
            }`}
          >
            <span
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 text-[10px] transition-colors ${
                done[t] ? 'border-up bg-up text-white' : 'border-black/20'
              }`}
            >
              {done[t] && '✓'}
            </span>
            <span className={`text-sm ${done[t] ? 'text-muted line-through' : 'text-ink'}`}>{t}</span>
          </button>
        ),
      )}
      {editing && (
        <div className="flex gap-2 p-3">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder={`Add a ${phase} task…`}
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button onClick={addTask} className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">
            Add
          </button>
        </div>
      )}
    </Card>
  )
}

/** Year + ISO week number, e.g. "2026-W28". */
function weekKey(): string {
  const d = new Date()
  const day = (d.getDay() + 6) % 7
  const thu = new Date(d)
  thu.setDate(d.getDate() - day + 3)
  const firstThu = new Date(thu.getFullYear(), 0, 4)
  const week = 1 + Math.round((thu.getTime() - firstThu.getTime()) / 604800000)
  return `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`
}
