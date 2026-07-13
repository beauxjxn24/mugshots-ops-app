import { useMemo, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { SIDEWORK, ROLES, phasesFor, type Role, type Section } from '../lib/sidework'

type Data = Record<Role, Record<string, Section[]>>

export function Sidework() {
  // Editable copy of the duty sheet, persisted to the device.
  const [data, setData] = usePersistentState<Data>('sidework:data', SIDEWORK)
  const [role, setRole] = useState<Role>('Server')
  const phases = phasesFor(role)
  const [phase, setPhase] = useState<string>(phases[0])
  const [editing, setEditing] = useState(false)
  const [done, setDone] = usePersistentState<Record<string, boolean>>(`sidework:done:${today()}`, {})
  const [adding, setAdding] = useState<Record<number, string>>({})

  const activePhase = phases.includes(phase) ? phase : phases[0]
  const sections = data[role]?.[activePhase] ?? []

  const key = (s: string, t: string) => `${role}|${activePhase}|${s}|${t}`
  const allTasks = useMemo(
    () => sections.flatMap((s) => s.tasks.map((t) => key(s.section, t))),
    [sections, role, activePhase],
  )
  const doneCount = allTasks.filter((k) => done[k]).length

  // ---- editing helpers (immutable updates on data[role][activePhase]) ----
  const setSections = (updater: (secs: Section[]) => Section[]) =>
    setData((d) => ({
      ...d,
      [role]: { ...d[role], [activePhase]: updater(d[role][activePhase] ?? []) },
    }))
  const editTask = (si: number, ti: number, text: string) =>
    setSections((secs) =>
      secs.map((s, i) =>
        i === si ? { ...s, tasks: s.tasks.map((t, j) => (j === ti ? text : t)) } : s,
      ),
    )
  const removeTask = async (si: number, ti: number, text: string) => {
    if (!(await confirmDelete(`Remove "${text}" from this duty sheet?`))) return
    setSections((secs) =>
      secs.map((s, i) => (i === si ? { ...s, tasks: s.tasks.filter((_, j) => j !== ti) } : s)),
    )
  }
  const addTask = (si: number) => {
    const text = (adding[si] ?? '').trim()
    if (!text) return
    setSections((secs) => secs.map((s, i) => (i === si ? { ...s, tasks: [...s.tasks, text] } : s)))
    setAdding((a) => ({ ...a, [si]: '' }))
  }
  const resetPhase = () =>
    setData((d) => ({
      ...d,
      [role]: { ...d[role], [activePhase]: SIDEWORK[role][activePhase] },
    }))
  const clearChecks = () =>
    setDone((d) => {
      const next = { ...d }
      allTasks.forEach((k) => delete next[k])
      return next
    })

  return (
    <>
      <PageHeader
        title="Sidework"
        subtitle={`${role} · ${activePhase} · ${doneCount}/${allTasks.length} · ${today()}`}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing((e) => !e)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                editing ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
              }`}
            >
              {editing ? 'Done editing' : 'Edit'}
            </button>
            {!editing && doneCount > 0 && (
              <button
                onClick={clearChecks}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-muted"
              >
                Reset
              </button>
            )}
          </div>
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Role tabs */}
        <div className="flex gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r)
                setPhase(phasesFor(r)[0])
              }}
              className={`flex-1 rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors ${
                role === r
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Phase chips */}
        <div className="flex flex-wrap gap-2">
          {phases.map((ph) => (
            <button
              key={ph}
              onClick={() => setPhase(ph)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                activePhase === ph
                  ? 'border-navy bg-navy text-white'
                  : 'border-black/10 bg-white text-muted hover:border-navy/40'
              }`}
            >
              {ph}
            </button>
          ))}
        </div>

        {editing && (
          <div className="flex items-center justify-between rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm">
            <span className="text-ink/80">Editing {role} · {activePhase} — changes save automatically</span>
            <button onClick={resetPhase} className="font-semibold text-down">
              Reset to default
            </button>
          </div>
        )}

        {/* Sections */}
        {sections.map((sec, si) => {
          const secKeys = sec.tasks.map((t) => key(sec.section, t))
          const secDone = secKeys.filter((k) => done[k]).length
          return (
            <Card key={sec.section} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-black/5 bg-black/[0.02] px-4 py-2.5">
                <span className="font-display text-sm font-semibold text-ink">{sec.section}</span>
                {!editing && (
                  <span className="text-xs text-muted">
                    {secDone}/{sec.tasks.length}
                  </span>
                )}
              </div>

              {sec.tasks.map((t, ti) =>
                editing ? (
                  <div key={ti} className="flex items-center gap-2 border-b border-black/5 px-3 py-2 last:border-0">
                    <input
                      value={t}
                      onChange={(e) => editTask(si, ti, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                    />
                    <button
                      onClick={() => removeTask(si, ti, t)}
                      aria-label="Remove task"
                      className="shrink-0 px-2 text-muted hover:text-down"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    key={ti}
                    onClick={() => setDone((d) => ({ ...d, [key(sec.section, t)]: !d[key(sec.section, t)] }))}
                    className={`flex w-full items-start gap-3 border-b border-black/5 px-4 py-3 text-left last:border-0 ${
                      done[key(sec.section, t)] ? 'bg-up/5' : ''
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 text-xs transition-colors ${
                        done[key(sec.section, t)] ? 'border-up bg-up text-white' : 'border-black/20'
                      }`}
                    >
                      {done[key(sec.section, t)] && '✓'}
                    </span>
                    <span
                      className={`text-sm ${
                        done[key(sec.section, t)] ? 'text-muted line-through' : 'text-ink'
                      }`}
                    >
                      {t}
                    </span>
                  </button>
                ),
              )}

              {editing && (
                <div className="flex gap-2 p-3">
                  <input
                    value={adding[si] ?? ''}
                    onChange={(e) => setAdding((a) => ({ ...a, [si]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addTask(si)}
                    placeholder={`Add a duty to ${sec.section}…`}
                    className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button
                    onClick={() => addTask(si)}
                    className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add
                  </button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
