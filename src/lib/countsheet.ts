// Inventory count sheets — the owner's real physical-count layout: items grouped
// by storage area (Freezer, Cooler, Cooks Line…), each counted in one to three
// units of measure (e.g. Each + Case). This is a separate list from the order-
// guide catalog: Inventory reads count sheets; Ordering reads the catalog.
import { load, save } from './store'
import { useScope } from './scope'
import COUNTSHEET_SEED from '../data/countsheet-flowood.json'

export interface CountUnit {
  uom: string
  qty: number
}
export interface CountItem {
  id: string
  location: string
  name: string
  units: CountUnit[]
  lastCount?: string // YYYY-MM-DD of the last edit to any of its counts
}

const scoped = (k: string) => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}
const SHEET_KEY = 'inv:sheet'

let idSeq = 0
export function newCountId(): string {
  return `cs${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

/** Guard against corrupt/legacy shapes — every item needs a name + a units array. */
export function sanitizeSheet(raw: unknown): CountItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((it) => it && typeof it === 'object' && typeof (it as CountItem).name === 'string')
    .map((it) => {
      const c = it as CountItem
      const units = Array.isArray(c.units) ? c.units : []
      return {
        id: typeof c.id === 'string' ? c.id : newCountId(),
        location: typeof c.location === 'string' && c.location.trim() ? c.location : 'Other',
        name: c.name,
        units: units
          .filter((u) => u && typeof u.uom === 'string')
          .map((u) => ({ uom: u.uom, qty: Number(u.qty) || 0 })),
        lastCount: typeof c.lastCount === 'string' ? c.lastCount : undefined,
      }
    })
}

export const getCountSheet = (): CountItem[] => sanitizeSheet(load<CountItem[]>(scoped(SHEET_KEY), []))
export const setCountSheet = (items: CountItem[]): void => save(scoped(SHEET_KEY), items)

/** Storage locations present in a sheet, in first-seen order. */
export function sheetLocations(items: CountItem[]): string[] {
  const seen: string[] = []
  for (const it of items) if (!seen.includes(it.location)) seen.push(it.location)
  return seen
}

/** Does this text look like an inventory count sheet (vs an invoice / PMIX)? */
export function isCountSheet(text: string): boolean {
  const first = (text ?? '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const hasLoc = /storage\s*location|\barea\b/.test(first)
  const hasItem = /\bitem\b|\bproduct\b/.test(first)
  const hasUom = /\buofm\b|\buom\b|\bunit\b/.test(first)
  return hasLoc && hasItem && hasUom
}

/**
 * Parse a count-sheet CSV shaped like the owner's export:
 *   StorageLocation,Item,UofM,Qty,UofM2,Qty2,UofM3,Qty3
 * Returns [] if it doesn't look like a count sheet (so the drop router can
 * try other parsers).
 */
export function parseCountSheet(text: string): CountItem[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = splitCsv(lines[0]).map((h) => h.toLowerCase().trim())
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)))
  const iLoc = col('storagelocation', 'storage location', 'location', 'area')
  const iName = col('item', 'product', 'name')
  const iU1 = col('uofm', 'uom', 'unit')
  if (iName < 0 || iU1 < 0) return []
  const iQ1 = col('qty', 'quantity', 'count')
  // Secondary/tertiary unit columns fall right after their UofM header.
  const uomCols = header.map((h, i) => (/^(uofm|uom|unit)\d*$/.test(h) || h.startsWith('uofm') || h.startsWith('uom') ? i : -1)).filter((i) => i >= 0)
  const items: CountItem[] = []
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    const name = (c[iName] ?? '').trim()
    if (!name) continue
    const location = (c[iLoc] ?? '').trim() || 'Other'
    const units: CountUnit[] = []
    if (uomCols.length) {
      for (const ui of uomCols) {
        const uom = (c[ui] ?? '').trim()
        if (!uom) continue
        const qty = Number((c[ui + 1] ?? '').replace(/[^0-9.-]/g, '')) || 0
        units.push({ uom, qty })
      }
    } else {
      const uom = (c[iU1] ?? '').trim() || 'Each'
      units.push({ uom, qty: Number((c[iQ1] ?? '').replace(/[^0-9.-]/g, '')) || 0 })
    }
    items.push({ id: newCountId(), location, name, units: units.length ? units : [{ uom: 'Each', qty: 0 }] })
  }
  return items
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
    } else if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** One-time: seed Flowood's kitchen count sheet from the owner's export. */
export function seedCountSheet(): void {
  const s = useScope.getState()
  if (s.currentLocation !== 'flowood') return
  if (load<string>(scoped('inv:sheetSeeded'), '') === 'v1') return
  // Only seed an empty sheet — never clobber counts already entered.
  if (getCountSheet().length === 0) {
    setCountSheet(sanitizeSheet((COUNTSHEET_SEED as CountItem[]).map((it) => ({ ...it, id: newCountId() }))))
  }
  save(scoped('inv:sheetSeeded'), 'v1')
}
