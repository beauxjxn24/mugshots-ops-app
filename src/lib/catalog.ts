// The Item Catalog — THE master item list (handoff spec, Item Catalog steps
// 1–3): every item lives here exactly once. It is CONCEPT-level (shared by all
// of a concept's stores); each store keeps its own on/off guide flags and
// par/on-hand counts. Everything that adds an item anywhere registers it here.
import { load, save } from './store'
import { useScope } from './scope'
import { cleanItemLine, tidyName } from './clean'
import { getCountSheet, setCountSheet, newCountId } from './countsheet'

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
  /** Vendor item code (order guides print it before the name). */
  code?: string
  /** Pack size (750ml, 4/5LB, 24 ct…). */
  size?: string
}

export const SHELVES = ['Produce', 'Liquor', 'Beer', 'Food', 'Paper / Supply', 'Kitchen', 'Other']

export interface ParEntry {
  par: number
  onHand: number
  /**
   * The second par, for an item ordered twice a week to different levels.
   *
   * The paper produce guide prints two columns — M-PAR and F-PAR — because a
   * Monday delivery has to last until Friday's and a Friday one has to cover
   * the weekend, which are not the same amount of tomatoes. `par` is the
   * Monday number and stays the only one most items ever have; this is set
   * only where a sheet actually prints a second column.
   */
  parF?: number
}

// Catalog is per-concept; flags/pars are per-store.
const conceptKey = () => `${useScope.getState().currentConcept}|*::catalog:items`
const storeKey = (k: string) => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}

export const getCatalog = (): CatalogItem[] => {
  const raw = load<CatalogItem[]>(conceptKey(), [])
  if (!Array.isArray(raw)) return []
  // Never let a corrupt/legacy item (missing name/id) crash a page that maps it.
  return raw
    .filter((it) => it && typeof it === 'object' && it.id)
    .map((it) => ({
      ...it,
      name: typeof it.name === 'string' ? it.name : '',
      unit: typeof it.unit === 'string' ? it.unit : 'cs',
      category: typeof it.category === 'string' ? it.category : 'Other',
      vendor: typeof it.vendor === 'string' ? it.vendor : '',
    }))
}
export const setCatalog = (items: CatalogItem[]): void => save(conceptKey(), items)
export const getFlags = (): Record<string, boolean> => load(storeKey('catalog:flags'), {})
export const setFlags = (f: Record<string, boolean>): void => save(storeKey('catalog:flags'), f)
export const getPriceLog = (): PriceChange[] =>
  load(conceptKey().replace('catalog:items', 'catalog:priceLog'), [])

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
  code?: string
  size?: string
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
    if (input.code && !existing.code) {
      existing.code = input.code
      changed = true
    }
    if (input.size && !existing.size) {
      existing.size = input.size
      changed = true
    }
    if (changed) setCatalog(items)
    return existing
  }
  const item: CatalogItem = {
    id: newItemId(),
    name: tidyName(input.name.trim()),
    unit: input.unit || 'cs',
    category: input.category || guessCategory(input.name, input.vendor),
    vendor: input.vendor || '',
    cost: input.cost,
    costVendor: input.cost ? input.vendor : undefined,
    costDate: input.cost ? isoToday() : undefined,
    code: input.code,
    size: input.size,
    // Remember the raw spelling so re-drops of the same doc match exactly.
    aliases: tidyName(input.name.trim()) !== input.name.trim() ? [input.name.trim()] : undefined,
  }
  setCatalog([...items, item])
  return item
}

/**
 * One-time repair: OCR noise that reached the catalog before line cleaning
 * existed gets scrubbed in place — junk chars out, vendor code split off,
 * shouty names tidied. Old spellings become aliases so nothing re-duplicates.
 */
export function cleanupCatalogNames(): void {
  const FLAG = 'mugops:__catalogNamesCleaned3'
  if (localStorage.getItem(FLAG)) return
  const items = getCatalog()
  let changed = false
  for (const it of items) {
    const c = cleanItemLine(it.name)
    const fresh = tidyName(c.name)
    if (fresh && fresh !== it.name) {
      it.aliases = [...new Set([...(it.aliases ?? []), it.name])].slice(-12)
      it.name = fresh
      changed = true
    }
    if (c.code && !it.code) {
      it.code = c.code
      changed = true
    }
    if (c.size && !it.size) {
      it.size = c.size
      changed = true
    }
    const better = guessCategory(it.name, it.vendor)
    if ((!it.category || it.category === 'Other') && better !== 'Other') {
      it.category = better
      changed = true
    }
  }
  if (changed) setCatalog(items)
  localStorage.setItem(FLAG, '1')
}

