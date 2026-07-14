import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { useScope, useCurrentNames } from '../lib/scope'
import { usePersistentState } from '../lib/store'
import { requirePin } from '../lib/pin'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'

/**
 * Weekly targets — Admin-set per store (handoff spec). Labor ≤ % flags the
 * nightly labor pill; Growth +% drives goal comparisons as history builds.
 */
function WeeklyTargets() {
  const [targets, setTargets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  const { location } = useCurrentNames()
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">
        Weekly targets · {location}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">
            Labor ≤
          </span>
          <div className="relative w-28">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={targets.laborPct}
              onChange={(e) => setTargets((t) => ({ ...t, laborPct: parseFloat(e.target.value) || 0 }))}
              className="w-full rounded-lg border border-black/10 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-brand"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">
            Growth
          </span>
          <div className="relative w-28">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">+</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={targets.growthPct}
              onChange={(e) => setTargets((t) => ({ ...t, growthPct: parseFloat(e.target.value) || 0 }))}
              className="w-full rounded-lg border border-black/10 bg-white py-2 pl-7 pr-8 text-sm outline-none focus:border-brand"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
          </div>
        </label>
        <p className="min-w-0 flex-1 self-end text-xs text-muted text-pretty">
          These feed the goal pills — nightly labor flag, period review, forecast labor budget.
          Saved per store.
        </p>
      </div>
    </Card>
  )
}

/**
 * Tracked items — which items headline the dashboard's TRACKED band
 * (handoff spec: Admin → Tracked items). Tiles fill from PMIX drops.
 */
