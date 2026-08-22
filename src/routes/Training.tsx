// Training resources — the five-day layout, editable.
//
// The packets come in as a scanned grid, sideways, a column per day. Reading
// that on a phone means pinching and rotating to find one line. Here it's a day
// at a time, top to bottom, at the size of the screen.
//
// Everything on it is editable by a manager, because standards move and menus
// roll over: Day Four's focus is "wraps, plates, pastas" today and won't be
// after the next rollout, and a training day naming dishes you no longer sell
// teaches a new hire the wrong menu. A trainee only ever sees the list and the
// ticks.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  GraduationCap,
  ClipboardCheck,
  BookOpen,
  Pencil,
  Plus,
  X,
} from 'lucide-react'
import { Page, Card } from '../components/ui'
import { NamePicker } from '../components/NamePicker'
import { getStaff } from '../lib/staff'
import { shiftPerson } from '../lib/daycode'
import { useRole } from '../lib/role'
import { confirmDelete } from '../lib/confirm'
import { usePersistentState } from '../lib/store'
import {
  SEED_PROGRAMS,
  GROUPS,
  getProgress,
  getPrograms,
  programGroups,
  setPrograms,
  setTick,
  tickId,
  toList,
  trainees,
  type Programs,
  type TrainingDay,
} from '../lib/training'

const FIELD =
  'w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'

