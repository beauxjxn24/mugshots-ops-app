import { load, save } from './store'
import { useScope } from './scope'

/**
 * Period-level labor, from a DATE-RANGE Toast labor export.
 *
 * A range export ("Labor cost summary.csv" inside LaborBreakDown_A_B.zip) has
 * exactly one row covering the whole span — e.g. $40,794.73 labor on
 * $273,372.98 net = 14.92% for Jun 29–Aug 4. That total is REAL and useful, but
 * it is NOT one night's labor: stapling it to a single night is what made the
 * Nightly page read −717%. So range labor is stored here, against its own date
 * span, and reported as a period figure. Per-night labor still comes only from
 * a per-day labor report or a single-day export.
 */
export interface LaborRange {
  start: string // YYYY-MM-DD
  end: string
  labor: number
  net?: number
  gross?: number
  pct?: number
  importedAt: string
}

const key = () => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::labor:ranges`
}

export const getLaborRanges = (): LaborRange[] => {
  const r = load<LaborRange[]>(key(), [])
  return Array.isArray(r) ? r.filter((x) => x && x.start && x.end && x.labor > 0) : []
}

/** Save a range (replacing any import covering the exact same span). */
export function saveLaborRange(r: Omit<LaborRange, 'importedAt'>): void {
  const rest = getLaborRanges().filter((x) => !(x.start === r.start && x.end === r.end))
  save(key(), [...rest, { ...r, importedAt: new Date().toISOString() }])
}

/**
 * The best range figure for a window — the smallest imported range that fully
 * contains it, so a week inside an imported period still reports that period's
 * rate rather than nothing. Returns null when no import covers the window.
 */
export function laborRangeFor(start: string, end: string): LaborRange | null {
  const covering = getLaborRanges()
    .filter((r) => r.start <= start && r.end >= end)
    .sort((a, b) => (a.end.localeCompare(a.start) === 0 ? 0 : 0) || (a.start === b.start ? a.end.localeCompare(b.end) : b.start.localeCompare(a.start)))
  return covering[0] ?? null
}

/** Pull a start/end out of a Toast export filename (…_YYYYMMDD_YYYYMMDD.zip). */
export function rangeFromName(name: string): { start: string; end: string } | null {
  const m = name.match(/(\d{8})[_-](\d{8})/)
  if (!m) return null
  const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  const start = iso(m[1])
  const end = iso(m[2])
  return start <= end ? { start, end } : { start: end, end: start }
}

/**
 * One-time repair for devices that imported a date-range labor export BEFORE
 * range handling existed: that whole-span total was applied to a single night,
 * leaving e.g. $40,794 of labor against one $5,700 night (the "-717%" / "717%"
 * labor on the dashboard). Any night whose labor exceeds 60% of its own net —
 * or that carries labor with no sales at all — cannot be a real night's labor,
 * so the bogus figure is cleared. Real nights are untouched, and re-dropping a
 * per-day labor report refills them properly.
 */
export function repairStapledLabor(): number {
  const FLAG = 'mugops:__laborStapleRepaired_v1'
  try {
    if (localStorage.getItem(FLAG)) return 0
    let fixed = 0
    for (const k of Object.keys(localStorage)) {
      if (!/::nightly:log$/.test(k)) continue
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]')
        if (!Array.isArray(arr)) continue
        let changed = false
        for (const n of arr) {
          const labor = Number(n?.labor) || 0
          if (labor <= 0) continue
          const net = Number(n?.netSales) || 0
          const absurd = net <= 0 || labor / net > 0.6
          if (absurd) {
            delete n.labor
            delete n.laborPct
            changed = true
            fixed++
          } else if (n.laborPct != null && (n.laborPct < 0 || n.laborPct > 100)) {
            delete n.laborPct // keep the labor $, drop only the bad percentage
            changed = true
            fixed++
          }
        }
        if (changed) localStorage.setItem(k, JSON.stringify(arr))
      } catch {
        /* skip a corrupt key */
      }
    }
    localStorage.setItem(FLAG, '1')
    return fixed
  } catch {
    return 0
  }
}
