// The Item Catalog — THE master item list (handoff spec, Item Catalog steps
// 1–3): every item lives here exactly once. It is CONCEPT-level (shared by all
// of a concept's stores); each store keeps its own on/off guide flags and
// par/on-hand counts. Everything that adds an item anywhere registers it here.
import { load, save } from './store'
import { useScope } from './scope'

export interface CatalogItem {
  id: string
  name: string
  unit: string
  category: string
  vendor: string
  cost?: number
  costVendor?: string
  costDate?: string // YYYY-MM-DD of the invoice/price sheet that set the cost
  /** Invoice descriptions confirmed to be THIS item — match once, matched forever. */
  aliases?: string[]
}

export const SHELVES = ['Produce', 'Liquor', 'Beer', 'Food', 'Paper / Supply', 'Kitchen', 'Other']

export interface ParEntry {
  par: number
  onHand: number
}

// Catalog is per-concept; flags/pars are per-store.
const conceptKey = () => `${useScope.getState().currentConcept}|*::catalog:items`
const storeKey = (k: string) => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}

export const getCatalog = (): CatalogItem[] => load(conceptKey(), [])
export const setCatalog = (items: CatalogItem[]): void => save(conceptKey(), items)
export const getFlags = (): Record<string, boolean> => load(storeKey('catalog:flags'), {})
export const setFlags = (f: Record<string, boolean>): void => save(storeKey('catalog:flags'), f)
export const getPars = (): Record<string, ParEntry> => load(storeKey('catalog:pars'), {})
export const setPars = (p: Record<string, ParEntry>): void => save(storeKey('catalog:pars'), p)

