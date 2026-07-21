import { load, save } from './store'
import { useScope } from './scope'
import seedHistory2025 from '../data/seed-history-2025.json'
import seedSales2026 from '../data/seed-sales-2026.json'

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
 * One-time data migrations for Mugshots → Flowood.
 * Owner's call (Jul 2026): NO sample data anywhere — the prototype's 2026
 * seed nights are removed from every device that loaded them. The only
 * baked-in history is what the owner supplied himself (June 2025 Toast export).
 */
export function seedFlowoodHistory(): void {
  const k = 'mugshots|flowood::nightly:log'

  // Purge the prototype's sample nights (ids "seed-…") wherever they landed.
  const PURGE = '__sampleNightsPurged'
  if (!load<boolean>(PURGE, false)) {
    const cur = load<Night[]>(k, [])
    const clean = cur.filter((n) => !(typeof n?.id === 'string' && n.id.startsWith('seed-')))
    if (clean.length !== cur.length) save(k, clean)
    save(PURGE, true)
  }

  // Second seed (owner-supplied via chat, Jul 2026): real June 2025 sales from
  // the Toast export — gives June 2026 true last-year comparisons. Merges into
  // whatever is already logged; never overwrites an existing date.
  const FLAG25 = '__flowoodLY2025Seeded'
  if (!load<boolean>(FLAG25, false)) {
    const cur = load<Night[]>(k, [])
    const have = new Set(cur.map((n) => n.date))
    const add: Night[] = (seedHistory2025 as Array<{ date: string; net: number; guests: number }>)
      .filter((r) => !have.has(r.date))
      .map((r) => ({
        id: `seed25-${r.date}`,
        date: r.date,
        netSales: r.net,
        deposit: 0,
        covers: r.guests,
        notes: '',
      }))
    if (add.length) save(k, [...cur, ...add].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
    save(FLAG25, true)
  }

  // Third seed (owner-supplied via chat, Jul 2026): real daily numbers for the
  // current period (Jun 15 – Jul 14, 2026) from the owner's Toast exports —
  //  · Sales by day       → net + covers
  //  · Labor cost by day  → real gross, real labor $, real labor % (per DAY)
  //  · Sales category summary → the period category mix (categories aren't broken
  //                             out per day, so each night is split by that mix)
  // So every field on the Nightly sheet fills without a re-import: gross, net,
  // discounts (gross − net, booked to comps), the category split, covers, and
  // real per-day labor. Only the deposit is left for the manager.
  //
  // v5 is DATE-keyed / id-agnostic (works for seed OR hand-drop imports) and it
  // UPGRADES the earlier flat-14.33% labor estimate to the real per-day figure
  // (a flat night is recognised by laborPct ≈ 14.3). It never overwrites a night
  // that already carries real detail — the owner-drop's 7/11 is restored by
  // applyOwnerDrops right after this runs.
  const FLAG26 = '__flowoodSales2026Real_v5'
  if (!load<boolean>(FLAG26, false)) {
    const cur = load<Night[]>(k, [])
    const seedRows = seedSales2026 as Array<{
      date: string; net: number; guests: number; gross: number; comps: number; labor: number; laborPct: number
    }>
    const seedByDate = new Map(seedRows.map((r) => [r.date, r]))
    const isFlat = (pct?: number) => pct != null && Math.abs(pct - 14.3) < 0.05 // the old estimate
    let changed = false

    const next = cur.map((n) => {
      const r = seedByDate.get(n.date)
      if (!r) return n // outside the period
      const net = n.netSales || r.net
      if (net <= 0) return n
      let m = n
      // Categories: fill only when missing (preserve real per-category detail).
      if (m.food == null) {
        m = { ...m, ...splitByMix(net) }
        changed = true
      }
      // Real per-day labor: fill when missing or replace the flat estimate.
      if (m.labor == null || isFlat(m.laborPct)) {
        m = { ...m, labor: r.labor, laborPct: r.laborPct }
        changed = true
      }
      // Real gross + discount total: fill when missing or when a prior seed had
      // set gross = net (no discount detail).
      if (m.gross == null || m.gross === m.netSales) {
        m = { ...m, gross: r.gross, comps: m.comps ?? r.comps }
        changed = true
      }
      return m
    })

    // Add any period date not logged at all yet, fully populated.
    const have = new Set(cur.map((n) => n.date))
    for (const r of seedRows) {
      if (have.has(r.date)) continue
      next.push({
        id: `seed26-${r.date}`,
        date: r.date,
        netSales: r.net,
        gross: r.gross,
        comps: r.comps,
        deposit: 0,
        covers: r.guests,
        labor: r.labor,
        laborPct: r.laborPct,
        ...splitByMix(r.net),
        notes: 'From Toast sales, labor & category reports',
      })
      changed = true
    }

    if (changed) save(k, next.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))
    save(FLAG26, true)
  }
}

// Split a night's net across the five categories the nightly sheet shows, using
// the period's real Toast category mix (NA 7.53% · Liquor 3.79% · Beer 3.50% ·
// Wine 0.24%). Food takes the remainder — its own ~84.9% plus the negligible
// "other" (retail / service charges, ~0.05%) — so the five parts sum to net
// exactly and the sheet's Category total reconciles with no leftover.
function splitByMix(net: number): Pick<Night, 'food' | 'na' | 'liquor' | 'beer' | 'wine' | 'nocat'> {
  const r2 = (x: number) => Math.round(x * 100) / 100
  const na = r2(net * 0.0752859)
  const liquor = r2(net * 0.0378799)
  const beer = r2(net * 0.0349824)
  const wine = r2(net * 0.0023673)
  const food = r2(net - (na + liquor + beer + wine))
  return { food, na, liquor, beer, wine, nocat: 0 }
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
    byDate.set(r.date, {
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
export interface DiscountBuckets {
  rewards: number
  promos: number
  comps: number
  staffDisc: number
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
  if (iName < 0 || iAmt < 0) return null
  const b: DiscountBuckets = { rewards: 0, promos: 0, comps: 0, staffDisc: 0 }
  let any = false
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const name = (c[iName] ?? '').toLowerCase().trim()
    if (!name || name === 'total') continue
    const amt = Math.abs(num(c[iAmt] ?? ''))
    if (!(amt > 0)) continue
    any = true
    if (/training|staff|employee|shift meal|manager meal|team member|emp\b/.test(name)) b.staffDisc += amt
    else if (/reward|loyalty|points|birthday|anniversary|vip/.test(name)) b.rewards += amt
    else if (/comp|walk ?out|void|remake|re-?fire|recovery|manager|on the house|otoh/.test(name)) b.comps += amt
    else b.promos += amt
  }
  return any ? b : null
}
/** Fill the discount deduction lines onto a night. Returns the date, or null. */
export function applyDiscounts(b: DiscountBuckets, date: string): string | null {
  if (!date) return null
  const nights = getNights()
  const i = nights.findIndex((n) => n.date === date)
  // Only write buckets that actually have a value — never overwrite a line with undefined.
  const patch: Partial<Night> = {}
  if (b.rewards > 0) patch.rewards = b.rewards
  if (b.promos > 0) patch.promos = b.promos
  if (b.comps > 0) patch.comps = b.comps
  if (b.staffDisc > 0) patch.staffDisc = b.staffDisc
  if (i >= 0) nights[i] = { ...nights[i], ...patch }
  else nights.push({ id: `n-${date}`, date, netSales: 0, deposit: 0, covers: 0, notes: '', ...patch })
  setNights(nights.sort((a, b2) => (a.date ?? '').localeCompare(b2.date ?? '')))
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
