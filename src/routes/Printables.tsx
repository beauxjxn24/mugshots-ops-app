import { useState } from 'react'
import { Printer } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import { SIDEWORK, ROLES, phasesFor, type Role, type Section } from '../lib/sidework'
import { getCatalog, getFlags } from '../lib/catalog'

type Phase = 'Opening' | 'Closing' | 'Weekly'
type SidworkData = Record<Role, Record<string, Section[]>>

const SHEETS = ['Opening checklist', 'Closing checklist', 'Weekly checklist', 'Sidework', 'Inventory count'] as const
type Sheet = (typeof SHEETS)[number]

/**
 * Printables (handoff spec) — clean black-and-white sheets straight from your
 * live data: checklists, sidework duty sheets by role, and a blank inventory
 * count sheet. Pick a sheet, hit print.
 */
export function Printables() {
  const { location } = useCurrentNames()
  const [sheet, setSheet] = useState<Sheet>('Opening checklist')
  const [role, setRole] = useState<Role>('Server')
  const [checkData] = usePersistentState<Record<Phase, string[]>>('checklists:data', {
    Opening: [],
    Closing: [],
    Weekly: [],
  })
  const [sidework] = usePersistentState<SidworkData>('sidework:data', SIDEWORK)

  return (
    <>
      <PageHeader
        title="Printables"
        subtitle="Print-ready sheets from your live data"
        right={
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white print:hidden"
          >
            <Printer size={15} /> Print
          </button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap gap-2 print:hidden">
          {SHEETS.map((s) => (
            <button
              key={s}
              onClick={() => setSheet(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                sheet === s ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {s}
            </button>
          ))}
          {sheet === 'Sidework' && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand"
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
        </div>

        {/* The sheet itself — plain, ink-friendly */}
        <Card className="p-6 print:border-0 print:p-0 print:shadow-none">
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-2">
            <div>
              <div className="font-display text-xl font-semibold text-ink">
                {sheet === 'Sidework' ? `${role} Sidework` : sheet}
              </div>
              <div className="text-xs text-muted">{location}</div>
            </div>
            <div className="text-right text-xs text-muted">
              <div>Date: {today()}</div>
              <div className="mt-1">Completed by: ____________</div>
            </div>
          </div>

          {sheet.endsWith('checklist') && (
            <CheckSheet tasks={checkData[sheet.replace(' checklist', '') as Phase] ?? []} />
          )}
          {sheet === 'Sidework' && <SideworkSheet role={role} data={sidework} />}
          {sheet === 'Inventory count' && <InventorySheet />}
        </Card>
      </div>
    </>
  )
}

function CheckSheet({ tasks }: { tasks: string[] }) {
  if (tasks.length === 0) return <p className="text-sm text-muted">No tasks — edit the checklist on the Checklists screen.</p>
  return (
    <div className="space-y-0.5">
      {tasks.map((t, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-black/10 py-2 text-sm text-ink">
          <span className="inline-block size-4 shrink-0 rounded border-2 border-ink/50" />
          {t}
        </div>
      ))}
    </div>
  )
}

function SideworkSheet({ role, data }: { role: Role; data: SidworkData }) {
  const phases = phasesFor(role)
  return (
    <div className="space-y-5">
      {phases.map((phase) => (
        <div key={phase} className="break-inside-avoid">
          <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink">{phase}</div>
          {(data[role]?.[phase] ?? []).map((sec) => (
            <div key={sec.section} className="mb-2">
              <div className="text-[11px] font-bold text-muted">{sec.section}</div>
              {sec.tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-black/10 py-1.5 text-[13px] text-ink">
                  <span className="inline-block size-3.5 shrink-0 rounded border-2 border-ink/50" />
                  {t}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function InventorySheet() {
  const items = getCatalog()
  const flags = getFlags()
  const rows = items.filter((i) => flags[i.id])
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-2 border-ink text-left text-[10px] font-extrabold uppercase tracking-wide text-muted">
          <th className="py-1.5">Item</th>
          <th className="w-24 py-1.5">Unit</th>
          <th className="w-24 py-1.5 text-center">Count</th>
        </tr>
      </thead>
      <tbody>
        {(rows.length ? rows : Array.from({ length: 20 }, () => null)).map((it, i) => (
          <tr key={i} className="border-b border-black/10">
            <td className="py-2 text-ink">{it?.name ?? ''}</td>
            <td className="py-2 text-muted">{it?.unit ?? ''}</td>
            <td className="py-2 text-center text-muted">______</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