/** Put an item on / take it off this store's order guide. */
export function setOnGuide(id: string, on: boolean): void {
  setFlags({ ...getFlags(), [id]: on })
}

/** Teach the catalog: this invoice description IS that item. Sticks forever. */
/**
 * Fix an item's spelling anywhere it shows. The old (often OCR-garbled) name
 * is kept as an alias, so future invoice lines that read the same way still
 * match this item — renaming teaches the reader.
 */
export function renameItem(id: string, newName: string): void {
  const items = getCatalog()
  const it = items.find((x) => x.id === id)
  const name = newName.trim()
  if (!it || !name || it.name === name) return
  const old = it.name
  it.name = name
  const oldKey = normKey(old)
  if (oldKey && oldKey !== normKey(name) && !(it.aliases ?? []).some((a) => normKey(a) === oldKey)) {
    it.aliases = [...(it.aliases ?? []), old].slice(-12)
  }
  setCatalog(items)
}

/** Assign an item's vendor (who it's ordered from) — drives per-vendor order
 *  lists on the guide, e.g. beer split between Capital City and Southern. */
export function setItemVendor(id: string, vendor: string): void {
  const items = getCatalog()
  const it = items.find((x) => x.id === id)
  if (!it) return
  const v = vendor.trim()
  if (it.vendor === v) return
  it.vendor = v
  setCatalog(items)
}

/**
 * Edit a whole item at once.
 *
 * The pencil renamed and nothing else, so a wrong unit, vendor, pack size or
 * price meant deleting the item and adding it back — which throws away the
 * aliases that stop every future invoice matching it as a brand new item.
 *
 * Name and cost still go through their own paths rather than being written
 * flat, so a rename keeps the old spelling as an alias and a price change still
 * lands in the ticker. Only fields actually passed are touched.
 */
export function updateItem(
  id: string,
  patch: Partial<Pick<CatalogItem, 'name' | 'unit' | 'category' | 'vendor' | 'code' | 'size' | 'cost'>>,
): void {
  const before = getCatalog().find((x) => x.id === id)
  if (!before) return

  if (patch.name != null) renameItem(id, patch.name)

  // Re-priced, or re-measured? Switching an item from the case to the bottle
  // drops the number by most of its value without anything having got cheaper,
  // and putting that in the price ticker as an 80% fall is a false alarm on the
  // one screen that exists to catch real ones. A cost that moves alongside its
  // unit is written straight in; a cost that moves on its own is news.
  const unitChanged = patch.unit != null && patch.unit.trim() !== (before.unit ?? '')
  if (patch.cost != null && patch.cost > 0 && !unitChanged)
    setItemCost(id, patch.cost, patch.vendor?.trim() || before.vendor)

  const items = getCatalog()
  const it = items.find((x) => x.id === id)
  if (!it) return
  let touched = false
  const set = (key: 'unit' | 'category' | 'vendor' | 'code' | 'size', v: string | undefined) => {
    if (v == null) return
    const s = v.trim()
    if ((it[key] ?? '') === s) return
    if (s) it[key] = s
    else delete it[key]
    touched = true
  }
  set('unit', patch.unit)
  set('category', patch.category)
  set('vendor', patch.vendor)
  set('code', patch.code)
  set('size', patch.size)

  // The re-measured case from above: the new cost still has to land, it just
  // doesn't go in the ticker.
  if (unitChanged && patch.cost != null && patch.cost > 0 && it.cost !== patch.cost) {
    it.cost = patch.cost
    it.costVendor = patch.vendor?.trim() || it.vendor
    it.costDate = isoToday()
    touched = true
  }

  // Emptying the price is a real edit — setItemCost only ever writes one in, so
  // clearing has to happen here or a wrong cost could never be taken back out.
  if (patch.cost === 0 && it.cost != null) {
    delete it.cost
    delete it.costVendor
    delete it.costDate
    touched = true
  }
  if (touched) setCatalog(items)
}

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