export function newItemId(): string {
  return `ci${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}

/**
 * Register an item in the catalog (no duplicates by name). If it already
 * exists, missing cost/vendor/category are filled in rather than duplicated.
 * Returns the catalog item either way.
 */
export function registerItem(input: {
  name: string
  unit?: string
  category?: string
  vendor?: string
  cost?: number
}): CatalogItem {
  const items = getCatalog()
  const want = normKey(input.name)
  // No duplicates, ever: exact name OR a learned alias claims the line.
  const existing = items.find(
    (x) => normKey(x.name) === want || (x.aliases ?? []).some((a) => normKey(a) === want),
  )
  if (existing) {
    let changed = false
    if (input.cost && !existing.cost) {
      existing.cost = input.cost
      existing.costVendor = input.vendor || existing.vendor
      existing.costDate = isoToday()
      changed = true
    }
    if (input.vendor && !existing.vendor) {
      existing.vendor = input.vendor
      changed = true
    }
    if (input.category && (!existing.category || existing.category === 'Other')) {
      existing.category = input.category
      changed = true
    }
    if (changed) setCatalog(items)
    return existing
  }
  const item: CatalogItem = {
    id: newItemId(),
    name: input.name.trim(),
    unit: input.unit || 'cs',
    category: input.category || guessCategory(input.name, input.vendor),
    vendor: input.vendor || '',
    cost: input.cost,
    costVendor: input.cost ? input.vendor : undefined,
    costDate: input.cost ? isoToday() : undefined,
  }
  setCatalog([...items, item])
  return item
}

/** Put an item on / take it off this store's order guide. */
export function setOnGuide(id: string, on: boolean): void {
  setFlags({ ...getFlags(), [id]: on })
}

/** Teach the catalog: this invoice description IS that item. Sticks forever. */
export function addAlias(id: string, alias: string): void {
  const items = getCatalog()
  const it = items.find((x) => x.id === id)
  if (!it) return
  const key = normKey(alias)
  if (!key || normKey(it.name) === key) return
  if ((it.aliases ?? []).some((a) => normKey(a) === key)) return
  it.aliases = [...(it.aliases ?? []), alias.trim()].slice(-12)
  setCatalog(items)
}

/**
 * Set one item's case cost from an invoice line: updates the cost everywhere
 * (Ordering, Inventory, Costs all read it) and feeds the price ticker.
 */
export function setItemCost(id: string, price: number, vendor: string): void {
  if (!(price > 0)) return
  const items = getCatalog()
  const it = items.find((x) => x.id === id)
  if (!it) return
  const oldCost = it.cost
  if (oldCost === price) return
  it.cost = price
  it.costVendor = vendor
  it.costDate = isoToday()
  setCatalog(items)
  const pct = oldCost && oldCost > 0 ? ((price - oldCost) / oldCost) * 100 : undefined
  if (pct != null && Math.abs(pct) >= 0.5) {
    const log = getPriceLog()
    save(conceptKey().replace('catalog:items', 'catalog:priceLog'), [
      { name: it.name, oldCost, newCost: price, pct, vendor, date: isoToday() },
      ...log,
    ].slice(0, 40))
  }
}

/** Normalized identity key: lowercase, punctuation-free, spacing collapsed. */
export function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Vendor price import (handoff spec): match lines by name, update the case
 * cost everywhere, stamp vendor + date, and report each % change. Lines that
 * miss come back so the screen can offer one-tap Add.
 */
export function updatePrices(
  lines: Array<{ name: string; price: number }>,
  vendor: string,
): { changes: Array<{ name: string; oldCost?: number; newCost: number; pct?: number }>; misses: Array<{ name: string; price: number }> } {
  const items = getCatalog()
  const changes: Array<{ name: string; oldCost?: number; newCost: number; pct?: number }> = []
  const misses: Array<{ name: string; price: number }> = []
  for (const line of lines) {
    if (!line.name || !(line.price > 0)) continue
    const hit = fuzzyFind(line.name, items)
    if (!hit) {
      misses.push(line)
      continue
    }
    const oldCost = hit.cost
    hit.cost = line.price
    hit.costVendor = vendor
    hit.costDate = isoToday()
    changes.push({
      name: hit.name,
      oldCost,
      newCost: line.price,
      pct: oldCost && oldCost > 0 ? ((line.price - oldCost) / oldCost) * 100 : undefined,
    })
  }
  if (changes.length) {
    setCatalog(items)
    // Feed the Orders price ticker — real changes only, capped.
    const log = getPriceLog()
    const stamped = changes
      .filter((c) => c.pct != null && Math.abs(c.pct) >= 0.5)
      .map((c) => ({ ...c, vendor, date: isoToday() }))
    save(conceptKey().replace('catalog:items', 'catalog:priceLog'), [...stamped, ...log].slice(0, 40))
  }
  return { changes, misses }
}

export interface PriceChange {
  name: string
  oldCost?: number
  newCost: number
  pct?: number
  vendor: string
  date: string
}
export const getPriceLog = (): PriceChange[] =>
  load(conceptKey().replace('catalog:items', 'catalog:priceLog'), [])

/** Case-insensitive word-overlap match against catalog names + learned aliases. */
export function fuzzyFind(name: string, items: CatalogItem[] = getCatalog()): CatalogItem | null {
  // Learned aliases and exact names win outright.
  const key = normKey(name)
  const exact = items.find(
    (x) => normKey(x.name) === key || (x.aliases ?? []).some((a) => normKey(a) === key),
  )
  if (exact) return exact
  const words = norm(name)
  if (words.size === 0) return null
  let best: CatalogItem | null = null
  let bestScore = 0
  for (const it of items) {
    const iw = norm(it.name)
    if (iw.size === 0) continue
    let shared = 0
    words.forEach((w) => iw.has(w) && shared++)
    const score = shared / Math.min(words.size, iw.size)
    if (score > bestScore) {
      bestScore = score
      best = it
    }
  }
  return bestScore >= 0.5 ? best : null
}

export function guessCategory(name: string, vendor = ''): string {
  const s = `${name} ${vendor}`.toLowerCase()
  if (/produce|lettuce|tomato|onion|romaine|avocado|lemon|lime|basil|cilantro|pepper|fruit|berry/.test(s)) return 'Produce'
  if (/vodka|tequila|whiskey|bourbon|rum|gin|liqueur|liquor/.test(s)) return 'Liquor'
  if (/beer|ipa|lager|ale|pilsner|seltzer/.test(s)) return 'Beer'
  if (/napkin|to.?go|cup|lid|straw|foil|film|glove|paper|towel|chem/.test(s)) return 'Paper / Supply'
  if (/chicken|beef|pork|shrimp|cheese|fries|bun|bread|sauce|bacon|burger/.test(s)) return 'Food'
  return 'Other'
}

function norm(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )
}
function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
