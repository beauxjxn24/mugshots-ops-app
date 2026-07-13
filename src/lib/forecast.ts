// Shared projection math: each day is predicted by the average of the last 4
// same-weekdays (Fridays predict Fridays). Used by the Forecast screen and the
// dashboard's dashed forecast bars.
import type { Night } from './nightly'

export function dowAverages(log: Night[]): Record<number, number> {
  const byDow: Record<number, Night[]> = {}
  for (const n of log) {
    if (!(n.netSales > 0)) continue
    const d = new Date(n.date + 'T12:00:00')
    ;(byDow[d.getDay()] ??= []).push(n)
  }
  const avg: Record<number, number> = {}
  for (const [k, arr] of Object.entries(byDow)) {
    const recent = arr.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
    avg[+k] = recent.reduce((s, n) => s + n.netSales, 0) / recent.length
  }
  return avg
}

/** Projected net for an ISO date, or 0 when there's no basis. */
export function projectDay(avg: Record<number, number>, isoDate: string): number {
  const dow = new Date(isoDate + 'T12:00:00').getDay()
  return Math.round(avg[dow] ?? 0)
}

/** Restaurant calendar: thirteen 4-week periods. Returns {period, week}. */
export function periodWeek(isoDate: string): { period: number; week: number } {
  const d = new Date(isoDate + 'T12:00:00')
  const start = new Date(d.getFullYear(), 0, 1)
  const doy = Math.floor((d.getTime() - start.getTime()) / 86400000)
  return { period: Math.min(13, Math.floor(doy / 28) + 1), week: Math.floor((doy % 28) / 7) + 1 }
}
