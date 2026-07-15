// Product-mix (PMIX) storage — per day, per the handoff spec ('pmix-days').
// The Mix screen and the dashboard's tracked tiles both read from here.
import { load } from './store'
import { useScope } from './scope'

export interface MixItem {
  name: string
  category: string
  qty: number
  sales: number
}

export interface PmixDay {
  items: MixItem[]
  file: string
  importedAt: string
}
export type PmixDays = Record<string, PmixDay> // YYYY-MM-DD → that day's mix

export function getPmixDays(): PmixDays {
  const s = useScope.getState()
  return sanitizePmix(load<PmixDays>(`${s.currentConcept}|${s.currentLocation}::pmix:days`, {}))
}

/** Guard against corrupt/legacy shapes — every day must have an items array. */
export function sanitizePmix(raw: unknown): PmixDays {
  const out: PmixDays = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [date, day] of Object.entries(raw as Record<string, unknown>)) {
    const items = (day as PmixDay)?.items
    if (Array.isArray(items)) out[date] = { items, file: (day as PmixDay).file ?? '', importedAt: (day as PmixDay).importedAt ?? '' }
  }
  return out
}

/** Pull a YYYY-MM-DD out of a file name, e.g. "pmix 2026-07-12.csv" or "PMIX_07-12-2026". */
export function dateFromFilename(name: string): string {
  let m: RegExpMatchArray | null
  if ((m = name.match(/\b(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})\b/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  if ((m = name.match(/\b(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})\b/))) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`
  return ''
}

/** Parse a PMIX-style CSV: finds item / qty / net-sales / category columns by header. */
export function parsePmix(text: string): MixItem[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = splitCsv(lines[0]).map((h) => h.toLowerCase())
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)))
  const iName = find('menu item', 'item name', 'item', 'name')
  const iQty = find('qty', 'quantity', 'sold', 'count', '# ')
  const iSales = find('net sales', 'net amount', 'gross', 'sales', 'amount', 'total')
  const iCat = find('sales category', 'category', 'group', 'menu group')
  if (iName < 0 || (iQty < 0 && iSales < 0)) return []

  const byName = new Map<string, MixItem>()
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const name = (c[iName] ?? '').trim()
    if (!name || /^total/i.test(name)) continue
    const qty = iQty >= 0 ? num(c[iQty]) : 0
    const sales = iSales >= 0 ? num(c[iSales]) : 0
    if (qty === 0 && sales === 0) continue
    const cur = byName.get(name)
    if (cur) {
      cur.qty += qty
      cur.sales += sales
    } else {
      byName.set(name, { name, category: (iCat >= 0 ? c[iCat] : '').trim(), qty, sales })
    }
  }
  return [...byName.values()]
}

function pad(n: string): string {
  return String(n).padStart(2, '0')
}
function num(s?: string): number {
  const n = parseFloat((s ?? '').replace(/[$,()\s]/g, ''))
  return Number.isFinite(n) ? Math.abs(n) : 0
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
  return out.map((s) => s.trim().replace(/^"|"$/g, ''))
}