export function Training() {
  const [params, setParams] = useSearchParams()
  // Seeded from the shipped programmes, then owned by the store. getPrograms()
  // merges in anything newly shipped so a new packet still arrives.
  const [programs, setStored] = usePersistentState<Programs>('training:programs', getPrograms())
  const list = useMemo(() => toList(programs), [programs])
  const open = list.find((p) => p.id === (params.get('p') ?? ''))

  const [who, setWho] = useState('')
  const [progress, setProgress] = useState(getProgress)
  const [editDay, setEditDay] = useState<number | null>(null)
  const [adding, setAdding] = useState<Record<number, string>>({})

  const canEdit = useRole((s) => s.role) !== 'staff'
  const save = (next: Programs) => {
    setStored(next)
    setPrograms(next)
  }

  const roster = useMemo(() => {
    const names = new Set([...getStaff().map((p) => p.name), ...trainees()])
    const me = shiftPerson()
    if (me) names.add(me)
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b))
  }, [progress])

  /** Change one day of the open programme. */
  const patchDay = (i: number, patch: Partial<TrainingDay>) => {
    if (!open) return
    const days = open.days.map((d, n) => (n === i ? { ...d, ...patch } : d))
    save({ ...programs, [open.id]: { ...programs[open.id], days } })
  }

  if (!open) {
    return (
      <Page
        title="Training resources"
        subtitle={`${list.length} programme${list.length === 1 ? '' : 's'} — the days, the tests and the sign-off`}
        width="narrow"
        right={
          canEdit ? (
            <button
              onClick={() => {
                const title = window.prompt('New programme — what job or station?')?.trim()
                if (!title) return
                const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                if (!id || programs[id]) return
                save({
                  ...programs,
                  [id]: {
                    title,
                    group: 'Front of house',
                    what: '',
                    days: [{ day: 'Day One', items: [] }],
                  },
                })
                setParams({ p: id })
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
            >
              <Plus size={13} /> New programme
            </button>
          ) : undefined
        }
      >
        {programGroups(list).map((g) => (
          <section key={g}>
            <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              {g}
            </div>
            <div className="space-y-2">
              {list
                .filter((p) => p.group === g)
                .map((p) => (
                  <Card key={p.id} className="overflow-hidden">
                    <button
                      onClick={() => setParams({ p: p.id })}
                      className="flex w-full items-start gap-3 p-3.5 text-left hover:bg-brand/[0.04]"
                    >
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                        <GraduationCap size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[15px] font-semibold text-ink">
                          {p.title}
                        </span>
                        {p.what && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted">{p.what}</span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted/70">
                          {p.days.length} day{p.days.length === 1 ? '' : 's'} ·{' '}
                          {p.days.reduce((n, d) => n + d.items.length, 0)} items
                        </span>
                      </span>
                    </button>
                  </Card>
                ))}
            </div>
          </section>
        ))}

        <Card className="flex items-start gap-2.5 border-brand/20 bg-brand/[0.04] p-3.5">
          <BookOpen size={15} className="mt-0.5 shrink-0 text-brand" />
          <p className="text-xs leading-snug text-muted">
            The day-by-day training programmes and the menu tests that go with them.{' '}
            {canEdit
              ? 'Edit any day as standards and menus change — the pencil is on each one.'
              : 'Closing duties live on the Sidework screen.'}
          </p>
        </Card>
      </Page>
    )
  }

  const mine = who ? (progress[who] ?? {}) : {}
  const total = open.days.reduce((n, d) => n + d.items.length, 0)
  const done = Object.keys(mine).filter((k) => k.startsWith(`${open.id}|`)).length

  return (
    <Page
      title={open.title}
      subtitle={open.what}
      width="narrow"
      right={
        <button
          onClick={() => {
            setParams({}, { replace: true })
            setEditDay(null)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
        >
          <ArrowLeft size={13} /> All programmes
        </button>
      }
    >
      {/* Who's being trained. The ticks are theirs, not the tablet's. */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardCheck size={15} className="shrink-0 text-brand" />
          <span className="text-sm font-semibold text-ink">Training</span>
          <NamePicker
            value={who}
            options={roster}
            placeholder="Who's being trained?"
            // Day One is exactly when someone isn't on the roster yet.
            allowNew
            onChange={setWho}
          />
          {who && (
            <span className="shrink-0 text-xs font-semibold text-muted">
              {done}/{total}
            </span>
          )}
        </div>
        {who && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
        )}
      </Card>

      {open.days.map((d, di) => {
        const editing = editDay === di
        const dayDone = d.items.filter((t) => mine[tickId(open.id, d.day, t)]).length
        return (
          <Card key={di} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-2.5">
              <span className="font-display text-sm font-semibold text-ink">{d.day}</span>
              {/* Host & To-Go is one five-day path across two stations, and
                  which days are which is the first thing a trainer needs. */}
              {d.covers && !editing && (
                <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold text-white">
                  {d.covers}
                </span>
              )}
              {d.focus && !editing && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-600">
                  Menu focus · {d.focus}
                </span>
              )}
              {d.test && !editing && (
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-muted">
                  Test · {d.test}
                </span>
              )}
              {who && !editing && (
                <span className="ml-auto text-[11px] font-bold text-muted">
                  {dayDone}/{d.items.length}
                </span>
              )}
              {canEdit && (
                <button
                  onClick={() => setEditDay(editing ? null : di)}
                  aria-label={editing ? `Done editing ${d.day}` : `Edit ${d.day}`}
                  className={`${who && !editing ? '' : 'ml-auto'} grid size-7 shrink-0 place-items-center rounded-md ${
                    editing ? 'bg-brand text-white' : 'text-muted hover:bg-black/5 hover:text-ink'
                  }`}
                >
                  {editing ? <Check size={13} /> : <Pencil size={12} />}
                </button>
              )}
            </div>

            {/* The bits that change with a rollout: which part of the menu the
                day covers, and which test goes with it. */}
            {editing && (
              <div className="grid gap-2 border-b border-black/5 p-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    Day
                  </span>
                  <input
                    value={d.day}
                    onChange={(e) => patchDay(di, { day: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    Menu focus
                  </span>
                  <input
                    value={d.focus ?? ''}
                    placeholder="Burgers…"
                    onChange={(e) => patchDay(di, { focus: e.target.value || undefined })}
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    Test
                  </span>
                  <input
                    value={d.test ?? ''}
                    placeholder="Starters…"
                    onChange={(e) => patchDay(di, { test: e.target.value || undefined })}
                    className={FIELD}
                  />
                </label>
              </div>
            )}

            <ul>
              {d.items.map((t, i) => {
                const id = tickId(open.id, d.day, t)
                const on = !!mine[id]
                if (editing)
                  return (
                    <li key={i} className="flex items-start gap-2 border-b border-black/5 px-3 py-2 last:border-0">
                      <textarea
                        value={t}
                        rows={Math.min(4, Math.ceil(t.length / 52) || 1)}
                        onChange={(e) => {
                          const items = d.items.map((x, n) => (n === i ? e.target.value : x))
                          patchDay(di, { items })
                        }}
                        className={`${FIELD} resize-y leading-snug`}
                      />
                      <button
                        onClick={async () => {
                          if (!(await confirmDelete(`Remove this line from ${d.day}?`, undefined, 'Remove')))
                            return
                          patchDay(di, { items: d.items.filter((_, n) => n !== i) })
                        }}
                        aria-label="Remove line"
                        className="mt-1.5 shrink-0 text-muted hover:text-down"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  )
                return (
                  <li key={i} className="border-b border-black/5 last:border-0">
                    <button
                      onClick={() => who && setProgress(setTick(who, id, !on))}
                      disabled={!who}
                      title={who ? undefined : 'Pick who’s being trained first'}
                      className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-black/[0.02] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                          on ? 'border-up bg-up text-white' : 'border-black/25'
                        }`}
                      >
                        {on && <Check size={11} />}
                      </span>
                      <span className={`text-[13px] leading-snug ${on ? 'text-muted line-through' : 'text-ink/85'}`}>
                        {t}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {editing && (
              <div className="flex gap-1.5 p-3">
                <input
                  value={adding[di] ?? ''}
                  onChange={(e) => setAdding((m) => ({ ...m, [di]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !(adding[di] ?? '').trim()) return
                    patchDay(di, { items: [...d.items, adding[di].trim()] })
                    setAdding((m) => ({ ...m, [di]: '' }))
                  }}
                  placeholder={`Add a line to ${d.day}…`}
                  className={`${FIELD} flex-1`}
                />
                <button
                  onClick={() => {
                    const v = (adding[di] ?? '').trim()
                    if (!v) return
                    patchDay(di, { items: [...d.items, v] })
                    setAdding((m) => ({ ...m, [di]: '' }))
                  }}
                  aria-label="Add line"
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white"
                >
                  <Plus size={15} />
                </button>
              </div>
            )}
          </Card>
        )
      })}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const days = [...open.days, { day: `Day ${open.days.length + 1}`, items: [] }]
              save({ ...programs, [open.id]: { ...programs[open.id], days } })
              setEditDay(days.length - 1)
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-black/20 px-3 py-2 text-xs font-bold text-muted hover:border-brand/40 hover:text-ink"
          >
            <Plus size={13} /> Add a day
          </button>
          <select
            value={open.group}
            onChange={(e) => save({ ...programs, [open.id]: { ...programs[open.id], group: e.target.value } })}
            aria-label="Which group this programme is filed under"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-muted"
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {/* The shipped version is always recoverable, so editing is safe to
              do — nobody has to be careful with a training programme. */}
          {SEED_PROGRAMS[open.id] && (
            <button
              onClick={async () => {
                if (
                  !(await confirmDelete(
                    `Reset ${open.title} to the version the app ships?`,
                    'Your edits to this programme are replaced. Sign-offs are kept.',
                    'Reset',
                  ))
                )
                  return
                save({ ...programs, [open.id]: SEED_PROGRAMS[open.id] })
                setEditDay(null)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-muted hover:text-ink"
            >
              Reset to shipped
            </button>
          )}
        </div>
      )}
    </Page>
  )
}
