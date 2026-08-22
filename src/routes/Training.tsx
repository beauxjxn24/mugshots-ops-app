// Training resources — the five-day programmes, laid out the app's way.
//
// The packets come in as a scanned grid, sideways, a column per day. Reading
// that on a phone means pinching and rotating to find one line. Here it's a day
// at a time, in order, at the size of the screen — and it ticks, per trainee,
// which is the thing a photograph of a checklist can't do.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, GraduationCap, ClipboardCheck, BookOpen } from 'lucide-react'
import { Page, Card } from '../components/ui'
import { NamePicker } from '../components/NamePicker'
import { getStaff } from '../lib/staff'
import { shiftPerson } from '../lib/daycode'
import {
  PROGRAMS,
  programById,
  programGroups,
  getProgress,
  setTick,
  tickId,
  trainees,
} from '../lib/training'

export function Training() {
  const [params, setParams] = useSearchParams()
  const open = programById(params.get('p') ?? '')
  // Whoever is being trained. Defaults to nobody, so a trainer picks on purpose
  // rather than quietly ticking off the last person who used the tablet.
  const [who, setWho] = useState('')
  const [progress, setProgress] = useState(getProgress)

  const roster = useMemo(() => {
    const names = new Set([...getStaff().map((p) => p.name), ...trainees()])
    const me = shiftPerson()
    if (me) names.add(me)
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b))
  }, [progress])

  if (!open) {
    return (
      <Page
        title="Training resources"
        subtitle={`${PROGRAMS.length} programme${PROGRAMS.length === 1 ? '' : 's'} — the days, the tests and the sign-off`}
        width="narrow"
      >
        {programGroups().map((g) => (
          <section key={g}>
            <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              {g}
            </div>
            <div className="space-y-2">
              {PROGRAMS.filter((p) => p.group === g).map((p) => (
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
                      <span className="mt-0.5 block text-xs leading-snug text-muted">{p.what}</span>
                      <span className="mt-1 block text-[11px] text-muted/70">
                        {p.days.length} days · {p.days.reduce((n, d) => n + d.items.length, 0)} items
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
            These are training and certification programmes — the day-by-day schedule and the menu
            tests that go with them. Closing duties live on the{' '}
            <b className="text-ink/80">Sidework</b> screen.
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
          onClick={() => setParams({}, { replace: true })}
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

      {open.days.map((d) => {
        const dayDone = d.items.filter((_, i) => mine[tickId(open.id, d.day, i)]).length
        return (
          <Card key={d.day} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-2.5">
              <span className="font-display text-sm font-semibold text-ink">{d.day}</span>
              {/* Host & To-Go is one five-day path across two stations, and
                  which days are which is the first thing a trainer needs. */}
              {d.covers && (
                <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold text-white">
                  {d.covers}
                </span>
              )}
              {d.focus && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-600">
                  Menu focus · {d.focus}
                </span>
              )}
              {d.test && (
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-muted">
                  Test · {d.test}
                </span>
              )}
              {who && (
                <span className="ml-auto text-[11px] font-bold text-muted">
                  {dayDone}/{d.items.length}
                </span>
              )}
            </div>
            <ul>
              {d.items.map((t, i) => {
                const id = tickId(open.id, d.day, i)
                const on = !!mine[id]
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
                      <span
                        className={`text-[13px] leading-snug ${on ? 'text-muted line-through' : 'text-ink/85'}`}
                      >
                        {t}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </Page>
  )
}
