import { useMemo, useState } from 'react'
import { Check, Undo2 } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { getLastCateringImport, type Booking } from '../lib/catering'

export function Catering() {
  const [bookings, setBookings] = usePersistentState<Booking[]>('catering:bookings', [])
  const [form, setForm] = useState<Omit<Booking, 'id'>>({
    event: '',
    date: '',
    time: '',
    guests: 0,
    notes: '',
  })
  const [showDone, setShowDone] = useState(false)
  const lastImport = getLastCateringImport()

  const sorted = useMemo(
    () => [...bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [bookings],
  )
  const active = sorted.filter((b) => !b.completedAt && b.date >= today())
  const completed = useMemo(
    () => sorted.filter((b) => b.completedAt).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [sorted],
  )

  const add = () => {
    if (!form.event.trim() || !form.date) return
    setBookings((bs) => [...bs, { ...form, id: `c${Date.now()}`, event: form.event.trim() }])
    setForm({ event: '', date: '', time: '', guests: 0, notes: '' })
  }

  // Complete-and-log (handoff spec): ✓ stamps the date and moves the event to
  // the Completed events card; ↩ undo puts it back on the active list.
  const complete = (id: string) =>
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, completedAt: today() } : b)))
  const undo = (id: string) =>
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, completedAt: undefined } : b)))

  return (
    <>
      <PageHeader
        title="Catering & Events"
        subtitle={`${active.length} upcoming · ezCater + private parties`}
        right={
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
              lastImport ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'
            }`}
          >
            {lastImport ? `ezCater ✓ ${lastImport.at}` : 'ezCater — no import yet'}
          </span>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* New booking */}
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={form.event}
              onChange={(e) => setForm({ ...form, event: e.target.value })}
              placeholder="Event / customer"
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:col-span-2"
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              type="number"
              inputMode="numeric"
              value={form.guests || ''}
              onChange={(e) => setForm({ ...form, guests: parseInt(e.target.value) || 0 })}
              placeholder="Guests"
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes (room, menu, deposit…)"
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <button
            onClick={add}
            className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Save booking ✓
          </button>
        </Card>

        {/* Upcoming */}
        {active.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No upcoming bookings — drop an ezCater order on Imports and it lands here.
          </p>
        ) : (
          <div className="space-y-2">
            {active.map((b) => (
              <Card key={b.id} className="flex items-center gap-3 p-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand/10 text-center">
                  <span className="font-display text-lg font-semibold leading-none text-brand">
                    {b.guests || '—'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{b.event}</div>
                  <div className="text-xs text-muted">
                    {fmtDate(b.date)}
                    {b.time && ` · ${fmtTime(b.time)}`}
                    {b.guests ? ` · ${b.guests} guests` : ''}
                    {b.orderNo ? ` · #${b.orderNo}` : ''}
                  </div>
                  {b.notes && <div className="mt-0.5 truncate text-xs text-ink/60">{b.notes}</div>}
                </div>
                <button
                  onClick={() => complete(b.id)}
                  aria-label={`Mark ${b.event} complete`}
                  title="Mark complete"
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-up/10 text-up hover:bg-up hover:text-white"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={async () => {
                    if (await confirmDelete(`Delete "${b.event}"?`, 'This booking will be removed.'))
                      setBookings((bs) => bs.filter((x) => x.id !== b.id))
                  }}
                  aria-label="Delete booking"
                  className="text-muted hover:text-down"
                >
                  ✕
                </button>
              </Card>
            ))}
          </div>
        )}

        {/* Completed events log */}
        {completed.length > 0 && (
          <div>
            <button
              onClick={() => setShowDone((v) => !v)}
              className="mb-2 px-1 text-xs font-semibold text-muted"
            >
              Completed events ({completed.length}) · {showDone ? 'Hide' : 'Show'}
            </button>
            {showDone && (
              <Card className="divide-y divide-black/5">
                {completed.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 p-3 opacity-75">
                    <Check size={15} className="shrink-0 text-up" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{b.event}</div>
                      <div className="text-xs text-muted">
                        {fmtDate(b.date)} · completed {fmtDate(b.completedAt!)}
                      </div>
                    </div>
                    <button
                      onClick={() => undo(b.id)}
                      aria-label={`Undo complete for ${b.event}`}
                      title="Move back to active"
                      className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-semibold text-ink"
                    >
                      <Undo2 size={12} /> Undo
                    </button>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'p' : 'a'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${ap}`
}
