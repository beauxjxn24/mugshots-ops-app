import { load, save } from './store'
import { useScope } from './scope'

/**
 * A night's numbers — full prototype shape (see docs/handoff/README.md).
 * `netSales` is the canonical net figure every screen reads; the richer
 * fields (gross → discounts → net, category sales, labor, over/under) are
 * optional so older records and simple imports still work.
 */
export interface Night {
  id: string
  date: string // YYYY-MM-DD
  netSales: number
  deposit: number
  covers: number
  notes: string
  // gross → net
  gross?: number
  rewards?: number
  promos?: number
  comps?: number
  staffDisc?: number
  // sales by category
  food?: number
  beer?: number
  liquor?: number
  wine?: number
  na?: number
  nocat?: number
  // labor + deposit
  labor?: number
  laborPct?: number
  expected?: number // expected cash from the POS (drawer)
  overUnder?: number
  // off-premise (takeout + delivery) net
  togo?: number
  // Toast "Net sales summary": rolled-up discount + refund totals (Gross −
  // discounts − refunds = Net), for the clean summary card.
  salesDiscounts?: number
  refunds?: number
  // Raw Toast report tables, stored so the Nightly page can mirror each report
  // card exactly (imported, read-only).
  discountLines?: { name: string; count?: number; amount: number }[]
  categoryRows?: CategoryRow[]
  diningRows?: { name: string; orders: number; net: number; gross: number }[]
  // Toast "Sales breakdown" (Dining Option × Sales Category cross-tab) — the
  // richer source with qty / net / discount / gross / tax and an expandable
  // child breakdown, mirrored on the Nightly Category + Dining cards.
  catBreakdown?: BreakdownRow[] // by category, children = by dining option
  dineBreakdown?: BreakdownRow[] // by dining option, children = by category
  // Toast "Cash summary" — all six rows, mirrored on the Nightly Cash card.
  cash?: CashSummary
}

/** One row of a Toast sales-breakdown table (a category or dining option),
 *  with an optional child breakdown for the expandable `>` rows. */
export interface BreakdownRow {
  name: string
  qty: number
  net: number
  disc: number
  gross: number
  tax: number
  children?: BreakdownRow[]
}

/** One row of a Toast "Sales category summary" (the standard, non-cross-tab
 *  report inside every Sales Summary export). */
export interface CategoryRow {
  name: string
  items: number
  net: number
  gross: number
  disc?: number
  tax?: number
}
export interface CashSummary {
  expClose: number
  actClose: number
  cashOS: number
  expDep: number
  actDep: number
  depOS: number
}

function key(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::nightly:log`
}
export const getNights = (): Night[] => load<Night[]>(key(), [])
export const setNights = (n: Night[]): void => save(key(), n)

// ---- Sales-category mix (from Toast's "Sales category summary") ----
// A period-level split of net sales by category. Toast doesn't break categories
// out per day, so we keep the mix (Food/Beer/Liquor/Wine/NA %s) and apply it to
// whatever window is on screen — labelled as an estimate, never fabricated.
export interface CatMix {
  food: number
  beer: number
  liquor: number
  wine: number
  na: number
  other: number
  net: number
  from?: string
  to?: string
  importedAt?: string
}
const catMixKey = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::nightly:catmix`
}
export const getCatMix = (): CatMix | null => load<CatMix | null>(catMixKey(), null)
export const setCatMix = (m: CatMix): void => save(catMixKey(), m)

/**
 * Split every night's net sales by the imported category mix, filling the
 * per-night Food/NA/Beer/Liquor/Wine fields the Nightly page shows. Toast has no
 * per-day category breakdown, so this is an estimate from the period mix — but
 * it always sums to that night's net (the remainder folds into Food). Returns
 * the number of nights filled.
 */
/** Split a net figure by the STORED category mix (for display when a night has
 *  no saved per-category values). Returns null if no mix has been imported. */
export function catMixSplit(net: number): Pick<Night, 'food' | 'na' | 'beer' | 'liquor' | 'wine'> | null {
  const mix = getCatMix()
  if (!mix || !(mix.net > 0) || !(net > 0)) return null
  const r2 = (x: number) => Math.round(x * 100) / 100
  const na = r2(net * (mix.na / mix.net))
  const liquor = r2(net * (mix.liquor / mix.net))
  const beer = r2(net * (mix.beer / mix.net))
  const wine = r2(net * (mix.wine / mix.net))
  return { food: r2(net - (na + liquor + beer + wine)), na, liquor, beer, wine }
}

