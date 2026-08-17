import { useMemo, useRef, useState } from 'react'
import { Download, Upload, ClipboardPaste, Pencil, Check, History } from 'lucide-react'
import { confirmDelete } from '../lib/confirm'
import { PageHeader, Card } from '../components/ui'
import { SettingsCard } from '../components/SettingsCard'
import { useScope, useCurrentNames } from '../lib/scope'
import { usePersistentState } from '../lib/store'
import { requirePin } from '../lib/pin'
import { getSettingsAudit, logSettingChange, stampLabel } from '../lib/settings'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { DOW, type OrderSchedule } from '../lib/orderDays'
import { vendors } from '../lib/ordering'
import { getPmixDays } from '../lib/pmix'
import { clearImportedNumbers, fullResetStore } from '../lib/reset'

/**
 * Weekly targets — Admin-set per store (handoff spec). Labor ≤ % flags the
 * nightly labor pill; Growth +% drives goal comparisons as history builds.
 */
function WeeklyTargets() {
  const [targets, setTargets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  const { location } = useCurrentNames()
  const field =
    'w-full rounded-lg border border-black/10 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-brand disabled:cursor-not-allowed disabled:bg-black/[0.03]'
  return (
    <SettingsCard
      area="Weekly targets"
      title={<>Weekly targets · {location}</>}
      hint="These feed the goal pills — the nightly labor flag, period review, and the forecast labor budget. Saved per store."
      value={targets}
      onSave={(d) => setTargets(d)}
      summarize={(d, s) =>
        [d.laborPct !== s.laborPct && `labor ≤ ${s.laborPct}% → ${d.laborPct}%`,
         d.growthPct !== s.growthPct && `growth +${s.growthPct}% → +${d.growthPct}%`]
          .filter(Boolean)
          .join(', ') || undefined
      }
    >
      {(draft, setDraft) => (
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">Labor ≤</span>
            <div className="relative w-28">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={draft.laborPct}
                onChange={(e) => setDraft((t) => ({ ...t, laborPct: parseFloat(e.target.value) || 0 }))}
                className={field}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">Growth</span>
            <div className="relative w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">+</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={draft.growthPct}
                onChange={(e) => setDraft((t) => ({ ...t, growthPct: parseFloat(e.target.value) || 0 }))}
                className={`${field} !pl-7`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
            </div>
          </label>
        </div>
      )}
    </SettingsCard>
  )
}


/**
 * Delivery calendar — per vendor, the days an order is PLACED and the days it
 * ARRIVES. The Dashboard reads both: one pill for what has to go out today,
 * one for what's landing on the dock. Locked until Edit, saved on purpose,
 * stamped with who did it.
 */
function OrderDays() {
  const { location } = useCurrentNames()
  const [saved, setSaved] = usePersistentState<OrderSchedule[]>('ordering:schedule', [])
  const rows = useMemo(() => (Array.isArray(saved) ? saved : []), [saved])
  const [name, setName] = useState('')
  const known = useMemo(() => vendors(), [])

  const dayCount = (r: OrderSchedule[]) =>
    r.reduce((n, x) => n + x.days.length + (x.deliveryDays ?? []).length, 0)

  return (
    <SettingsCard
      area="Delivery calendar"
      title={<>Delivery calendar · {location}</>}
      hint="Per vendor: the days the order has to be placed, and the days it arrives. The Dashboard turns these into today's two order pills."
      value={rows}
      onSave={(d) => setSaved(d)}
      summarize={(d, s) => {
        const bits: string[] = []
        if (d.length !== s.length) bits.push(`${s.length} → ${d.length} vendors`)
        const dd = dayCount(d) - dayCount(s)
        if (dd) bits.push(`${dd > 0 ? '+' : ''}${dd} day${Math.abs(dd) === 1 ? '' : 's'}`)
        return bits.join(', ') || 'vendor details edited'
      }}
    >
      {(draft, setDraft, unlocked) => {
        const add = () => {
          const v = name.trim()
          if (!v || draft.some((r) => r.vendor.toLowerCase() === v.toLowerCase())) return
          setDraft((d) => [...d, { vendor: v, days: [], deliveryDays: [] }])
          setName('')
        }
        const toggle = (vendor: string, field: 'days' | 'deliveryDays', d: number) =>
          setDraft((rs) =>
            rs.map((r) => {
              if (r.vendor !== vendor) return r
              const cur = r[field] ?? []
              return { ...r, [field]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() }
            }),
          )
        const setCutoff = (vendor: string, cutoff: string) =>
          setDraft((rs) => rs.map((r) => (r.vendor === vendor ? { ...r, cutoff } : r)))
        const remove = async (vendor: string) => {
          if (await confirmDelete(`Remove ${vendor} from the delivery calendar?`, 'Their order guide and history stay — only the day schedule goes.', 'Remove'))
            setDraft((rs) => rs.filter((r) => r.vendor !== vendor))
        }

        const DayRow = ({
          r,
          field,
          label,
          tone,
        }: {
          r: OrderSchedule
          field: 'days' | 'deliveryDays'
          label: string
          tone: 'place' | 'receive'
        }) => {
          const on = r[field] ?? []
          return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-20 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                {label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DOW.map((d, i) => {
                  const active = on.includes(i)
                  return (
                    <button
                      key={d}
                      onClick={() => toggle(r.vendor, field, i)}
                      aria-pressed={active}
                      className={`min-w-[42px] rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        active
                          ? tone === 'place'
                            ? 'bg-brand text-navy shadow-[0_0_12px_rgba(228,184,76,0.35)]'
                            : 'bg-signal text-navy shadow-[0_0_12px_rgba(79,227,193,0.35)]'
                          : 'border border-black/10 bg-white text-muted enabled:hover:text-ink'
                      }`}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
              {on.length === 0 && <span className="text-[11px] text-muted">none set</span>}
            </div>
          )
        }

        return (
          <>
            {draft.length === 0 && (
              <p className="mb-3 text-sm text-muted">
                {unlocked ? 'Add your first vendor below.' : 'No delivery calendar yet — tap Edit to set one up.'}
              </p>
            )}

            <div className="space-y-2">
              {draft.map((r) => (
                <div key={r.vendor} className="rounded-xl border border-black/10 bg-black/[0.015] p-3">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="font-semibold text-ink">{r.vendor}</span>
                    <input
                      value={r.cutoff ?? ''}
                      onChange={(e) => setCutoff(r.vendor, e.target.value)}
                      placeholder="cutoff (10:00 AM)"
                      className="ml-auto w-36 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-ink outline-none focus:border-brand disabled:bg-transparent disabled:opacity-60"
                    />
                    <button
                      onClick={() => remove(r.vendor)}
                      aria-label={`Remove ${r.vendor}`}
                      className="text-muted enabled:hover:text-down"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-2">
                    <DayRow r={r} field="days" label="Place" tone="place" />
                    <DayRow r={r} field="deliveryDays" label="Arrives" tone="receive" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                list="orderday-vendors"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="Vendor (Capital City, US Foods…)"
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand disabled:bg-black/[0.03]"
              />
              <datalist id="orderday-vendors">
                {known.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              <button
                onClick={add}
                disabled={!name.trim()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Add vendor
              </button>
            </div>
          </>
        )
      }}
    </SettingsCard>
  )
}

/**
 * Tracked items — which items headline the dashboard's TRACKED band
 * (handoff spec: Admin → Tracked items). Tiles fill from PMIX drops.
 */
function TrackedItems() {
  const [rawTracked, setTracked] = usePersistentState<string[]>('tracked:items', [])
  const tracked = Array.isArray(rawTracked) ? rawTracked : []
  const [adding, setAdding] = useState('')

  // Predictive text tied to REAL PMIX items — you can only track something
  // that actually shows up in your product mix, so every tile fills in.
  const pmixNames = useMemo(() => {
    const days = getPmixDays()
    const set = new Set<string>()
    for (const d of Object.values(days)) for (const it of d.items) if (it.name.trim()) set.add(it.name.trim())
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [])
  return (
    <SettingsCard
      area="Tracked items"
      title="Tracked items · dashboard tiles"
      hint="The items that headline the dashboard's TRACKED band. Suggestions come from your real product mix, so every tile fills in."
      value={tracked}
      onSave={(d) => setTracked(d)}
      summarize={(d, s) => {
        const added = d.filter((x) => !s.includes(x))
        const gone = s.filter((x) => !d.includes(x))
        return [added.length && `added ${added.join(', ')}`, gone.length && `removed ${gone.join(', ')}`]
          .filter(Boolean)
          .join('; ') || undefined
      }}
    >
      {(draft, setDraft, unlocked) => {
        const q = adding.trim().toLowerCase()
        const suggestions =
          q.length < 2
            ? []
            : pmixNames
                .filter((n) => n.toLowerCase().includes(q) && !draft.some((t) => t.toLowerCase() === n.toLowerCase()))
                .slice(0, 8)
        const exactPmix = pmixNames.find((n) => n.toLowerCase() === q)

        const add = (name?: string) => {
          const pick = (name ?? adding).trim()
          if (!pick) return
          // With PMIX on file, only real PMIX names go up — anything else
          // would never get tracked.
          if (pmixNames.length > 0 && !pmixNames.some((n) => n.toLowerCase() === pick.toLowerCase())) return
          setDraft((ts) => [...new Set([...ts, pick])])
          setAdding('')
        }

        return (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {draft.length === 0 && (
                <span className="text-xs text-muted">
                  {unlocked ? 'Add the items you watch.' : 'Nothing tracked yet — tap Edit to add the items you watch.'}
                </span>
              )}
              {draft.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-ink"
                >
                  {name}
                  <button
                    onClick={async () => {
                      if (await confirmDelete(`Stop tracking ${name}?`, undefined, 'Remove'))
                        setDraft((ts) => ts.filter((x) => x !== name))
                    }}
                    aria-label={`Stop tracking ${name}`}
                    className="text-muted enabled:hover:text-down"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <div className="flex gap-2">
                <input
                  value={adding}
                  onChange={(e) => setAdding(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') add(suggestions.length === 1 ? suggestions[0] : undefined)
                    if (e.key === 'Escape') setAdding('')
                  }}
                  placeholder={
                    pmixNames.length
                      ? 'Start typing — matches your real PMIX items…'
                      : 'Add an item to track (drop a PMIX on Imports to get suggestions)…'
                  }
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-black/[0.03]"
                />
                <button
                  onClick={() => add()}
                  disabled={pmixNames.length > 0 && !exactPmix}
                  title={pmixNames.length > 0 && !exactPmix ? 'Pick a real PMIX item from the suggestions' : undefined}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-16 top-full z-10 mt-1 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
                  {suggestions.map((n) => (
                    <button
                      key={n}
                      onClick={() => add(n)}
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-brand/10"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {q.length >= 2 &&
                pmixNames.length > 0 &&
                suggestions.length === 0 &&
                !exactPmix &&
                (pmixNames.some((n) => n.toLowerCase().includes(q)) ? (
                  <p className="mt-1 text-[11px] text-muted">Already on the board — every PMIX match is tracked.</p>
                ) : (
                  <p className="mt-1 text-[11px] text-warn">
                    No PMIX item matches “{adding.trim()}” — it wouldn't get tracked.
                  </p>
                ))}
            </div>
          </>
        )
      }}
    </SettingsCard>
  )
}

/**
 * The visible half of the settings audit — who changed what, when. Nothing on
 * this page saves without landing here, so "who moved the labor target" is a
 * question the app can answer.
 */
function ChangeLog() {
  const [open, setOpen] = useState(false)
  const entries = useMemo(() => (open ? getSettingsAudit() : []), [open])
  return (
    <Card className="p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <History size={14} className="text-muted" />
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Settings change log</span>
        <span className="ml-auto text-xs font-semibold text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-1.5">
          {entries.length === 0 && <p className="text-xs text-muted">No settings changes recorded yet.</p>}
          {entries.map((c, i) => (
            <div key={`${c.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 border-b border-black/5 pb-1.5 text-xs last:border-0">
              <span className="font-bold text-ink">{c.area}</span>
              {c.summary && <span className="min-w-0 flex-1 text-muted">{c.summary}</span>}
              <span className="ml-auto whitespace-nowrap text-muted">
                {c.by} · {stampLabel(c.at)}
              </span>
            </div>
          ))}
        </div>
      )}
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
  // Which concept's names are unlocked for editing (one at a time, PIN-gated).
  const [editingNames, setEditingNames] = useState<string | null>(null)

  const openNames = async (conceptId: string) => {
    if (!(await requirePin('Rename stores', 'stores'))) return
    setEditingNames(conceptId)
  }
  /** Rename only on a real change, and stamp it. Blank or unchanged = no-op. */
  const renameChecked = (next: string, prev: string, apply: () => void, label: string) => {
    const v = next.trim()
    if (!v || v === prev) return
    apply()
    logSettingChange('Stores & locations', `${label.toLowerCase()} renamed ${prev} → ${v}`)
  }

  // PIN-gated per the handoff: adding stores/concepts is a GM/Admin action.
  const gatedAddLocation = async (conceptId: string) => {
    const name = (newLoc[conceptId] ?? '').trim()
    if (!name) return
    if (!(await requirePin('Add a location', 'stores'))) return
    addLocation(conceptId, name)
    logSettingChange('Stores & locations', `added location ${name}`)
    setNewLoc((m) => ({ ...m, [conceptId]: '' }))
  }
  const gatedAddConcept = async () => {
    if (!newConcept.trim()) return
    if (!(await requirePin('Add a concept', 'stores'))) return
    addConcept(newConcept)
    logSettingChange('Stores & locations', `added concept ${newConcept.trim()}`)
    setNewConcept('')
  }

  const totalLocs = concepts.reduce((n, c) => n + c.locations.length, 0)
  const restoreRef = useRef<HTMLInputElement>(null)
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)

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
  const { location: storeName } = useCurrentNames()
  const clearNumbers = async () => {
    if (!(await requirePin('Clear imported numbers'))) return
    if (
      !(await confirmDelete(
        `Clear all imported numbers for ${storeName}?`,
        'Wipes sales, product mix, category mix, invoices, prices, received/usage, and the import history — so you can re-drop reports and watch them land. Your count sheets, order guides, roster, recipes, checklists and targets stay. Export a backup first if unsure.',
        'Clear numbers',
      ))
    )
      return
    clearImportedNumbers()
    location.reload()
  }
  const fullReset = async () => {
    if (!(await requirePin('Full reset of this store'))) return
    if (
      !(await confirmDelete(
        `Full reset — wipe EVERYTHING for ${storeName}?`,
        'Erases every record for this store (numbers AND setup) back to a fresh install: the count sheet and order guide re-seed empty, the item catalog is cleared. This cannot be undone — export a backup first.',
        'Wipe this store',
      ))
    )
      return
    fullResetStore()
    location.reload()
  }
  const restoreFromText = async (text: string): Promise<boolean> => {
    try {
      const parsed = JSON.parse(text)
      const data: Record<string, string> = parsed.data ?? parsed
      const keys = Object.keys(data).filter((k) => k.startsWith('mugops:'))
      if (keys.length === 0) {
        alert('That backup has no data from The Pass in it.')
        return false
      }
      if (
        !(await confirmDelete(
          `Restore ${keys.length} records from this backup?`,
          'Existing data with the same keys is overwritten. Export a backup first if unsure.',
          'Restore',
        ))
      )
        return false
      for (const k of keys) localStorage.setItem(k, data[k])
      location.reload()
      return true
    } catch {
      alert('Could not read that backup — make sure you copied the whole file, from the first { to the last }.')
      return false
    }
  }
  const restoreBackup = async (file: File) => {
    await restoreFromText(await file.text())
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
            <button
              onClick={() => setShowPaste((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-bold text-ink"
            >
              <ClipboardPaste size={13} /> Paste backup
            </button>
            {/* No accept filter — iPad Files often greys out .json otherwise;
                restoreFromText validates the contents anyway. */}
            <input
              ref={restoreRef}
              type="file"
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
        {showPaste && (
          <Card className="border-brand/30 bg-white p-4">
            <div className="mb-1 text-sm font-bold text-ink">Move a device over — paste its backup</div>
            <p className="mb-2 text-xs text-muted text-pretty">
              On the other device, tap <b>Export backup</b>, open the saved file, select all and copy. Then paste it
              here and tap Restore. (The backup looks like a wall of code — that's normal; you don't read it, you paste it.)
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder='Paste the backup here — it starts with {"app":"mugshots-ops"…'
              className="h-28 w-full resize-y rounded-lg border border-black/10 bg-white p-2 font-mono text-[11px] outline-none focus:border-brand"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!pasteText.trim()) return
                  const ok = await restoreFromText(pasteText.trim())
                  if (ok) setPasteText('')
                }}
                disabled={!pasteText.trim()}
                className="rounded-lg bg-brand px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Restore from pasted backup
              </button>
              <button onClick={() => { setShowPaste(false); setPasteText('') }} className="text-xs font-semibold text-muted">
                Cancel
              </button>
            </div>
          </Card>
        )}
        <Card className="border-brand/20 bg-brand/5 p-4 text-sm text-ink/80">
          Each location keeps its own prep, inventory, tips, checklists, and numbers. Switch between
          them anytime from the store menu at the top of the nav. Add as many concepts and locations
          as you need.
        </Card>

        <WeeklyTargets />
        <OrderDays />

        <TrackedItems />

        {concepts.map((c) => {
          const namesOpen = editingNames === c.id
          return (
            <Card key={c.id} className={`overflow-hidden ${namesOpen ? 'ring-1 ring-brand/40' : ''}`}>
              <div className="flex items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-3">
                {/* Names are read-only until you unlock them — a stray tap on a
                    store name used to rename the store on blur. */}
                <input
                  key={`${c.id}-${namesOpen}`}
                  defaultValue={c.name}
                  disabled={!namesOpen}
                  onBlur={(e) => renameChecked(e.target.value, c.name, () => renameConcept(c.id, e.target.value.trim()), 'Concept')}
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 font-display text-lg font-semibold text-ink outline-none hover:enabled:border-black/10 focus:border-brand disabled:cursor-default"
                />
                <span className="text-xs text-muted">{c.locations.length} loc.</span>
                <button
                  onClick={() => (namesOpen ? setEditingNames(null) : openNames(c.id))}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
                    namesOpen ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
                  }`}
                >
                  {namesOpen ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Edit names</>}
                </button>
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
                      key={`${l.id}-${namesOpen}`}
                      defaultValue={l.name}
                      disabled={!namesOpen}
                      onBlur={(e) =>
                        renameChecked(e.target.value, l.name, () => renameLocation(c.id, l.id, e.target.value.trim()), 'Location')
                      }
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 text-sm text-ink outline-none hover:enabled:border-black/10 focus:border-brand disabled:cursor-default"
                    />
                    {active && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                        ACTIVE
                      </span>
                    )}
                    {namesOpen && (
                      <button
                        onClick={async () => {
                          if (c.locations.length <= 1) {
                            alert('A concept needs at least one location.')
                            return
                          }
                          if (await confirmDelete(`Remove ${l.name}?`, 'Its data stays saved but the location is hidden.', 'Remove')) {
                            removeLocation(c.id, l.id)
                            logSettingChange('Stores & locations', `removed location ${l.name}`)
                          }
                        }}
                        aria-label="Remove location"
                        className="text-muted hover:text-down"
                      >
                        ✕
                      </button>
                    )}
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
          )
        })}

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

        <ChangeLog />

        {/* Start fresh — validate the import pipeline from a clean slate. */}
        <Card className="border-down/25 p-4">
          <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-down">Start fresh · {storeName}</div>
          <p className="mb-3 text-xs text-muted text-pretty">
            Zero the numbers so you can drop reports and watch each one import. Both actions ask for the
            GM PIN and a confirm — <b>export a backup first</b> (button up top) so you can roll back.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={clearNumbers}
              className="inline-flex items-center gap-1.5 rounded-lg border border-down/40 bg-white px-3.5 py-2 text-xs font-bold text-down hover:bg-down/5"
            >
              Clear imported numbers
            </button>
            <button
              onClick={fullReset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-down px-3.5 py-2 text-xs font-bold text-white hover:brightness-95"
            >
              Full reset — everything
            </button>
          </div>
          <ul className="mt-3 space-y-1 text-[11px] text-muted">
            <li>
              <b className="text-ink/70">Clear imported numbers</b> — sales, product mix, category mix, invoices, prices,
              received/usage, import history. Keeps count sheets, guides, roster, recipes, checklists, targets.
            </li>
            <li>
              <b className="text-ink/70">Full reset</b> — wipes this store completely; the count sheet &amp; order guide re-seed
              empty. Use only to rebuild from scratch.
            </li>
          </ul>
        </Card>
      </div>
    </>
  )
}
