import { useMemo } from 'react'
import { Megaphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import type { Booking } from '../lib/catering'
import type { Night } from '../lib/nightly'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const kfmt = (n: number) => `$${(n / 1000).toFixed(1)}k`
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return iso(dt)
}
function fmtShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'p' : 'a'}`
}

interface DayCol {
  date: string
  dow: number
  value: number
  projected: number
  ly: number | null
  lw: number | null
  vsBase: number | null
  parties: Booking[]
}

/**
 * Forecast — the prototype's "Week at a glance": navy summary band, seven
 * day cards, this week's calls, and how-it's-built. Every number comes from
 * YOUR history (last 4 same-weekdays × outlook), caterings sit on top.
 */
export function Forecast() {
  const [log] = usePersistentState<Night[]>('nightly:log', [])
  const [adj, setAdj] = usePersistentState<number>('forecast:adj', 0)
  const [overrides, setOverrides] = usePersistentState<Record<string, number>>('forecast:overrides', {})
  const [bookings] = usePersistentState<Booking[]>('catering:bookings', [])
  const [targets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)

  const byDate = useMemo(() => new Map(log.map((n) => [n.date, n])), [log])

  // Average of the most recent 4 entries per weekday.
  const dowAvg = useMemo(() => {
    const byDow: Record<number, Night[]> = {}
    for (const n of log) {
      if (!(n.netSales > 0)) continue
      const d = new Date(n.date + 'T12:00:00')
      ;(byDow[d.getDay()] ??= []).push(n)
    }
    const avg: Record<number, number> = {}
    for (const [k, arr] of Object.entries(byDow)) {
      const recent = arr.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 4)
      avg[+k] = recent.reduce((s, n) => s + n.netSales, 0) / recent.length
    }
    return avg
  }, [log])

  const days: DayCol[] = useMemo(() => {
    const start = new Date(today() + 'T12:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const date = iso(d)
      const base = dowAvg[d.getDay()] ?? 0
      const projected = Math.round(base * (1 + adj / 100))
      const value = overrides[date] ?? projected
      const ly = byDate.get(shiftDays(date, -364))?.netSales ?? null
      const lw = byDate.get(shiftDays(date, -7))?.netSales ?? null
      const cmp = ly ?? lw
      return {
        date,
        dow: d.getDay(),
        value,
        projected,
        ly,
        lw,
        vsBase: cmp && cmp > 0 ? ((value - cmp) / cmp) * 100 : null,
        parties: bookings.filter((b) => !b.completedAt && b.date === date),
      }
    })
  }, [dowAvg, adj, overrides, byDate, bookings])

  const weekTotal = days.reduce((s, d) => s + d.value, 0)
  const lyTotal = days.reduce((s, d) => s + (d.ly ?? d.lw ?? 0), 0)
  const vsLy = lyTotal > 0 ? ((weekTotal - lyTotal) / lyTotal) * 100 : null
  const hasHistory = Object.keys(dowAvg).length > 0
  const laborBudget = weekTotal * (targets.laborPct / 100)
  const peak = days.reduce((a, b) => (b.value > a.value ? b : a), days[0])
  const t = today()

  // "This week's calls" — generated, never editorial: parties + trend flags.
  const calls = useMemo(() => {
    const out: Array<{ day: string; text: string; to?: string; link?: string }> = []
    for (const d of days)
      for (const b of d.parties)
        out.push({
          day: DOW[d.dow].slice(0, 3).toUpperCase(),
          text: `${b.event}${b.guests ? ` — party of ${b.guests}` : ''}${b.time ? ` @ ${fmtTime(b.time)}` : ''} — prep the day before`,
          to: `/catering?booking=${b.id}`,
          link: 'Catering',
        })
    const byDow: Record<number, Night[]> = {}
    for (const n of log) {
      if (!(n.netSales > 0)) continue
      ;(byDow[new Date(n.date + 'T12:00:00').getDay()] ??= []).push(n)
    }
    const flags: Array<{ pct: number; dow: number }> = []
    for (const [k, arr] of Object.entries(byDow)) {
      if (arr.length < 3) continue
      const sorted = arr.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      const latest = sorted[0].netSales
      const prior = sorted.slice(1, 5)
      const avg = prior.reduce((s, n) => s + n.netSales, 0) / prior.length
      if (avg > 0) flags.push({ pct: ((latest - avg) / avg) * 100, dow: +k })
    }
    flags
      .filter((f) => f.pct >= 8)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 2)
      .forEach((f) =>
        out.push({ day: DOW[f.dow].slice(0, 3).toUpperCase(), text: `${DOW[f.dow]}s trending +${f.pct.toFixed(0)}% — consider pars up`, to: '/prep', link: 'Prep' }),
      )
    flags
      .filter((f) => f.pct <= -8)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 1)
      .forEach((f) =>
        out.push({ day: DOW[f.dow].slice(0, 3).toUpperCase(), text: `${DOW[f.dow]}s trending ${f.pct.toFixed(0)}% — plan a first cut`, to: '/schedule', link: 'Schedule' }),
      )
    return out
  }, [days, log])

  const range = `${fmtShort(days[0]?.date ?? t)} – ${fmtShort(days[6]?.date ?? t)}`

  return (
    <>
      <PageHeader
        title={`Week at a glance · ${range}`}
        subtitle="Your last 4 same-weekdays × outlook — refreshes with every close. Caterings sit on top, never inside the comp."
      />
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
        {!hasHistory ? (
          <Card className="p-8 text-center">
            <p className="mx-auto max-w-md text-sm text-muted text-pretty">
              No sales history yet. Log a few nights in <b>Nightly Numbers</b> (or drop a Toast
              sales summary on <b>Imports</b>) and this screen starts predicting each day of the
              week from your own numbers.
            </p>
          </Card>
        ) : (
          <>
            {/* Navy summary band */}
            <Card className="border-navy !bg-navy p-5 text-white">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/60">
                    Forecast · next 7 days
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-3">
                    <span className="font-display text-4xl font-semibold">{kfmt(weekTotal)}</span>
                    <span className="text-sm text-white/70">projected net</span>
                    {vsLy != null && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${vsLy >= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                        {vsLy >= 0 ? '▲ +' : '▼ −'}
                        {Math.abs(vsLy).toFixed(1)}% ({vsLy >= 0 ? '+' : '−'}{kfmt(Math.abs(weekTotal - lyTotal))}) vs {days.some((d) => d.ly != null) ? 'LY' : 'LW'}
                      </span>
                    )}
                    <span className="rounded-full bg-[#eec263]/20 px-2.5 py-1 text-xs font-bold text-[#eec263]">
                      Labor budget {money(laborBudget)} @ {targets.laborPct}%
                    </span>
                  </div>
                </div>
                {peak && peak.value > 0 && (
                  <div className="text-right">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/60">Peak day</div>
                    <div className="font-display text-2xl font-semibold">
                      {fmtShort(peak.date)} · {kfmt(peak.value)}
                    </div>
                    {peak.parties.length > 0 && (
                      <div className="text-[11px] font-bold text-[#eec263]">
                        ★ {peak.parties[0].event.slice(0, 40)} — plan for volume
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Seven day cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
              {days.map((d) => {
                const isToday = d.date === t
                const overridden = overrides[d.date] != null
                return (
                  <Card key={d.date} className={`p-3 ${isToday ? 'ring-2 ring-brand' : ''}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-extrabold text-ink">
                        {DOW[d.dow].slice(0, 3).toUpperCase()} <span className="font-semibold text-muted">{d.date.slice(5).replace('-', '/')}</span>
                      </span>
                      {isToday && <span className="rounded bg-brand px-1.5 py-px text-[9px] font-extrabold uppercase text-white">Today</span>}
                    </div>
                    <div className="relative mt-1.5">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 font-display text-sm text-muted">$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={d.value || ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setOverrides((o) => {
                            const next = { ...o }
                            if (!Number.isFinite(v) || v === d.projected) delete next[d.date]
                            else next[d.date] = v
                            return next
                          })
                        }}
                        className={`w-full rounded-lg border bg-white py-1 pl-5 pr-1 font-display text-xl font-semibold outline-none focus:border-brand ${
                          overridden ? 'border-brand/60 text-brand' : 'border-transparent text-ink hover:border-black/10'
                        }`}
                      />
                    </div>
                    {d.vsBase != null ? (
                      <div className={`mt-0.5 text-[11px] font-bold ${d.vsBase >= 0 ? 'text-up' : 'text-down'}`}>
                        {d.vsBase >= 0 ? '▲ +' : '▼ −'}
                        {Math.abs(d.vsBase).toFixed(0)}% vs {d.ly != null ? 'LY' : 'LW'}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[11px] text-muted">no LY/LW yet</div>
                    )}
                    <div className="text-[10px] text-muted">
                      {d.ly != null && `LY ${kfmt(d.ly)}`}
                      {d.ly != null && d.lw != null && ' · '}
                      {d.lw != null && `LW ${kfmt(d.lw)}`}
                    </div>
                    {d.parties.map((b) => (
                      <Link
                        key={b.id}
                        to={`/catering?booking=${b.id}`}
                        className="mt-1.5 block truncate rounded-md bg-down/10 px-1.5 py-1 text-[10px] font-bold text-down"
                      >
                        ★ {b.guests ? `Party of ${b.guests}` : b.event.slice(0, 18)}
                        {b.time ? ` · ${fmtTime(b.time)}` : ''} →
                      </Link>
                    ))}
                    <div className="mt-1.5 border-t border-black/5 pt-1.5 text-[10px] text-muted">
                      labor ≤ <b className="text-ink">{money(d.value * (targets.laborPct / 100))}</b>
                    </div>
                  </Card>
                )
              })}
            </div>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {/* This week's calls */}
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
                  <Megaphone size={16} className="text-brand" /> This week's calls
                </div>
                {calls.length === 0 ? (
                  <p className="text-sm text-muted">
                    Nothing flags this week — no parties in the window and no weekday trending
                    sharply either way. Calls appear here on their own.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {calls.map((c, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-sm text-ink/85">
                        <span className="w-9 shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-center text-[9px] font-extrabold text-muted">
                          {c.day}
                        </span>
                        <span className="min-w-0 flex-1">{c.text}</span>
                        {c.to && (
                          <Link to={c.to} className="shrink-0 text-xs font-bold text-brand">
                            {c.link} →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Outlook + how this is built */}
              <div className="space-y-5">
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-muted">Outlook</div>
                      <div className="text-xs text-ink/70">Events, weather, season — every day scales with it.</div>
                    </div>
                    <div className={`font-display text-2xl font-semibold ${adj >= 0 ? 'text-up' : 'text-down'}`}>
                      {adj > 0 ? '+' : ''}
                      {adj}%
                    </div>
                  </div>
                  <input
                    type="range"
                    min={-25}
                    max={25}
                    step={1}
                    value={adj}
                    onChange={(e) => setAdj(parseInt(e.target.value))}
                    className="mt-2 w-full accent-[#b8860b]"
                  />
                </Card>
                <Card className="border-brand/25 bg-brand/[0.06] p-4">
                  <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-brand-600">
                    How this is built
                  </div>
                  <p className="text-xs leading-relaxed text-ink/80">
                    Each day starts from <b>your last 4 of that same weekday</b>, scaled by the
                    outlook slider. Once a year of history is in, the ▲▼ compares to <b>last
                    year's same day</b> (until then, last week). Tagged parties sit on top —
                    never inside the comp. Type on any day card to override it (shown in gold);
                    clear it to go back to the projection. Labor budget comes from Admin:{' '}
                    {targets.laborPct}% of projected net.
                  </p>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
