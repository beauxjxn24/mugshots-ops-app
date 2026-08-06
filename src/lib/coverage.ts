import { getNights, getCatMix, type CatMix } from './nightly'
import { getPmixDays } from './pmix'
import { laborRangeFor, type LaborRange } from './laborRange'
import { today } from './store'

/**
 * What's actually on file for a date window — and at what resolution.
 *
 * Toast's exports don't all arrive at the same grain. Sales come per night;
 * labor and sales-category come per NIGHT from a single-day export but only as
 * a PERIOD TOTAL from a date-range export. A backlog import at a new store is
 * mostly range exports, so a lot of what it knows is period-level.
 *
 * The rule everywhere in the app: report the grain, never fake the detail. A
 * period total shown as a period total is a real number; the same total split
 * across 38 nights is a guess wearing a fact's clothes. This is what the
 * "What's on file" panel reads, so a new store's first screen says exactly what
 * it has instead of leaving a manager to wonder why something looks off.
 */
export type Grain = 'none' | 'partial' | 'nightly' | 'period'

export interface Coverage {
  /** Days in the window that have already happened. */
  days: number
  /** Nights with sales on file. */
  salesDays: number
  salesGrain: Grain
  /** Nights carrying their own labor figure. */
  laborDays: number
  /** A range import covering the whole window, if there is one. */
  laborRange: LaborRange | null
  laborGrain: Grain
  /** The imported sales-category mix, and whether it covers this window. */
  catMix: CatMix | null
  catMixCovers: boolean
  categoryGrain: Grain
  /** Days with a product mix on file. */
  pmixDays: number
  pmixGrain: Grain
}

const dayCount = (start: string, end: string): number => {
  const a = Date.parse(`${start}T00:00:00`)
  const b = Date.parse(`${end}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86400000) + 1
}

const grain = (have: number, total: number): Grain =>
  have <= 0 ? 'none' : total > 0 && have >= total ? 'nightly' : 'partial'

export function coverageFor(start: string, end: string): Coverage {
  // Never grade a window against days that haven't happened yet.
  const t = today()
  const stop = end < t ? end : t
  const days = dayCount(start, stop)

  const nights = getNights().filter((n) => n.date >= start && n.date <= stop)
  const salesDays = nights.filter((n) => (n.netSales ?? 0) > 0).length
  const laborDays = nights.filter((n) => (n.labor ?? 0) > 0).length
  const laborRange = laborRangeFor(start, stop)

  const catMix = getCatMix()
  // The mix is only honest about this window if its import span contains it.
  const catMixCovers = !!(catMix && catMix.net > 0 && (!catMix.from || !catMix.to || (catMix.from <= start && catMix.to >= stop)))

  const pmix = getPmixDays()
  const pmixDays = Object.keys(pmix).filter((d) => d >= start && d <= stop && (pmix[d]?.items?.length ?? 0) > 0).length

  return {
    days,
    salesDays,
    salesGrain: grain(salesDays, days),
    laborDays,
    laborRange,
    laborGrain: laborDays > 0 ? grain(laborDays, days) : laborRange ? 'period' : 'none',
    catMix,
    catMixCovers,
    categoryGrain: catMix && catMix.net > 0 ? 'period' : 'none',
    pmixDays,
    pmixGrain: grain(pmixDays, days),
  }
}

/** Period-level category totals, straight from the imported mix — no splitting. */
export function categoryTotals(mix: CatMix): { name: string; net: number; pct: number }[] {
  const rows = [
    { name: 'Food', net: mix.food },
    { name: 'Liquor', net: mix.liquor },
    { name: 'Beer', net: mix.beer },
    { name: 'Wine', net: mix.wine },
    { name: 'N/A Bev', net: mix.na },
    { name: 'Other', net: mix.other },
  ].filter((r) => r.net > 0)
  const total = rows.reduce((s, r) => s + r.net, 0) || mix.net || 1
  return rows
    .map((r) => ({ ...r, pct: (r.net / total) * 100 }))
    .sort((a, b) => b.net - a.net)
}
