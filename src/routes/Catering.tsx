import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Undo2, Plus, Pencil, FileText } from 'lucide-react'
import { Page, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { OrderTicket } from '../components/OrderTicket'
import { CateringBuilds } from '../components/CateringBuilds'
import { getLastCateringImport, fmtDate, fmtTime, type Booking, type Reservation } from '../lib/catering'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const STATUS_META: Record<NonNullable<Booking['status']>, { label: string; cls: string }> = {
  confirmed: { label: 'CONFIRMED', cls: 'bg-up/10 text-up' },
  tentative: { label: 'TENTATIVE', cls: 'bg-brand/15 text-brand-600' },
  hold: { label: 'HOLD', cls: 'bg-black/10 text-ink/60' },
}

/**
 * Catering & Reservations — prototype layout: bookings log table on the left
 * (WHEN · EVENT & CONTACT · GUESTS · MENU/NOTES · DEPOSIT · EST · STATUS),
 * reservations + auto-sync explainer on the right. Real data only.
 */
export function Catering() {
  const [bookings, setBookings] = usePersistentState<Booking[]>('catering:bookings', [])
  const [reservations, setReservations] = usePersistentState<Reservation[]>('catering:reservations', [])
  const [showForm, setShowForm] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const lastImport = getLastCateringImport()

  // Deep link from the dashboard tiles: /catering?booking=<id>
  const [params] = useSearchParams()
  const focusId = params.get('booking')
  useEffect(() => {
    if (!focusId) return
    setOpenId(focusId) // deep link opens the actual order too
    const t = setTimeout(
      () => document.getElementById(`booking-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      150,
    )
    return () => clearTimeout(t)
  }, [focusId])

  const sorted = useMemo(
    () => [...bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [bookings],
  )
  // Every booking that isn't marked complete stays visible — a past date that
  // was never closed out must NOT silently vanish (it just gets a "past" flag so
  // the manager can complete or delete it). Upcoming first, then past.
  const active = useMemo(
    () =>
      sorted
        .filter((b) => !b.completedAt)
        .sort((a, b) => {
          const ap = a.date < today(), bp = b.date < today()
          if (ap !== bp) return ap ? 1 : -1 // upcoming before past
          return (a.date + a.time).localeCompare(b.date + b.time)
        }),
    [sorted],
  )
  const completed = useMemo(
    () => sorted.filter((b) => b.completedAt).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [sorted],
  )

  const complete = (id: string) =>
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, completedAt: today() } : b)))
  const undo = (id: string) =>
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, completedAt: undefined } : b)))
  const cycleStatus = (id: string) =>
    setBookings((bs) =>
      bs.map((b) => {
        if (b.id !== id) return b
        const order: Array<NonNullable<Booking['status']>> = ['confirmed', 'tentative', 'hold']
        const cur = b.status ?? 'confirmed'
        return { ...b, status: order[(order.indexOf(cur) + 1) % order.length] }
      }),
    )

  return (
      <Page
        title="Catering & Reservations"
        subtitle="Tagged nights stay out of same-day comps — a banquet Thursday won't inflate next year's Thursday forecast"
        right={
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                lastImport ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'
              }`}
            >
              {lastImport ? `● ezCater synced · ${lastImport.at}` : 'ezCater — drop a PDF on Imports'}
            </span>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-ink"
            >
              <Plus size={13} /> Add catering booking
            </button>
          </div>
        }
        width="wide"
      >
        {showForm && <BookingForm onSave={(b) => { setBookings((bs) => [...bs, b]); setShowForm(false) }} />}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Bookings log */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-display text-lg font-semibold text-ink">Bookings</span>
              <button
                onClick={() => setShowForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white"
              >
                <Plus size={13} /> New booking
              </button>
            </div>
            <div className="flex items-center gap-2 border-l-4 border-brand bg-brand/[0.08] px-4 py-2">
              <span className="text-sm font-bold text-ink">Catering</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-muted">{active.length}</span>
            </div>

            {/* Column headers */}
            <div className="hidden grid-cols-[110px_minmax(0,2fr)_44px_minmax(0,1.4fr)_92px_64px_110px_96px] gap-2 border-b border-black/5 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted lg:grid">
              <span>When</span>
              <span>Event & contact</span>
              <span>Guests</span>
              <span>Menu / notes</span>
              <span>Deposit</span>
              <span>Est.</span>
              <span>Status</span>
              <span />
            </div>

            {active.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                No upcoming bookings — add one, or drop an ezCater order on Imports and it lands here.
              </p>
            ) : (
              active.map((b) => {
                const st = STATUS_META[b.status ?? 'confirmed']
                const focused = b.id === focusId
                return (
                  <div key={b.id} id={`booking-${b.id}`} className="border-b border-black/5 last:border-0">
                  <div
                    onClick={() => setOpenId(b.id)}
                    title="Open the order — the caterer’s sheet, ready to print"
                    className={`grid cursor-pointer grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 hover:bg-black/[0.02] lg:grid-cols-[110px_minmax(0,2fr)_44px_minmax(0,1.4fr)_92px_64px_110px_96px] ${
                      focused ? 'bg-brand/5 ring-2 ring-inset ring-brand' : ''
                    }`}
                  >
                    <div className="text-sm">
                      <div className="font-bold text-ink">{fmtDate(b.date)}</div>
                      <div className="text-[11px] text-muted">{b.time ? fmtTime(b.time) : '—'}</div>
                      {b.date < today() && (
                        <span className="mt-0.5 inline-block rounded bg-down/10 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-down">
                          past · close it out
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="mb-0.5 inline-block rounded bg-brand/15 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-brand-600">
                        {b.source === 'ezCater' ? 'ezCater' : 'Catering'}
                      </span>
                      <div className="truncate text-sm font-semibold text-ink">{b.event}</div>
                    </div>
                    <div className="text-sm font-bold text-ink">{b.guests || '—'}</div>
                    <div className="min-w-0 text-xs text-muted">
                      <span className="line-clamp-2">{b.notes || '—'}</span>
                    </div>
                    <div className="text-xs">
                      {b.deposit ? (
                        <span className={b.depositPaid ? 'font-semibold text-up' : 'text-muted'}>
                          {money(b.deposit)} {b.depositPaid ? '✓' : 'pending'}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-ink">{b.estimate ? money(b.estimate) : '—'}</div>
                    <div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          cycleStatus(b.id)
                        }}
                        title="Click to change status"
                        className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${st.cls}`}
                      >
                        {st.label}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* The row opens the order too, but a tablet never shows
                          a title tooltip — so the way in is also a button. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenId(b.id)
                        }}
                        aria-label={`Open the order for ${b.event}`}
                        title="Open the order"
                        className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand-600 hover:bg-brand hover:text-white"
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          complete(b.id)
                        }}
                        aria-label={`Mark ${b.event} complete`}
                        title="Mark complete"
                        className="grid size-7 place-items-center rounded-lg bg-up/10 text-up hover:bg-up hover:text-white"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (await confirmDelete(`Delete "${b.event}"?`, 'This booking will be removed.'))
                            setBookings((bs) => bs.filter((x) => x.id !== b.id))
                        }}
                        aria-label="Delete booking"
                        className="grid size-7 place-items-center rounded-lg bg-down/10 text-down hover:bg-down hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  </div>
                )
              })
            )}
          </Card>

          {/* Right rail: reservations + auto-sync explainer */}
          <div className="space-y-5">
            <Reservations reservations={reservations} setReservations={setReservations} />
            <Card className="flex items-start gap-3 border-brand/25 bg-brand/[0.06] p-4">
              <span className="rounded bg-navy px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                Auto
              </span>
              <p className="text-xs leading-relaxed text-ink/75">
                Day before each catering, plan the prep bump on the prep list. ezCater orders dropped on
                Imports land here auto-tagged and de-duped by order #.
              </p>
            </Card>
          </div>
        </div>

        {/* Beside the orders, not on Specs — a cook packing a Mombo Platter has
            the ticket open, and sending them to another screen to find out how
            many liners it takes is the hunt that keeps the packet in a drawer.
            Full width rather than in the rail: these are photo cards, and the
            photo is the thing you build against. */}
        <CateringBuilds />

        {/* Completed events log */}
        {completed.length > 0 && (
          <div>
            <button onClick={() => setShowDone((v) => !v)} className="mb-2 px-1 text-xs font-semibold text-muted">
              Completed events ({completed.length}) · {showDone ? 'Hide' : 'Show'}
            </button>
            {showDone && (
              <Card className="divide-y divide-black/5">
                {completed.map((b) => (
                  // Clickable for the same reason as an active one: a past
                  // event is exactly what you reopen to reprint an order.
                  <div
                    key={b.id}
                    onClick={() => setOpenId(b.id)}
                    title="Open the order"
                    className="flex cursor-pointer items-center gap-3 p-3 opacity-75 hover:bg-black/[0.02] hover:opacity-100"
                  >
                    <Check size={15} className="shrink-0 text-up" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{b.event}</div>
                      <div className="text-xs text-muted">
                        {fmtDate(b.date)} · completed {fmtDate(b.completedAt!)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        undo(b.id)
                      }}
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

        {/* The order itself, over the log. Looked up from `bookings` rather than
            held in state so an edit — or a delete — can't leave a stale copy
            open on screen. */}
        <OrderTicket
          booking={bookings.find((b) => b.id === openId) ?? null}
          onClose={() => setOpenId(null)}
        />
            </Page>
  )
}

/** New booking entry form — prototype's full column set. */
function BookingForm({ onSave }: { onSave: (b: Booking) => void }) {
  const [f, setF] = useState({
    event: '', date: '', time: '', guests: '', notes: '', deposit: '', estimate: '',
    status: 'confirmed' as NonNullable<Booking['status']>, depositPaid: false,
  })
  const cls = 'rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand'
  const save = () => {
    if (!f.event.trim() || !f.date) return
    onSave({
      id: `c${Date.now()}`,
      event: f.event.trim(),
      date: f.date,
      time: f.time,
      guests: parseInt(f.guests) || 0,
      notes: f.notes.trim(),
      status: f.status,
      deposit: parseFloat(f.deposit) || undefined,
      depositPaid: f.depositPaid || undefined,
      estimate: parseFloat(f.estimate) || undefined,
    })
  }
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">
        <Pencil size={12} /> New catering booking
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })} placeholder="Event / customer / contact" className={`${cls} sm:col-span-3`} />
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={cls} />
        <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={cls} />
        <input type="number" inputMode="numeric" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} placeholder="Guests" className={cls} />
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Menu / notes (room, set menu…)" className={`${cls} sm:col-span-3`} />
        <input type="number" inputMode="decimal" value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value })} placeholder="Deposit $" className={cls} />
        <input type="number" inputMode="decimal" value={f.estimate} onChange={(e) => setF({ ...f, estimate: e.target.value })} placeholder="Estimated total $" className={cls} />
        <div className="flex items-center gap-2">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as NonNullable<Booking['status']> })} className={`${cls} flex-1`}>
            <option value="confirmed">Confirmed</option>
            <option value="tentative">Tentative</option>
            <option value="hold">Hold</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={f.depositPaid} onChange={(e) => setF({ ...f, depositPaid: e.target.checked })} />
            paid
          </label>
        </div>
      </div>
      <button onClick={save} className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
        Save booking ✓
      </button>
    </Card>
  )
}

/** Reservations — the prototype's right-rail log, kept separate from caterings. */
function Reservations({
  reservations,
  setReservations,
}: {
  reservations: Reservation[]
  setReservations: React.Dispatch<React.SetStateAction<Reservation[]>>
}) {
  const [f, setF] = useState({ name: '', date: '', time: '', party: '', notes: '' })
  const cls = 'min-w-0 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand'
  const upcoming = useMemo(
    () => [...reservations].filter((r) => r.date >= today()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [reservations],
  )
  const add = () => {
    if (!f.name.trim() || !f.date) return
    setReservations((rs) => [
      ...rs,
      { id: `r${Date.now()}`, name: f.name.trim(), date: f.date, time: f.time, party: parseInt(f.party) || 0, notes: f.notes.trim() },
    ])
    setF({ name: '', date: '', time: '', party: '', notes: '' })
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-l-4 border-navy bg-navy/[0.05] px-4 py-2.5">
        <span className="text-sm font-bold text-ink">Reservations</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-muted">{upcoming.length}</span>
      </div>
      {upcoming.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted">No reservations booked yet.</p>
      ) : (
        upcoming.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy/10 text-sm font-bold text-ink">
              {r.party || '—'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{r.name}</div>
              <div className="text-[11px] text-muted">
                {fmtDate(r.date)}
                {r.time && ` · ${fmtTime(r.time)}`}
                {r.notes && ` · ${r.notes}`}
              </div>
            </div>
            <button
              onClick={async () => {
                if (await confirmDelete(`Delete reservation for ${r.name}?`)) setReservations((rs) => rs.filter((x) => x.id !== r.id))
              }}
              aria-label={`Delete reservation for ${r.name}`}
              className="text-muted hover:text-down"
            >
              ✕
            </button>
          </div>
        ))
      )}
      <div className="grid grid-cols-2 gap-1.5 border-t border-black/5 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_56px_auto]">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" className={cls} />
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={cls} />
        <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={cls} />
        <input type="number" inputMode="numeric" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} placeholder="#" className={cls} />
        <button onClick={add} className="rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white">
          Add
        </button>
      </div>
    </Card>
  )
}