function TrackedItems() {
  const [tracked, setTracked] = usePersistentState<string[]>('tracked:items', [])
  const [adding, setAdding] = useState('')
  const add = () => {
    if (!adding.trim()) return
    setTracked((ts) => [...new Set([...ts, adding.trim()])])
    setAdding('')
  }
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">
        Tracked items · dashboard tiles
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tracked.length === 0 && (
          <span className="text-xs text-muted">Nothing tracked yet — add the items you watch.</span>
        )}
        {tracked.map((name) => (
          <span key={name} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-ink">
            {name}
            <button
              onClick={async () => {
                if (await confirmDelete(`Stop tracking ${name}?`, undefined, 'Remove'))
                  setTracked((ts) => ts.filter((x) => x !== name))
              }}
              aria-label={`Stop tracking ${name}`}
              className="text-muted hover:text-down"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add an item to track (matches your PMIX by name)…"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          Add
        </button>
      </div>
    </Card>
  )
}

export function Stores() {
  const concepts = useScope((s) => s.concepts)
  const currentConcept = useScope((s) => s.currentConcept)
  const currentLocation = useScope((s) => s.currentLocation)
  const { setCurrent, addConcept, addLocation, renameConcept, renameLocation, removeLocation } =
    useScope()
  const [newConcept, setNewConcept] = useState('')
  const [newLoc, setNewLoc] = useState<Record<string, string>>({})

  // PIN-gated per the handoff: adding stores/concepts is a GM/Admin action.
  const gatedAddLocation = async (conceptId: string) => {
    const name = (newLoc[conceptId] ?? '').trim()
    if (!name) return
    if (!(await requirePin('Add a location'))) return
    addLocation(conceptId, name)
    setNewLoc((m) => ({ ...m, [conceptId]: '' }))
  }
  const gatedAddConcept = async () => {
    if (!newConcept.trim()) return
    if (!(await requirePin('Add a concept'))) return
    addConcept(newConcept)
    setNewConcept('')
  }

  const totalLocs = concepts.reduce((n, c) => n + c.locations.length, 0)
  const restoreRef = useRef<HTMLInputElement>(null)

  // Export/restore EVERYTHING the app knows (prototype Admin spec): every
  // mugops: key, one JSON file. The safety net against lost devices.
  const exportBackup = () => {
    const data: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith('mugops:')) data[k] = localStorage.getItem(k)!
    }
    const blob = new Blob([JSON.stringify({ app: 'mugshots-ops', exportedAt: new Date().toISOString(), data }, null, 1)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mugshots-ops-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const restoreBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      const data: Record<string, string> = parsed.data ?? parsed
      const keys = Object.keys(data).filter((k) => k.startsWith('mugops:'))
      if (keys.length === 0) {
        alert('That file has no Mugshots Ops data in it.')
        return
      }
      if (
        !(await confirmDelete(
          `Restore ${keys.length} records from this backup?`,
          'Existing data with the same keys is overwritten. Export a backup first if unsure.',
          'Restore',
        ))
      )
        return
      for (const k of keys) localStorage.setItem(k, data[k])
      location.reload()
    } catch {
      alert('Could not read that backup file.')
    }
  }

  return (
    <>
      <PageHeader
        title="Stores & Concepts"
        subtitle={`${concepts.length} concept${concepts.length === 1 ? '' : 's'} · ${totalLocs} location${totalLocs === 1 ? '' : 's'} · GM & above`}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={exportBackup}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white"
            >
              <Download size={13} /> Export backup
            </button>
            <button
              onClick={() => restoreRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-bold text-ink"
            >
              <Upload size={13} /> Restore
            </button>
            <input
              ref={restoreRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) restoreBackup(f)
                e.target.value = ''
              }}
            />
          </div>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="border-brand/20 bg-brand/5 p-4 text-sm text-ink/80">
          Each location keeps its own prep, inventory, tips, checklists, and numbers. Switch between
          them anytime from the store menu at the top of the nav. Add as many concepts and locations
          as you need.
        </Card>

        <WeeklyTargets />

        <TrackedItems />

        {concepts.map((c) => (
          <Card key={c.id} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-3">
              <input
                defaultValue={c.name}
                onBlur={(e) => e.target.value.trim() && renameConcept(c.id, e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 font-display text-lg font-semibold text-ink outline-none hover:border-black/10 focus:border-brand"
              />
              <span className="text-xs text-muted">{c.locations.length} loc.</span>
            </div>

            {c.locations.map((l) => {
              const active = c.id === currentConcept && l.id === currentLocation
              return (
                <div key={l.id} className="flex items-center gap-2 border-b border-black/5 px-4 py-2.5 last:border-0">
                  <button
                    onClick={() => setCurrent(c.id, l.id)}
                    aria-label="Set active"
                    className={`size-3 shrink-0 rounded-full ${active ? 'bg-brand' : 'bg-black/15 hover:bg-brand/40'}`}
                  />
                  <input
                    defaultValue={l.name}
                    onBlur={(e) => e.target.value.trim() && renameLocation(c.id, l.id, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 text-sm text-ink outline-none hover:border-black/10 focus:border-brand"
                  />
                  {active && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                      ACTIVE
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      if (c.locations.length <= 1) {
                        alert('A concept needs at least one location.')
                        return
                      }
                      if (await confirmDelete(`Remove ${l.name}?`, 'Its data stays saved but the location is hidden.', 'Remove'))
                        removeLocation(c.id, l.id)
                    }}
                    aria-label="Remove location"
                    className="text-muted hover:text-down"
                  >
                    ✕
                  </button>
                </div>
              )
            })}

            <div className="flex gap-2 p-3">
              <input
                value={newLoc[c.id] ?? ''}
                onChange={(e) => setNewLoc((m) => ({ ...m, [c.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && gatedAddLocation(c.id)}
                placeholder="Add a location…"
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={() => gatedAddLocation(c.id)}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white"
              >
                Add
              </button>
            </div>
          </Card>
        ))}

        {/* Add concept */}
        <Card className="p-4">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">
            New concept
          </div>
          <div className="flex gap-2">
            <input
              value={newConcept}
              onChange={(e) => setNewConcept(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && gatedAddConcept()}
              placeholder="e.g. second restaurant brand"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={gatedAddConcept}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Add concept
            </button>
          </div>
        </Card>
      </div>
    </>
  )
}
