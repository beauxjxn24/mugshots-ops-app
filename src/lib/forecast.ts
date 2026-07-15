// Shared projection math: each day is predicted by the average of the last 4
// same-weekdays (Fridays predict Fridays). Used by the Forecast screen and the
// dashboard's dashed forecast bars.
import type { Night } from './nightly'
import type { Booking } from './catering'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shift(dateIso: string, delta: number): string {
  const [y, m, d] = (dateIso ?? '').split('-').map(Number)
  return iso(new Date(y, m - 1, d + delta))
}

export function dowAverages(log: Night[]): Record<number, number> {
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
}

/** Projected net for an ISO date, or 0 when there's no basis. */
export function projectDay(avg: Record<number, number>, isoDate: string): number {
  const dow = new Date(isoDate + 'T12:00:00').getDay()
  return Math.round(avg[dow] ?? 0)
}

export interface DayForecast {
  date: string
  dow: number
  /** Projected net sales (day-of-week average × outlook, or a manual override). */
  projected: number
  ly: number | null // last year, same date
  lw: number | null // last week, same date
  /** % projected vs the comparison base (LY if we have it, else LW). */
  vs: number | null
  base: 'ly' | 'lw' | null
  parties: number // open caterings booked that day
}

/**
 * Project a set of dates from the store's own history — the same model the
 * Forecast screen uses, packaged so the schedule builder can show a per-day
 * projected / last-year figure without the screens ever disagreeing.
 */
export function forecastDates(
  dates: string[],
  opts: { log: Night[]; bookings?: Booking[]; adj?: number; overrides?: Record<string, number> },
): Record<string, DayForecast> {
  const { log, bookings = [], adj = 0, overrides = {} } = opts
  const avg = dowAverages(Array.isArray(log) ? log : [])
  const byDate = new Map((Array.isArray(log) ? log : []).map((n) => [n.date, n]))
  const out: Record<string, DayForecast> = {}
  for (const date of dates) {
    const dow = new Date(date + 'T12:00:00').getDay()
    const projBase = Math.round((avg[dow] ?? 0) * (1 + adj / 100))
    const projected = overrides[date] ?? projBase
    const ly = byDate.get(shift(date, -364))?.netSales ?? null
    const lw = byDate.get(shift(date, -7))?.netSales ?? null
    const cmp = ly ?? lw
    out[date] = {
      date,
      dow,
      projected,
      ly,
      lw,
      vs: cmp && cmp > 0 ? ((projected - cmp) / cmp) * 100 : null,
      base: ly != null ? 'ly' : lw != null ? 'lw' : null,
      parties: (Array.isArray(bookings) ? bookings : []).filter((b) => !b.completedAt && b.date === date).length,
    }
  }
  return out
}

// ── The owner's operating calendar ──
// Thirteen 28-day periods (4 weeks each) per fiscal year, Monday-aligned.
// Anchor from the owner: Period 8, Week 1 = Monday 2026-07-13 → so FY2026's
// Period 1, Week 1 begins Monday 2025-12-29. Every fiscal year is 364 days
// (13×28), so the anchor repeats every 364 days forward and back.
const FY_LEN = 364
function dayNum(iso: string): number {
  const [y, m, d] = (iso ?? '').split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}
function isoOfDayNum(n: number): string {
  const d = new Date(n * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const FY_BASE = dayNum('2025-12-29') // FY2026 · Period 1 · Week 1 (a Monday)

/** The Monday that starts the fiscal year (Period 1, Week 1) containing `iso`. */
export function fyStart(iso: string): string {
  const day = dayNum(iso)
  let start = FY_BASE + Math.floor((day - FY_BASE) / FY_LEN) * FY_LEN
  if (day < start) start -= FY_LEN
  return isoOfDayNum(start)
}

/** Thirteen 4-week periods. Returns {period 1..13, week 1..4}. */
export function periodWeek(isoDate: string): { period: number; week: number } {
  const since = dayNum(isoDate) - dayNum(fyStart(isoDate)) // 0..363
  return { period: Math.floor(since / 28) + 1, week: Math.floor((since % 28) / 7) + 1 }
}

/** The Monday that starts the 28-day period containing `iso`. */
export function periodStart(iso: string): string {
  const start = dayNum(fyStart(iso))
  const since = dayNum(iso) - start
  return isoOfDayNum(start + Math.floor(since / 28) * 28)
}

/** The Monday that starts period number `p` (1..13) of `iso`'s fiscal year. */
export function periodStartNum(iso: string, p: number): string {
  return isoOfDayNum(dayNum(fyStart(iso)) + (p - 1) * 28)
}