export function applyCatMixToNights(mix: CatMix): number {
  if (!mix || !(mix.net > 0)) return 0
  const fr = { na: mix.na / mix.net, liquor: mix.liquor / mix.net, beer: mix.beer / mix.net, wine: mix.wine / mix.net }
  const r2 = (x: number) => Math.round(x * 100) / 100
  const nights = getNights()
  let count = 0
  for (const n of nights) {
    if (!(n.netSales > 0)) continue
    const na = r2(n.netSales * fr.na)
    const liquor = r2(n.netSales * fr.liquor)
    const beer = r2(n.netSales * fr.beer)
    const wine = r2(n.netSales * fr.wine)
    n.food = r2(n.netSales - (na + liquor + beer + wine))
    n.na = na
    n.liquor = liquor
    n.beer = beer
    n.wine = wine
    count++
  }
  setNights(nights)
  return count
}

/**
 * Full category table (per category: items, net, gross) — mirrors the Toast
 * "Sales category summary" report row-for-row for the Nightly card.
 */
export function parseCategoryRows(text: string): CategoryRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const iCat = cols.findIndex((h) => h.includes('category'))
  const iItems = cols.findIndex((h) => h === 'items' || h.includes('item'))
  const iNet = cols.findIndex((h) => h.includes('net sales')) >= 0 ? cols.findIndex((h) => h.includes('net sales')) : cols.findIndex((h) => h === 'net')
  const iGross = cols.findIndex((h) => h.includes('gross sales')) >= 0 ? cols.findIndex((h) => h.includes('gross sales')) : cols.findIndex((h) => h === 'gross')
  const iDisc = cols.findIndex((h) => h.includes('discount'))
  const iTax = cols.findIndex((h) => h.includes('tax'))
  if (iCat < 0 || iNet < 0) return []
  const out: CategoryRow[] = []
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const name = (c[iCat] ?? '').trim()
    if (!name || name.toLowerCase() === 'total') continue
    const net = Math.round(num(c[iNet] ?? '') * 100) / 100
    const gross = iGross >= 0 ? Math.round(num(c[iGross] ?? '') * 100) / 100 : 0
    const items = iItems >= 0 ? Math.round(num(c[iItems] ?? '')) : 0
    const disc = iDisc >= 0 ? Math.round(num(c[iDisc] ?? '') * 100) / 100 : 0
    const tax = iTax >= 0 ? Math.round(num(c[iTax] ?? '') * 100) / 100 : 0
    if (net === 0 && gross === 0 && items === 0) continue
    out.push({ name, items, net, gross, disc, tax })
  }
  return out
}
/** Store the full category table on a night (read-only mirror of the report). */
export function applyCategoryRows(rows: CategoryRow[], date: string): string | null {
  if (!date || !rows.length) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  if (i >= 0) nights[i] = { ...nights[i], categoryRows: rows }
  else nights.push({ id: `n-${date}`, date, netSales: 0, deposit: 0, covers: 0, notes: '', categoryRows: rows })
  setNights(nights.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return date
}

/** Is this a Toast "Sales category summary" (category → net sales table)? */
export function isCategorySummary(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  return /sales\s*category/.test(first) && /net\s*sales/.test(first)
}

/** Parse a category summary into a net-sales mix (buckets Toast categories). */
export function parseCategorySummary(text: string): CatMix | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase())
  const iCat = cols.findIndex((h) => h.includes('category'))
  const iNet = cols.findIndex((h) => h.includes('net sales')) >= 0 ? cols.findIndex((h) => h.includes('net sales')) : cols.findIndex((h) => h.includes('net'))
  if (iCat < 0 || iNet < 0) return null
  const out = { food: 0, beer: 0, liquor: 0, wine: 0, na: 0, other: 0 }
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const cat = (c[iCat] ?? '').toLowerCase().trim()
    if (!cat || cat === 'total') continue
    const val = num(c[iNet] ?? '')
    if (!val) continue
    if (/wine/.test(cat)) out.wine += val
    else if (/beer/.test(cat)) out.beer += val
    else if (/liquor|spirit|cocktail/.test(cat)) out.liquor += val
    else if (/non-?alc|\bn\/?a\b|beverage|soft drink|soda/.test(cat)) out.na += val
    else if (/food|shake|kitchen|entree|appetizer|dessert/.test(cat)) out.food += val
    else out.other += val
  }
  const net = out.food + out.beer + out.liquor + out.wine + out.na + out.other
  if (net <= 0) return null
  return { ...out, net }
}

