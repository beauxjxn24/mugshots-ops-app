import raw from '../data/specs.json'
import type { Spec } from './types'

export const SPECS = raw as Spec[]

/**
 * The live menu — everything guests can order today.
 *
 * Screens that answer "what do we sell" read this; Specs reads the full SPECS
 * so an archived card can still be looked up, which is the point of archiving
 * rather than deleting.
 */
export const ACTIVE_SPECS = SPECS.filter((s) => !s.off)

/** OG — off the menu, still cooked on request. */
export const OG_SPECS = SPECS.filter((s) => s.og)

/**
 * Category order for the Specs screen — the order the menu reads in.
 *
 * The core menu first, then the limited-time items together (they used to sit
 * eight categories apart, which is how the same LTO could be looked for twice),
 * then drinks, then Prep last: prep is the component library behind all of it
 * rather than something anyone orders.
 */
export const GROUP_ORDER = [
  'Burger Builds',
  'Sandwich & Wrap Builds',
  'Hot Dog Builds',
  'Salad & Bowl Builds',
  'Pasta & Plate Builds',
  'Appetizer Builds',
  'Kids Builds',
  'Dessert Builds',
  'LTO Builds',
  'Summer LTO',
  'Pairings',
  'Shakes',
  'Frozen Drinks',
  'Prep',
]

export function groups(): string[] {
  const seen = new Set(SPECS.map((s) => s.g))
  const ordered = GROUP_ORDER.filter((g) => seen.has(g))
  const extras = [...seen].filter((g) => !GROUP_ORDER.includes(g))
  return [...ordered, ...extras]
}

export function slug(g: string): string {
  return g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function search(query: string): Spec[] {
  const q = query.trim().toLowerCase()
  if (!q) return SPECS
  return SPECS.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.g.toLowerCase().includes(q) ||
      s.ing.some(([n]) => n.toLowerCase().includes(q)),
  )
}

/**
 * The prep sheet writes in kitchen shorthand — "Diced Toms", "PJ Wedges",
 * "Sliced Jals" — while the spec cards carry full names. Only 12 of the 49 prep
 * items matched by name, so tapping an item mostly went nowhere.
 *
 * Hand-checked rather than fuzzy-matched: loose matching paired "Boneless
 * Wangs" with "Blanched Wings", which are different products, and a cook
 * following the wrong card is worse than a name that doesn't link.
 */
const PREP_SHORTHAND: Record<string, string> = {
  'Diced Toms': 'Diced Tomatoes',
  'Sliced Toms': 'Sliced Tomatoes',
  'Dice Yellow Onions': 'Diced Onions',
  'Pico De Gallo': 'Pico de Gallo',
  'Garlic Parm Chz': 'Garlic Parmesan Sauce',
  'Pimento Chz': 'Pimento Cheese',
  Romaine: 'Romaine Lettuce (chopped)',
  'Shredded Lettuce': 'Iceberg Lettuce (chopped)',
  'Alfredo Sauce': 'Alfredo',
  Eggroll: 'Egg Rolls',
  'Pow Pow Sauce': 'Pow Pow Shrimp Sauce',
  Ranch: 'Ranch Dressing',
  'Mugs Sig Sauce': 'Mugs Signature Sauce',
  'Mozz Wedges': 'Mozzarella Wedges',
  'PJ Wedges': 'Pepperjack Cheese Wedges',
  Pasta: 'New Pasta',
  Wings: 'Blanched Wings',
  'Sliced Jals': 'Sliced Jalapeños',
  'Brined Tenders': 'Brined Chicken Tenders',
  'Brined Breast': 'Brined Chicken Breast',
  'Blackened Ckn Tenders': 'Blackened Chicken Tenders',
  'Caitlyn Ckn Breasts': 'Blackened Chicken Breast',
  'Queso Meat': 'Mugshots Queso Dip',
  'Mac & Chz': 'Kid Mac',
  Mash: 'Mashed Potatoes',
  Veggies: 'Veggie Mix',
  Rotel: 'Rotel Cheese Sauce',
}

/**
 * The spec card for a prep-sheet item, or undefined when there isn't one.
 *
 * Undefined is a real answer — onion strings, tots and bacon have no prep card,
 * and those items should read as plain text rather than as a link into nothing.
 */
export function prepSpecName(prepItem: string): string | undefined {
  const direct = SPECS.find((s) => s.name === prepItem)
  if (direct) return direct.name
  const mapped = PREP_SHORTHAND[prepItem]
  return mapped && SPECS.some((s) => s.name === mapped) ? mapped : undefined
}