/** Normalized identity key: lowercase, accent- and punctuation-free, spacing collapsed. */
export function normKey(s: string): string {
  // Accents come off first, or the punctuation strip splits "Jalapeños" into
  // "jalape os" and a vendor line spelling it "Jalapenos" imports as a second
  // item. Only ever computed for comparison, never stored, so widening it
  // cannot orphan anything already saved.
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  if (
    /vodka|tequila|whisk(e)?y|bourbon|scotch|rum|gin|liqueur|liquor|mezcal|brandy|cognac|schnapps|triple sec|amaretto|irish cream|blanco|reposado|anejo|añejo|chardonnay|cabernet|merlot|pinot|sauvignon|moscato|riesling|prosecco|champagne|sangria|wine|750\s?ml?|1\.75\s?l/.test(
      s,
    )
  )
    return 'Liquor'
  if (/beer|ipa|lager|ale|pilsner|seltzer|coors|budweiser|bud light|miller|michelob|corona|modelo|dos equis|yuengling|blue moon/.test(s)) return 'Beer'
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

// ============================================================
// Destinations — the catalog is the hub. Order-guide membership is the existing
// per-store flag (getFlags / setOnGuide). These push an item into (or pull it
// out of) the other systems that keep their own lists: the Prep sheet and the
// Inventory count sheet. All keyed by normalized name so they stay in step with
// the catalog even after a spelling fix.
// ============================================================
interface PrepItemLite {
  name: string
  spec: string
  unit: string
  pars: number[]
  section?: string
  station?: string
  parked?: boolean
}
function prepKey(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::prep:items`
}
const getPrep = (): PrepItemLite[] => {
  const r = load<PrepItemLite[]>(prepKey(), [])
  return Array.isArray(r) ? r : []
}
const setPrep = (v: PrepItemLite[]): void => save(prepKey(), v)

/** Every prep item on this store's sheet — used to resolve line-build
 *  components against what the kitchen actually preps. */
export const prepItemNames = (): string[] => getPrep().filter((p) => !p.parked).map((p) => p.name)

/** The bar's own prep sheet, so drink builds resolve against what the bar preps. */
export const barPrepNames = (): string[] => {
  const s = useScope.getState()
  const r = load<{ name?: string }[]>(`${s.currentConcept}|${s.currentLocation}::barprep:items`, [])
  return Array.isArray(r) ? r.map((x) => (typeof x?.name === 'string' ? x.name : '')).filter(Boolean) : []
}

export function isInPrep(name: string): boolean {
  const k = normKey(name)
  return getPrep().some((p) => normKey(p.name) === k)
}
/** Put an item on the Prep sheet (pars start at 0 so it doesn't clutter Today's
 *  Prep until a manager sets them). Reviving a parked one instead of dup-ing. */
export function addToPrep(item: { name: string; unit?: string }): void {
  const k = normKey(item.name)
  const list = getPrep()
  const ex = list.find((p) => normKey(p.name) === k)
  if (ex) {
    if (ex.parked) setPrep(list.map((p) => (p === ex ? { ...p, parked: false } : p)))
    return
  }
  setPrep([...list, { name: item.name, spec: '', unit: item.unit || 'pans', pars: [0, 0, 0, 0, 0, 0, 0], section: 'Recipes' }])
}
export function removeFromPrep(name: string): void {
  const k = normKey(name)
  setPrep(getPrep().filter((p) => normKey(p.name) !== k))
}

export function isInInventory(name: string): boolean {
  const k = normKey(name)
  return getCountSheet().some((c) => normKey(c.name) === k)
}
export function addToInventory(item: { name: string; unit?: string; category?: string }): void {
  const k = normKey(item.name)
  if (getCountSheet().some((c) => normKey(c.name) === k)) return
  setCountSheet([
    ...getCountSheet(),
    { id: newCountId(), location: item.category || 'General', name: item.name, units: [{ uom: item.unit || 'ea', qty: 0 }] },
  ])
}
export function removeFromInventory(name: string): void {
  const k = normKey(name)
  setCountSheet(getCountSheet().filter((c) => normKey(c.name) !== k))
}

/** Existing catalog items whose name collides or nearly collides with a
 *  candidate — same normalized key, or one name contains the other. Surfaced
 *  while adding so duplicate / "like" names never get created by accident. */
export function findSimilar(name: string, excludeId?: string): CatalogItem[] {
  const k = normKey(name)
  if (!k || k.length < 3) return []
  return getCatalog()
    .filter((it) => {
      if (it.id === excludeId) return false
      const ik = normKey(it.name)
      return ik === k || (k.length >= 4 && (ik.includes(k) || k.includes(ik)))
    })
    .slice(0, 4)
}
