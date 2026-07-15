// Start-fresh helpers (admin-only, behind a confirm). Two scopes:
//  - clearImportedNumbers(): zero everything that comes from dropping reports —
//    sales, product mix, category mix, invoices, prices, received/usage, and the
//    import history + duplicate-file memory. KEEPS the owner's setup (count
//    sheets, order guides, roster, recipes, checklists, targets, tracked items).
//  - fullResetStore(): wipe every key for the current store + its concept's
//    shared catalog, back to the owner's fresh baked setup (seeds re-run empty).
// Both operate on the CURRENT store only. Export a backup first.
import { useScope } from './scope'

const NS = 'mugops:'

/** Store keys (suffixes) whose contents are produced by importing reports. */
const REPORT_SUFFIXES = [
  'nightly:log', // sales nights (imported + seeded last-year)
  'nightly:catmix', // sales-category mix
  'pmix:days', // product mix
  'invoices:list', // filed invoices
  'receipts:log', // ordering "received / usage"
  'imports:history', // the import log
  'imports:fileHashes', // duplicate-file memory (so re-drops aren't skipped)
]

function prefixes() {
  const s = useScope.getState()
  return {
    store: `${NS}${s.currentConcept}|${s.currentLocation}::`,
    concept: `${NS}${s.currentConcept}|`, // catches both `store::` and `*::catalog` keys
    catalog: `${NS}${s.currentConcept}|*::catalog:items`,
    priceLog: `${NS}${s.currentConcept}|*::catalog:priceLog`,
  }
}

/** Zero the numbers, keep the setup. Reload after calling to refresh the UI. */
export function clearImportedNumbers(): void {
  const p = prefixes()
  for (const suf of REPORT_SUFFIXES) localStorage.removeItem(p.store + suf)
  // Strip invoice/price-sheet-set costs off the (concept-shared) catalog and
  // clear the price ticker, so a re-imported invoice visibly re-sets the price.
  try {
    const raw = localStorage.getItem(p.catalog)
    if (raw) {
      const items = JSON.parse(raw)
      if (Array.isArray(items)) {
        for (const it of items) {
          delete it.cost
          delete it.costVendor
          delete it.costDate
        }
        localStorage.setItem(p.catalog, JSON.stringify(items))
      }
    }
  } catch {
    /* leave the catalog as-is if it can't be parsed */
  }
  localStorage.removeItem(p.priceLog)
}

/** Wipe the current store (and its concept's shared catalog) back to blank.
 *  On reload the owner's structural seeds (count sheet, order guide) re-run
 *  empty of any counts. Reload after calling. */
export function fullResetStore(): void {
  const p = prefixes()
  const kill: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(p.concept)) kill.push(k)
  }
  for (const k of kill) localStorage.removeItem(k)
}
