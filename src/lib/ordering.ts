// Ordering — a catalog-backed view (handoff spec, Item Catalog step 2):
// the catalog is the one master list; this module projects it into per-vendor
// order guides using THIS store's on/off flags and par/on-hand counts, and
// keeps the same API the Imports receiving flow already uses.
import { load, save } from './store'
import { useScope } from './scope'
import type { LineItem } from './reader'
import {
  getCatalog,
  getFlags,
  getPars,
  setPars,
  registerItem,
  setOnGuide,
  type CatalogItem,
} from './catalog'

export interface OrderItem {
  id: string
  name: string
  unit: string
  par: number
  onHand: number
  category: string
  cost?: number
}
export type OrderingData = Record<string, OrderItem[]>

const DEFAULT_VENDORS = ['US Foods', 'Gulf Coast Produce']

function storeKey(k: string): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}

/** One-time: move any legacy vendor-guide items into the catalog. */
function migrateLegacy(): void {
  if (load<boolean>(storeKey('__catalogMigrated'), false)) return
  const legacy = load<Record<string, Array<{ name: string; unit: string; par: number; onHand: number }>>>(
    storeKey('ordering:data'),
    {},
  )
  const pars = getPars()
  for (const [vendor, items] of Object.entries(legacy)) {
    for (const it of items ?? []) {
      const ci = registerItem({ name: it.name, unit: it.unit, vendor })
      setOnGuide(ci.id, true)
      pars[ci.id] = { par: it.par ?? 0, onHand: it.onHand ?? 0 }
    }
  }
  setPars(pars)
  save(storeKey('__catalogMigrated'), true)
}

/** This store's order guides, grouped by vendor, from the catalog. */
export function getOrdering(): OrderingData {
  migrateLegacy()
  const flags = getFlags()
  const pars = getPars()
  const out: OrderingData = {}
  for (const v of DEFAULT_VENDORS) out[v] = []
  for (const ci of getCatalog()) {
    if (!flags[ci.id]) continue
    const vendor = ci.vendor || 'Other'
    const p = pars[ci.id] ?? { par: 0, onHand: 0 }
    ;(out[vendor] ??= []).push({ id: ci.id, name: ci.name, unit: ci.unit, par: p.par, onHand: p.onHand, category: ci.category, cost: ci.cost })
  }
  return out
}

export const suggested = (it: { par: number; onHand: number }) => Math.max(0, it.par - it.onHand)
export const vendors = (): string[] => {
  const set = new Set(DEFAULT_VENDORS)
  for (const ci of getCatalog()) if (ci.vendor) set.add(ci.vendor)
  return [...set]
}

/** Set this store's par / on-hand for a catalog item. */
export function setParEntry(id: string, patch: Partial<{ par: number; onHand: number }>): void {
  const pars = getPars()
  const cur = pars[id] ?? { par: 0, onHand: 0 }
  pars[id] = { ...cur, ...patch }
  setPars(pars)
}

/** Add a new item: registers in the catalog once, flags it onto this store's guide. */
export function addOrderItem(vendor: string, name: string, unit: string, onHand: number, category?: string): void {
  const ci = registerItem({ name, unit: unit || 'cs', vendor, category })
  setOnGuide(ci.id, true)
  setParEntry(ci.id, { onHand: Math.max(0, onHand) })
}

// ---- fuzzy matching (receiving → catalog items) ----

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function bestMatch(
  desc: string,
  items: Array<{ vendor: string; item: OrderItem }>,
): { vendor: string; item: OrderItem; score: number } | null {
  const dt = new Set(normalize(desc).split(' ').filter((w) => w.length > 2))
  if (dt.size === 0) return null
  let best: { vendor: string; item: OrderItem } | null = null
  let bestScore = 0
  for (const c of items) {
    const it = new Set(normalize(c.item.name).split(' ').filter((w) => w.length > 2))
    if (it.size === 0) continue
    let shared = 0
    dt.forEach((w) => it.has(w) && shared++)
    const score = shared / Math.min(dt.size, it.size)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best && bestScore >= 0.5 ? { ...best, score: bestScore } : null
}

export interface Receipt {
  vendor: string
  itemId: string
  qty: number
}

/** Add received quantities onto this store's on-hand counts. */
export function applyReceipts(receipts: Receipt[]): number {
  const pars = getPars()
  let applied = 0
  for (const r of receipts) {
    const p = pars[r.itemId] ?? { par: 0, onHand: 0 }
    pars[r.itemId] = { ...p, onHand: Math.max(0, p.onHand + r.qty) }
    applied++
  }
  setPars(pars)
  return applied
}

/** Suggest a mapping of extracted invoice lines → order-guide items. */
export function proposeReceipts(lineItems: LineItem[]) {
  const data = getOrdering()
  const flat = Object.entries(data).flatMap(([vendor, items]) => items.map((item) => ({ vendor, item })))
  return lineItems.map((li) => {
    const m = bestMatch(li.description, flat)
    const qty = li.qty ? parseInt(li.qty, 10) : 1
    return {
      description: li.description,
      qty: Number.isFinite(qty) ? qty : 1,
      match: m,
    }
  })
}

/** Legacy factory kept for callers that still build ad-hoc items. */
export function mk(name: string, unit: string, par: number, onHand: number): OrderItem {
  return { id: `${name}-${Math.round(par * 7 + onHand)}`, name, unit, par, onHand, category: 'Other' }
}

export type { CatalogItem }