/**
 * NO SAMPLE DATA — only the owner's real, imported numbers (his standing rule).
 *
 * Earlier builds seeded demo nights (a June 2025 history + a Jun 15–Jul 14 2026
 * period). Those fake nights ran through Tuesday July 14, so the Dashboard and
 * Nightly pages — which always show the newest night on record — stayed pinned
 * to that seeded Tuesday. Every real import dated on/before then looked like it
 * "didn't update", when in truth it just wasn't the latest night.
 *
 * This purges every seeded night (any id starting with "seed") from EVERY store,
 * once, and nothing is ever seeded again. Real imported nights (ids "n-…") are
 * untouched, so a freshly-cleaned store shows exactly what you import — nothing
 * more.
 */
export function seedFlowoodHistory(): void {
  const PURGE = '__sampleNightsPurged_v2'
  if (load<boolean>(PURGE, false)) return
  try {
    const NS = 'mugops:'
    for (const fullKey of Object.keys(localStorage)) {
      if (!fullKey.startsWith(NS) || !fullKey.endsWith('::nightly:log')) continue
      const bareKey = fullKey.slice(NS.length)
      const cur = load<Night[]>(bareKey, [])
      const clean = cur.filter((n) => !(typeof n?.id === 'string' && /^seed/i.test(n.id)))
      if (clean.length !== cur.length) save(bareKey, clean)
    }
  } catch {
    /* storage unavailable — nothing to purge */
  }
  save(PURGE, true)
}

export interface SalesRow {
  date: string
  netSales: number
  covers?: number
  deposit?: number
}

/** Upsert imported day rows by date (existing notes/fields preserved). Returns count. */
export function upsertNights(rows: SalesRow[]): number {
  const byDate = new Map(getNights().map((n) => [n.date, n]))
  let count = 0
  for (const r of rows) {
    if (!r.date) continue
    const ex = byDate.get(r.date)
    // Spread ex FIRST so labor, categories, discounts, expected cash and gross
    // set by other report files in the same drop survive — this importer only
    // owns net sales, covers and deposit. (Toast zips extract alphabetically, so
    // "Sales by day" often lands after the discount/cash files.)
    byDate.set(r.date, {
      ...ex,
      id: ex?.id ?? `n-${r.date}`,
      date: r.date,
      netSales: r.netSales,
      deposit: r.deposit ?? ex?.deposit ?? 0,
      covers: r.covers ?? ex?.covers ?? 0,
      notes: ex?.notes ?? 'Imported from sales summary',
    })
    count++
  }
  setNights([...byDate.values()].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return count
}

export function isSalesSummary(text: string): boolean {
  if (isLaborReport(text)) return false // a labor-by-day report also has "net sales"
  return /\b(sales summary|net sales|gross sales|daily sales|sales by day)\b/i.test(text)
}

// ---- Labor report (Toast "Labor cost by day") ----
/** Toast "Labor cost by day" export: first column Day, plus a labor-cost + %. */
export function isLaborReport(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const cols = first.split(',').map((s) => s.trim())
  return cols[0] === 'day' && /labor\s*%/.test(first) && /(total cost|labor cost)/.test(first)
}

export interface LaborRow {
  date: string
  labor: number
  laborPct?: number
  gross?: number
  net?: number
}

/**
 * Parse per-day labor cost / % from a "Labor cost by day" export. Toast puts the
 * day's NET and GROSS sales in the same file, so we pull those too — the labor
 * report can fill the sales line on Nightly all by itself.
 */
export function parseLaborByDay(text: string): LaborRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const iDay = cols.findIndex((h) => h === 'day')
  const iCost = cols.findIndex((h) => h.includes('total cost'))
  const iPct = cols.findIndex((h) => h.includes('labor % (net)'))
  const iGross = cols.findIndex((h) => h === 'gross sales')
  const iNet = cols.findIndex((h) => h === 'net sales')
  if (iDay < 0 || iCost < 0) return []
  const out: LaborRow[] = []
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const d = (c[iDay] ?? '').trim()
    if (!/^\d{8}$/.test(d)) continue // skip subtotal / blank-day rows
    const labor = num(c[iCost] ?? '')
    if (!(labor > 0)) continue
    out.push({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      labor,
      laborPct: iPct >= 0 ? num(c[iPct]) : undefined,
      gross: iGross >= 0 ? num(c[iGross]) || undefined : undefined,
      net: iNet >= 0 ? num(c[iNet]) || undefined : undefined,
    })
  }
  return out
}

