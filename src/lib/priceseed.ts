// Prices off the paper: a shipped invoice becomes real costs in the catalog.
//
// Beau hands over receipts faster than anyone is going to key them in, and a
// bottle price that only exists on paper can't cost a drink, price a menu or
// tell him when a case went up 12%. This takes the lines transcribed from a
// vendor's receipt and writes them where every screen already reads from.
//
// Each line names the catalog item it belongs to, because the bar's names and
// the vendor's are not the same string — "Two Fingers White (house)" is
// "TWO FINGERS / WHITE TEQUILA / 750ml" on the receipt. The vendor's spelling
// is kept as an alias, so the next import of that receipt matches on its own.

import { load, save } from './store'
import { useScope } from './scope'
import {
  getCatalog,
  registerItem,
  setItemCost,
  setOnGuide,
  updateItem,
  addAlias,
  normKey,
} from './catalog'
import { placeItemInGuide, getGuideSections } from './guide'
import LIQUOR_PRICES from '../data/liquor-prices-lincoln-road.json'

interface PriceLine {
  code: string
  receipt: string
  item: string
  size: string
  price: number
}

const scoped = (k: string) => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}

/**
 * Liquor prices from the Lincoln Road Package Store receipts.
 *
 * Runs once per store (prices themselves are concept-level and shared, so a
 * second run is a no-op — setItemCost returns early when the price hasn't
 * moved, and nothing lands in the price ticker).
 *
 * An item already in the catalog keeps its name, its par and its place on the
 * guide and gains the price, the vendor's item code and the bottle size. One
 * that isn't there yet is created and dropped into the right section of the
 * liquor guide. Nothing is ever removed here.
 */
export function seedLiquorPrices(): void {
  const key = scoped('guide:seeded:liquorprices')
  if (load<string>(key, '') === 'v1') return
  const { vendor, lines } = LIQUOR_PRICES as { vendor: string; lines: PriceLine[] }
  const onGuide = new Set(getGuideSections('Liquor').flatMap((s) => s.ids))

  for (const line of lines) {
    const want = normKey(line.item)
    const existing = getCatalog().find(
      (c) => normKey(c.name) === want || (c.aliases ?? []).some((a) => normKey(a) === want),
    )
    const ci =
      existing ??
      registerItem({
        name: line.item,
        unit: 'btl',
        category: 'Liquor',
        vendor,
        cost: line.price,
        code: line.code,
        size: line.size,
      })

    // The price is the point. setItemCost feeds the ticker and stamps the date.
    setItemCost(ci.id, line.price, vendor)
    // Fill in what the receipt knows and the catalog doesn't. The vendor is
    // only set when the item has none — an item already assigned to a
    // distributor is not re-assigned by a price capture.
    updateItem(ci.id, {
      code: ci.code || line.code,
      size: ci.size || line.size,
      vendor: ci.vendor || vendor,
    })
    // Teach the reader the vendor's spelling for the next invoice import.
    addAlias(ci.id, line.receipt)

    // New to this store's guide → put it where it belongs. Items already on
    // the guide are left exactly where the owner dragged them.
    if (!onGuide.has(ci.id)) {
      setOnGuide(ci.id, true)
      placeItemInGuide('Liquor', ci.id, ci.name)
    }
  }
  save(key, 'v1')
}
