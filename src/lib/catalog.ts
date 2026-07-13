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
  const existing = items.find((x) => x.name.toLowerCase() === input.name.toLowerCase())
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
  if (changes.length) setCatalog(items)
  return { changes, misses }
}

/** Case-insensitive word-overlap match against catalog names. */
export function fuzzyFind(name: string, items: CatalogItem[] = getCatalog()): CatalogItem | null {
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