/**
 * Fill labor $ / % — plus net & gross sales — onto the matching nights from a
 * labor report. Existing real sales (from a sales-summary import) win; the labor
 * report only fills a night that's still blank, so nothing already entered gets
 * clobbered. Returns count.
 */
export function applyLaborRows(rows: LaborRow[]): number {
  const byDate = new Map(getNights().map((n) => [n.date, n]))
  let count = 0
  for (const r of rows) {
    if (!r.date || !(r.labor > 0)) continue
    const ex = byDate.get(r.date)
    // Fill sales from the labor file when the night has none yet — a real
    // sales-summary value (> 0) is left untouched.
    const netSales = ex?.netSales && ex.netSales > 0 ? ex.netSales : r.net ?? 0
    const gross = ex?.gross && ex.gross > 0 ? ex.gross : r.gross ?? ex?.gross
    byDate.set(r.date, {
      id: ex?.id ?? `n-${r.date}`,
      date: r.date,
      deposit: ex?.deposit ?? 0,
      covers: ex?.covers ?? 0,
      notes: ex?.notes ?? 'From Toast labor report',
      ...ex,
      netSales,
      gross,
      labor: r.labor,
      laborPct: r.laborPct ?? ex?.laborPct,
    })
    count++
  }
  setNights([...byDate.values()].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return count
}

/** The most recent night on record — the one a manager is closing. */
export function latestNightDate(): string | null {
  const ns = getNights()
  return ns.length ? ns[ns.length - 1].date : null // getNights is stored date-ascending
}

// ---- Labor cost SUMMARY (Toast single-day export) ----
// A single-day labor export ships "Labor cost summary.csv" (one row: Net sales,
// Gross sales, Labor cost, Labor %) instead of the month export's "Labor cost by
// day.csv". It has no date, so it fills the night being closed like the cash file.
export function isLaborSummary(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const cols = first.split(',').map((s) => s.trim())
  return cols[0] === 'net sales' && cols.some((c) => c.includes('labor cost')) && /labor\s*%/.test(first)
}
export interface LaborSummary {
  net?: number
  gross?: number
  labor: number
  laborPct?: number
}
export function parseLaborSummary(text: string): LaborSummary | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const vals = splitCsv(lines[1])
  const iNet = cols.findIndex((h) => h === 'net sales')
  const iGross = cols.findIndex((h) => h === 'gross sales')
  const iCost = cols.findIndex((h) => h.includes('labor cost'))
  const iPct = cols.findIndex((h) => h.includes('labor % (net)'))
  const labor = iCost >= 0 ? num(vals[iCost]) : NaN
  if (!(labor > 0)) return null
  return {
    net: iNet >= 0 ? num(vals[iNet]) || undefined : undefined,
    gross: iGross >= 0 ? num(vals[iGross]) || undefined : undefined,
    labor,
    laborPct: iPct >= 0 ? num(vals[iPct]) || undefined : undefined,
  }
}
/** Fill labor (+ net/gross if the night has none) onto a night. Returns the date. */
export function applyLaborSummary(s: LaborSummary, date: string): string | null {
  if (!date || !(s.labor > 0)) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  const ex = i >= 0 ? nights[i] : undefined
  const netSales = ex?.netSales && ex.netSales > 0 ? ex.netSales : s.net ?? ex?.netSales ?? 0
  const gross = ex?.gross && ex.gross > 0 ? ex.gross : s.gross ?? ex?.gross
  const filled: Night = {
    id: ex?.id ?? `n-${date}`,
    date,
    deposit: ex?.deposit ?? 0,
    covers: ex?.covers ?? 0,
    notes: ex?.notes ?? 'From Toast labor summary',
    ...ex,
    netSales,
    gross,
    labor: s.labor,
    laborPct: s.laborPct ?? ex?.laborPct,
  }
  if (i >= 0) nights[i] = filled
  else nights.push(filled)
  setNights(nights.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return date
}

// ---- Cash summary (Toast "Cash summary") → Expected cash on the drawer ----
/** Toast "Cash summary": one row with Expected deposit / Expected closeout cash. */
export function isCashSummary(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  return /expected deposit|expected closeout cash/.test(first)
}
/** Pull the expected cash figure (the deposit the manager should have to count). */
export function parseCashExpected(text: string): number | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const vals = splitCsv(lines[1])
  const iDep = cols.findIndex((h) => h === 'expected deposit')
  const iClose = cols.findIndex((h) => h === 'expected closeout cash')
  const v = iDep >= 0 ? num(vals[iDep]) : iClose >= 0 ? num(vals[iClose]) : NaN
  return Number.isFinite(v) && v !== 0 ? v : null
}
/** Fill Expected cash (POS) onto a night. Returns the date filled, or null. */
export function applyCashExpected(expected: number, date: string): string | null {
  if (!date || !Number.isFinite(expected)) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  if (i >= 0) nights[i] = { ...nights[i], expected }
  else nights.push({ id: `n-${date}`, date, netSales: 0, deposit: 0, covers: 0, notes: '', expected })
  setNights(nights.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return date
}

// ---- Discounts (Toast "Menu Item Discounts" / "Check Discounts") ----
/** A Toast discount report: first column "Discount", plus an "Amount" column. */
export function isDiscountReport(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const cols = first.split(',').map((s) => s.trim())
  return cols[0] === 'discount' && cols.includes('amount')
}
export interface DiscountLine {
  name: string
  count?: number
  amount: number
}
export interface DiscountBuckets {
  rewards: number
  promos: number
  comps: number
  staffDisc: number
  /** Every discount by name, exactly as it appears on the Toast report. */
  lines: DiscountLine[]
}
/** Bucket a discount line into a Nightly deduction category by its name. */
function classifyDiscount(name: string): 'rewards' | 'promos' | 'comps' | 'staffDisc' {
  const n = name.toLowerCase()
  if (/training|staff|employee|shift meal|manager meal|team member|emp\b/.test(n)) return 'staffDisc'
  if (/reward|loyalty|points|birthday|anniversary|vip/.test(n)) return 'rewards'
  if (/comp|walk ?out|void|remake|re-?fire|recovery|manager|on the house|otoh/.test(n)) return 'comps'
  return 'promos'
}
/** Roll a set of discount lines up into the four deduction buckets. */
function bucketsFromLines(lines: DiscountLine[]): Pick<DiscountBuckets, 'rewards' | 'promos' | 'comps' | 'staffDisc'> {
  const b = { rewards: 0, promos: 0, comps: 0, staffDisc: 0 }
  for (const l of lines) b[classifyDiscount(l.name)] += l.amount
  return b
}
/**
 * Bucket the day's discounts into the Nightly deduction lines by name. Names are
 * matched loosely (Toast lets you name your own discounts), so this is a best
 * effort — the manager can still adjust a line.
 */
export function parseDiscounts(text: string): DiscountBuckets | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const iName = cols.findIndex((h) => h === 'discount')
  const iAmt = cols.findIndex((h) => h === 'amount')
  const iCount = cols.findIndex((h) => h === 'count')
  if (iName < 0 || iAmt < 0) return null
  const rows: DiscountLine[] = []
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const raw = (c[iName] ?? '').trim()
    if (!raw || raw.toLowerCase() === 'total') continue
    const amt = Math.abs(num(c[iAmt] ?? ''))
    if (!(amt > 0)) continue
    rows.push({ name: raw, count: iCount >= 0 ? Math.round(num(c[iCount] ?? '')) || undefined : undefined, amount: Math.round(amt * 100) / 100 })
  }
  if (!rows.length) return null
  return { ...bucketsFromLines(rows), lines: rows }
}
/**
 * Merge the day's discounts onto a night. Toast splits discounts across two
 * files (Menu Item Discounts + Check Discounts), so lines are merged by name
 * (re-importing the same file just replaces its own lines — idempotent) and the
 * four deduction buckets are recomputed from the full merged set.
 */
