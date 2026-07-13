import { load, save } from './store'
import { useScope } from './scope'
import seedHistory from '../data/seed-history.json'
import seedHistory2025 from '../data/seed-history-2025.json'

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
  overUnder?: number
}

function key(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::nightly:log`
}
export const getNights = (): Night[] => load<Night[]>(key(), [])
export const setNights = (n: Night[]): void => save(key(), n)

/**
 * One-time: load the owner's real 21-day Flowood history from the handoff
 * (docs/handoff/data/seed-history.json) into Mugshots → Flowood, only if that
 * store's log is empty. Owner decision (AUDIT.md #2): keep Flowood's data;
 * new stores/concepts start blank.
 */
export function seedFlowoodHistory(): void {
  const FLAG = '__flowoodHistorySeeded'
  const k = 'mugshots|flowood::nightly:log'
  const existing = load<Night[]>(k, [])
  if (!load<boolean>(FLAG, false) && existing.length === 0) {
    const nights: Night[] = (seedHistory as Array<Record<string, number | string>>).map((r) => ({
      id: `seed-${r.date}`,
      date: String(r.date),
      netSales: Number(r.net) || 0,
      deposit: 0,
      covers: 0,
      notes: '',
      gross: Number(r.gross) || undefined,
      rewards: Number(r.rewards) || undefined,
      promos: Number(r.promos) || undefined,
      comps: Number(r.comps) || undefined,
      staffDisc: Number(r.staff) || undefined,
      food: Number(r.food) || undefined,
      beer: Number(r.beer) || undefined,
      liquor: Number(r.liquor) || undefined,
      wine: Number(r.wine) || undefined,
      na: Number(r.na) || undefined,
      nocat: Number(r.nocat) || undefined,
      labor: Number(r.labor) || undefined,
      laborPct: Number(r.laborPct) || undefined,
      overUnder: r.overUnder != null ? Number(r.overUnder) : undefined,
    }))
    save(k, nights)
  }
  save(FLAG, true)

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
    if (add.length) save(k, [...cur, ...add].sort((a, b) => a.date.localeCompare(b.date)))
    save(FLAG25, true)
  }
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
  setNights([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)))
  return count
}

export function isSalesSummary(text: string): boolean {
  return /\b(sales summary|net sales|gross sales|daily sales|sales by day)\b/i.test(text)
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
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
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