export function applyDiscounts(b: DiscountBuckets, date: string): string | null {
  if (!date || !b.lines.length) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  const ex = i >= 0 ? nights[i] : undefined
  const merged: DiscountLine[] = [...(ex?.discountLines ?? [])]
  for (const line of b.lines) {
    const at = merged.findIndex((m) => m.name.toLowerCase() === line.name.toLowerCase())
    if (at >= 0) merged[at] = line
    else merged.push(line)
  }
  const buckets = bucketsFromLines(merged)
  const patch: Partial<Night> = { discountLines: merged, ...buckets }
  if (i >= 0) nights[i] = { ...ex, ...patch } as Night
  else nights.push({ id: `n-${date}`, date, netSales: 0, deposit: 0, covers: 0, notes: '', ...patch })
  setNights(nights.sort((a, b2) => (a.date ?? '').localeCompare(b2.date ?? '')))
  return date
}

// ---- Dining options (Toast) → ToGo (off-premise) net sales ----
/** Toast "Dining options summary": first column "Dining option", plus net sales. */
export function isDiningOptions(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const cols = first.split(',').map((s) => s.trim())
  return cols[0] === 'dining option' && cols.some((c) => c.includes('net sales'))
}
export interface DiningRow {
  name: string
  orders: number
  net: number
  gross: number
}
/** Full dining-option table (per option: orders, net, gross). */
export function parseDiningRows(text: string): DiningRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const iOpt = cols.findIndex((h) => h === 'dining option')
  const iNet = cols.findIndex((h) => h === 'net sales')
  const iGross = cols.findIndex((h) => h === 'gross sales')
  const iOrd = cols.findIndex((h) => h === 'orders')
  if (iOpt < 0 || iNet < 0) return []
  const out: DiningRow[] = []
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const name = (c[iOpt] ?? '').trim()
    if (!name || name.toLowerCase() === 'total') continue
    out.push({
      name,
      orders: iOrd >= 0 ? Math.round(num(c[iOrd] ?? '')) : 0,
      net: Math.round(num(c[iNet] ?? '') * 100) / 100,
      gross: iGross >= 0 ? Math.round(num(c[iGross] ?? '') * 100) / 100 : 0,
    })
  }
  return out
}
/** ToGo = every dining option that isn't Dine In (takeout + delivery), summed. */
export function togoFromDining(rows: DiningRow[]): number {
  return Math.round(rows.filter((r) => !/dine\s*-?\s*in/.test(r.name.toLowerCase())).reduce((s, r) => s + r.net, 0) * 100) / 100
}
export function applyDining(rows: DiningRow[], date: string): string | null {
  if (!date || !rows.length) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  const patch = { diningRows: rows, togo: togoFromDining(rows) }
  if (i >= 0) nights[i] = { ...nights[i], ...patch }
  else nights.push({ id: `n-${date}`, date, netSales: 0, deposit: 0, covers: 0, notes: '', ...patch })
  setNights(nights.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return date
}

// ---- Net sales summary (Toast) → Gross / discounts / refunds / Net ----
export function isNetSalesSummary(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const cols = first.split(',').map((s) => s.trim())
  return cols[0] === 'gross sales' && cols.includes('net sales') && cols.some((c) => c.includes('discount'))
}
export interface NetSummary {
  gross: number
  discounts: number
  refunds: number
  net: number
}
export function parseNetSummary(text: string): NetSummary | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const v = splitCsv(lines[1])
  const iG = cols.findIndex((h) => h === 'gross sales')
  const iD = cols.findIndex((h) => h.includes('discount'))
  const iR = cols.findIndex((h) => h.includes('refund'))
  const iN = cols.findIndex((h) => h === 'net sales')
  if (iG < 0 || iN < 0) return null
  const r2 = (x: number) => Math.round(x * 100) / 100
  const s = {
    gross: r2(num(v[iG] ?? '')),
    discounts: iD >= 0 ? Math.abs(r2(num(v[iD] ?? ''))) : 0,
    refunds: iR >= 0 ? Math.abs(r2(num(v[iR] ?? ''))) : 0,
    net: r2(num(v[iN] ?? '')),
  }
  return s.gross > 0 || s.net > 0 ? s : null
}
export function applyNetSummary(s: NetSummary, date: string): string | null {
  if (!date) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  const ex = i >= 0 ? nights[i] : undefined
  // Guard against a whole-period net summary landing on a single night: if the
  // day already has a real (smaller) net from the daily sheet and this summary's
  // net dwarfs it, it's a date-range total — applying its gross/discounts would
  // poison the day (net $10k, gross $260k). Leave the day's own numbers alone.
  const dayNet = ex?.netSales && ex.netSales > 0 ? ex.netSales : 0
  if (dayNet > 0 && s.net > dayNet * 1.5) return date
  const patch = {
    gross: s.gross || ex?.gross,
    netSales: dayNet > 0 ? dayNet : s.net || ex?.netSales || 0,
    salesDiscounts: s.discounts,
    refunds: s.refunds,
  }
  if (i >= 0) nights[i] = { ...ex, ...patch } as Night
  else nights.push({ id: `n-${date}`, date, deposit: 0, covers: 0, notes: '', ...patch } as Night)
  setNights(nights.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return date
}

// ---- Toast "Sales breakdown" — Dining Option × Sales Category cross-tab ----
// Header: Dining Option, Sales Category, Item Qty, Net Sales, Discount Amount,
// Gross Sales, Tax Amount. A row with a BLANK Sales Category is that dining
// option's subtotal; the rows under it are its per-category breakdown. This one
// file powers BOTH the Category card and the Dining card (with expandable rows).
export function isSalesBreakdown(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const cols = first.split(',').map((s) => s.trim())
  return cols[0] === 'dining option' && cols[1] === 'sales category' && cols.some((c) => c.includes('net sales'))
}
export interface SalesBreakdown {
  categories: BreakdownRow[] // by category, children = dining options
  dining: BreakdownRow[] // by dining option, children = categories
}
export function parseSalesBreakdown(text: string): SalesBreakdown | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const iOpt = cols.indexOf('dining option')
  const iCat = cols.indexOf('sales category')
  const iQty = cols.findIndex((h) => h.includes('item qty') || h === 'items' || h === 'qty')
  const iNet = cols.findIndex((h) => h.includes('net sales'))
  const iDisc = cols.findIndex((h) => h.includes('discount'))
  const iGross = cols.findIndex((h) => h.includes('gross'))
  const iTax = cols.findIndex((h) => h.includes('tax'))
  if (iOpt < 0 || iCat < 0 || iNet < 0) return null
  const clean = (s: string) => (s ?? '').replace(/^\*+/, '').trim() // Toast prefixes some options with *
  const cell = (c: string[], i: number) => (i >= 0 ? Math.round(num(c[i] ?? '') * 100) / 100 : 0)
  const dining: BreakdownRow[] = []
  const catMap = new Map<string, BreakdownRow>()
  let cur: BreakdownRow | null = null
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const opt = clean(c[iOpt] ?? '')
    const cat = clean(c[iCat] ?? '')
    if (!opt && !cat) continue
    const row: BreakdownRow = {
      name: cat || opt,
      qty: iQty >= 0 ? Math.round(num(c[iQty] ?? '')) : 0,
      net: cell(c, iNet), disc: cell(c, iDisc), gross: cell(c, iGross), tax: cell(c, iTax),
    }
    if (opt && !cat) {
      // Dining-option subtotal row — starts a new group.
      cur = { ...row, name: opt, children: [] }
      dining.push(cur)
    } else if (cat) {
      // Leaf: dining × category. Add to the current dining group's children…
      if (cur) cur.children!.push({ ...row, name: cat })
      // …and aggregate into the category totals (child = this dining option).
      const agg = catMap.get(cat) ?? { name: cat, qty: 0, net: 0, disc: 0, gross: 0, tax: 0, children: [] }
      agg.qty += row.qty; agg.net += row.net; agg.disc += row.disc; agg.gross += row.gross; agg.tax += row.tax
      agg.children!.push({ ...row, name: opt || 'Other' })
      catMap.set(cat, agg)
    }
  }
  const r2 = (x: number) => Math.round(x * 100) / 100
  const categories = [...catMap.values()].map((c) => ({ ...c, net: r2(c.net), disc: r2(c.disc), gross: r2(c.gross), tax: r2(c.tax) }))
  if (!dining.length && !categories.length) return null
  return { categories, dining }
}
/** Store the breakdown on the night being closed. */
export function applySalesBreakdown(d: SalesBreakdown, date: string): string | null {
  if (!date || (!d.categories.length && !d.dining.length)) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  const patch = { catBreakdown: d.categories, dineBreakdown: d.dining }
  if (i >= 0) nights[i] = { ...nights[i], ...patch }
  else nights.push({ id: `n-${date}`, date, netSales: 0, deposit: 0, covers: 0, notes: '', ...patch })
  setNights(nights.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return date
}

/** Full Toast "Cash summary" → all six rows (closeout + deposit + over/short). */
export function parseCashSummary(text: string): CashSummary | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const v = splitCsv(lines[1])
  const at = (name: string) => {
    const i = cols.findIndex((h) => h === name)
    return i >= 0 ? Math.round(num(v[i] ?? '') * 100) / 100 : 0
  }
  const iClose = cols.findIndex((h) => h.includes('closeout'))
  const iDep = cols.findIndex((h) => h.includes('deposit'))
  if (iClose < 0 && iDep < 0) return null
  return {
    expClose: at('expected closeout cash'), actClose: at('actual closeout cash'), cashOS: at('cash overage/shortage'),
    expDep: at('expected deposit'), actDep: at('actual deposit'), depOS: at('deposit overage/shortage'),
  }
}
export function applyCashSummary(c: CashSummary, date: string): string | null {
  if (!date) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  // Also fill the legacy expected/deposit/overUnder fields the rest of the app reads.
  const patch = { cash: c, expected: c.expDep || c.expClose || undefined, deposit: c.actDep || 0, overUnder: c.depOS }
  if (i >= 0) nights[i] = { ...nights[i], ...patch }
  else nights.push({ id: `n-${date}`, date, netSales: 0, covers: 0, notes: '', ...patch })
  setNights(nights.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
  return date
}

/** Parse a Toast-style sales summary (CSV or text) into per-day rows. */
export function parseSalesSummary(text: string): SalesRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0].toLowerCase()
  const csv = header.includes(',') && /date|yyyymmdd/.test(header) && /(net|sales|total|gross)/.test(header)
  const rows: SalesRow[] = []

  if (csv) {
    const cols = splitCsv(lines[0]).map((h) => h.toLowerCase())
    const iDate = cols.findIndex((h) => h.includes('date') || h.includes('yyyymmdd'))
    const iNet =
      cols.findIndex((h) => h.includes('net sales')) >= 0
        ? cols.findIndex((h) => h.includes('net sales'))
        : cols.findIndex((h) => h.includes('net') || h.includes('sales') || h.includes('total'))
    const iCov = cols.findIndex((h) => h.includes('cover') || h.includes('guest') || h.includes('check'))
    for (let r = 1; r < lines.length; r++) {
      const c = splitCsv(lines[r])
      const date = parseDate(c[iDate] ?? '')
      const net = num(c[iNet] ?? '')
      if (date && net > 0) rows.push({ date, netSales: net, covers: iCov >= 0 ? parseInt(c[iCov]) || 0 : 0 })
    }
  } else {
    for (const line of lines) {
      const date = parseDate(line)
      if (!date) continue
      const monies = (line.match(/\$\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\.\d{2}/g) || []).map(num).filter((v) => v > 0)
      if (!monies.length) continue
      rows.push({ date, netSales: monies[monies.length - 1] }) // last $ on the line = net
    }
  }

  const map = new Map<string, SalesRow>()
  rows.forEach((r) => map.set(r.date, r))
  return [...map.values()].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
}

// ---- helpers ----
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')
function pad(n: string | number): string {
  return String(n).padStart(2, '0')
}
function num(s: string): number {
  return parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0
}
function parseDate(s: string): string {
  let m: RegExpMatchArray | null
  if ((m = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  // Toast's compact form: 20250616
  if ((m = s.match(/\b(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])\b/))) return `${m[1]}-${m[2]}-${m[3]}`
  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/))) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${pad(m[1])}-${pad(m[2])}`
  }
  if ((m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    if (mi >= 0) return `${m[3] || new Date().getFullYear()}-${pad(mi + 1)}-${pad(m[2])}`
  }
  return ''
}
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim().replace(/^"|"$/g, ''))
}
